# Roleplay Chatbot — Implementation Plan

A single-deploy Next.js app on Vercel with Supabase for auth + data and OpenRouter for the LLM. Google-only sign-in, gated by invite codes. Persistent per-chat memory via rolling summaries and pinned facts.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | One project for FE + API routes, fits Vercel free tier |
| Hosting | Vercel Hobby | Free, zero-config for Next.js, edge + serverless |
| DB + Auth | Supabase (free tier) | Postgres, Google OAuth, RLS as the access layer |
| LLM | OpenRouter free models | `deepseek/deepseek-chat-v3.1:free` (fast dev), `meta-llama/llama-3.3-70b-instruct:free` (better persona) |
| Streaming | Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`) | Token streaming from OpenRouter |
| Supabase client | `@supabase/ssr` | Cookie-based sessions across server + client components |

### Architecture decision: monorepo, no separate API service
The FE talks to Supabase **directly** for CRUD (RLS enforces security). A small set of Next.js API routes exist only for things that need the OpenRouter key or privileged DB ops:
- `POST /api/chat` — streams assistant tokens, persists messages, fires summarizer
- `POST /api/redeem-invite` — wraps a `SECURITY DEFINER` Postgres function

Everything else (list characters, read messages, create chats) goes through `supabase-js` from server components or the browser.

---

## 2. Auth flow

### Google-only sign-in
- Supabase Auth → enable Google provider only, disable email/password
- Google Cloud Console → OAuth client + consent screen, redirect URI = Supabase callback
- Client call: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`

### Invite-code gating
Supabase has no native invite system, so we layer it on:

**Schema**
```sql
create table invite_codes (
  code        text primary key,
  created_by  uuid references auth.users(id),
  used_by     uuid references auth.users(id),
  used_at     timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz default now()
);

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  invite_code  text references invite_codes(code),
  created_at   timestamptz default now()
);
```

**Redemption (atomic, server-side)**
```sql
create or replace function redeem_invite(p_code text)
returns void language plpgsql security definer as $$
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    return;
  end if;
  update invite_codes
     set used_by = auth.uid(), used_at = now()
   where code = p_code
     and used_by is null
     and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'invalid_or_used_code';
  end if;
  insert into profiles (id, invite_code) values (auth.uid(), p_code);
end $$;
```

**User flow**
1. `/login` page — input for invite code + "Sign in with Google" button. Code stashed in `sessionStorage` (and `?code=` URL param as backup).
2. Google OAuth round-trip → Supabase creates `auth.users` row, returns to `/auth/callback`.
3. Callback reads stashed code, calls `/api/redeem-invite`. On success → `/characters`. On failure → `/redeem` page with error.
4. `middleware.ts` enforces: authed user without a `profiles` row can only access `/redeem` and `/api/redeem-invite`. Everything else redirects.

**Code generation (v1)**
Manual via SQL editor: `insert into invite_codes (code) values ('FRIEND-ABC123');`. Admin UI later if needed.

**Orphan cleanup**
Authed-but-no-profile users sit in `auth.users` until they redeem. Acceptable for v1; add a cron later if it grows.

---

## 3. Data model

```sql
characters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  persona     text not null,        -- system prompt body
  greeting    text,                 -- first assistant message
  scenario    text,                 -- optional scene-setting
  model       text default 'deepseek/deepseek-chat-v3.1:free',
  created_at  timestamptz default now()
);

chats (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  title        text,
  created_at   timestamptz default now()
);

messages (
  id         bigserial primary key,
  chat_id    uuid not null references chats(id) on delete cascade,
  role       text not null check (role in ('user','assistant','system')),
  content    text not null,
  created_at timestamptz default now()
);
create index on messages (chat_id, id);

memories (
  id         bigserial primary key,
  chat_id    uuid not null references chats(id) on delete cascade,
  kind       text not null check (kind in ('summary','fact')),
  content    text not null,
  created_at timestamptz default now()
);
create index on memories (chat_id, kind, id);
```

### RLS policies
Enable RLS on every table. Pattern:

```sql
-- characters / chats: owner-only
create policy "own rows" on characters
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- messages / memories: through chat ownership
create policy "own chat rows" on messages
  for all using (
    exists (select 1 from chats c where c.id = chat_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from chats c where c.id = chat_id and c.user_id = auth.uid())
  );

-- profiles: read own, update own
create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- invite_codes: no client access (server only via SECURITY DEFINER fn)
-- (RLS on, no policies = locked)
```

---

## 4. Memory strategy

Free models have small context windows; roleplay needs continuity. Three layers, assembled fresh on every turn:

