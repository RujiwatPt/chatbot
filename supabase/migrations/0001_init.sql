-- Roleplay chatbot — initial schema, RLS, and invite-redemption RPC.
-- Run via Supabase SQL editor (or `supabase db push` if using the CLI).

set search_path = public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists invite_codes (
  code        text primary key,
  created_by  uuid references auth.users(id),
  used_by     uuid references auth.users(id),
  used_at     timestamptz,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  invite_code  text references invite_codes(code),
  created_at   timestamptz not null default now()
);

create table if not exists characters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  persona     text not null,
  greeting    text,
  scenario    text,
  model       text not null default 'deepseek/deepseek-chat-v3.1:free',
  created_at  timestamptz not null default now()
);
create index if not exists characters_user_id_idx on characters (user_id);

create table if not exists chats (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  title        text,
  created_at   timestamptz not null default now()
);
create index if not exists chats_user_id_idx on chats (user_id);

create table if not exists messages (
  id         bigserial primary key,
  chat_id    uuid not null references chats(id) on delete cascade,
  role       text not null check (role in ('user','assistant','system')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_id_idx on messages (chat_id, id);

create table if not exists memories (
  id         bigserial primary key,
  chat_id    uuid not null references chats(id) on delete cascade,
  kind       text not null check (kind in ('summary','fact')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists memories_chat_id_kind_idx on memories (chat_id, kind, id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table invite_codes enable row level security;
alter table profiles     enable row level security;
alter table characters   enable row level security;
alter table chats        enable row level security;
alter table messages     enable row level security;
alter table memories     enable row level security;

-- invite_codes: no client policies — only the SECURITY DEFINER fn can touch it.

-- profiles: own row
drop policy if exists "profiles_self" on profiles;
create policy "profiles_self" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- characters: owner only
drop policy if exists "characters_owner" on characters;
create policy "characters_owner" on characters
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- chats: owner only
drop policy if exists "chats_owner" on chats;
create policy "chats_owner" on chats
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- messages: owner-of-chat
drop policy if exists "messages_owner" on messages;
create policy "messages_owner" on messages
  for all using (
    exists (select 1 from chats c where c.id = chat_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from chats c where c.id = chat_id and c.user_id = auth.uid())
  );

-- memories: owner-of-chat
drop policy if exists "memories_owner" on memories;
create policy "memories_owner" on memories
  for all using (
    exists (select 1 from chats c where c.id = chat_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from chats c where c.id = chat_id and c.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Invite redemption: atomically claim a code and create a profile
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from profiles where id = v_uid) then
    return; -- already onboarded; no-op
  end if;

  update invite_codes
     set used_by = v_uid, used_at = now()
   where code = p_code
     and used_by is null
     and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'invalid_or_used_code';
  end if;

  insert into profiles (id, invite_code) values (v_uid, p_code);
end;
$$;

revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;