1. **System prompt** — character `persona` + `scenario`. Always sent.
2. **Pinned facts** — durable extracted facts ("user's name is Alex", "they promised to meet at the docks"). All `memories.kind='fact'` rows for the chat, joined into the system prompt.
3. **Rolling summary** — single `memories.kind='summary'` row (replaced as it grows), covering everything older than the recent window.
4. **Recent window** — last N messages verbatim (start with N=20).

### Prompt assembly (per turn)
```
[system]
<persona>
<scenario>

KNOWN FACTS:
- <fact 1>
- <fact 2>

PRIOR EVENTS (summary):
<rolling summary>

[messages]
<last N messages>
[user] <new message>
```

### Summarization trigger
After persisting an assistant reply, if `count(messages) > THRESHOLD` (e.g. 30) and `messages_since_last_summary > 10`:
- Fire-and-forget background call (`waitUntil` from `@vercel/functions`)
- Second OpenRouter call with messages older than the recent window + previous summary → produces new summary
- Same call also extracts new facts (structured JSON, `kind='fact'` rows)
- Writes new summary (replacing prior), inserts new fact rows

Keeps the user-visible turn fast; memory consolidation happens async.

### Cost / rate-limit notes
OpenRouter free models are rate-limited. Summarizer uses the same free model — accept occasional failure, retry on next turn. Don't block the user reply on it.

---

## 5. Routes & UI

```
app/
  (marketing)/
    page.tsx                    landing — "enter invite code" + sign-in
  (auth)/
    login/page.tsx              same as landing if not authed
    auth/callback/route.ts      OAuth return handler
    redeem/page.tsx             enter/re-enter invite code
  (app)/
    characters/page.tsx         list + create character
    characters/[id]/page.tsx    edit character
    chat/page.tsx               list of chats
    chat/[chatId]/page.tsx      streaming chat UI
  api/
    chat/route.ts               POST: stream assistant reply
    redeem-invite/route.ts      POST: invoke redeem_invite RPC
middleware.ts                   auth + profile gate
lib/
  supabase/client.ts            browser client
  supabase/server.ts            server-component / route-handler client
  supabase/middleware.ts        session refresh helper
  openrouter.ts                 model client + model registry
  memory.ts                     prompt assembly + summarizer
  prompts.ts                    summarizer + fact-extractor prompts
```

### Chat UI
- Server component fetches chat + recent messages + character on load
- Client component handles streaming via `useChat` from Vercel AI SDK pointed at `/api/chat`
- On submit: optimistic user bubble, stream assistant tokens, persistence happens server-side inside the route

### `/api/chat` flow
1. Auth check (Supabase server client)
2. Validate `chat_id` ownership
3. Load character, facts, summary, last N messages
4. Insert new user message
5. Build prompt, stream from OpenRouter
6. On stream end: insert assistant message, `waitUntil(maybeSummarize(chat_id))`

---

## 6. Vercel free-tier constraints

- **10s function timeout (Hobby)** — must stream so the function returns once tokens flow. Use Node runtime with streaming response, not buffered.
- **Background work** — `waitUntil` from `@vercel/functions` keeps the summarizer running after the response finishes (within plan limits).
- **Env vars** — `OPENROUTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (only if needed; prefer RPC). Never expose service role to client.
- **Supabase free tier pauses after 7 days inactivity** — fine for personal use, document for users.

---

## 7. Build order

1. **Scaffold** — `create-next-app`, Tailwind, Supabase project, env vars, deploy a "hello world" to Vercel
2. **Auth** — Google OAuth in Supabase, login page, callback handler, middleware skeleton
3. **Schema + RLS** — migrations file, run via Supabase SQL editor or CLI
4. **Invite gate** — `redeem_invite` function, redeem page, middleware enforcement, manual code insert
5. **Characters CRUD** — list, create, edit pages talking to Supabase directly
6. **Chats list + create** — pick a character, start a chat
7. **Basic streaming chat** — `/api/chat` with no memory yet, just persona + full message history
8. **Memory v1** — recent-window truncation only
9. **Memory v2** — rolling summary in `waitUntil`
10. **Memory v3** — fact extraction
11. **Polish** — chat titles auto-generated, delete buttons, mobile layout
12. **Deploy** — production env vars, Google OAuth production redirect URI, smoke test

---

## 8. Open questions / deferred

- **Admin UI for invite codes** — SQL-only for v1
- **Per-character model selection** — schema supports it; UI later
- **Image / avatar upload** — Supabase Storage, not in v1
- **Multiple personas per chat / group chat** — out of scope
- **Token usage tracking** — OpenRouter returns it; log to a table only if needed
- **Export chat** — easy to add later (markdown dump of messages)

---

## 9. Main tradeoff to revisit

**DeepSeek vs Llama 3.3 70B for default model.** DeepSeek is faster and less rate-limited; Llama 3.3 70B has noticeably better character voice. Start with DeepSeek for dev iteration; expose model selection per character early so you can A/B during testing.
