# Roleplay Chatbot

Persistent-memory roleplay app built with Next.js + Supabase + OpenRouter.

## Features

- Google OAuth sign-in (open signup, no invite code required)
- Public seed characters available to all users
- User-created private characters
- Character alias support (bot can self-reference by alias, e.g. `Kael`)
- Per-user chat history isolation via Supabase RLS
- Streaming chat responses with stop control and anti-spam cooldown
- Summarization + memory facts to keep long chats coherent

## Tech Stack

- Next.js App Router
- Supabase (Auth, Postgres, RLS)
- Vercel AI SDK + OpenRouter
- Tailwind CSS

## Environment Variables

Create `.env` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENROUTER_API_KEY=
```

Optional:

```bash
OPENROUTER_MODEL=deepseek/deepseek-chat-v3.1:free
OPENROUTER_FALLBACK_MODELS=inclusionai/ling-2.6-1t:free,openai/gpt-oss-120b:free,nvidia/nemotron-3-super-120b-a12b:free
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=Roleplay Chatbot
```

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Database Migrations

Run migrations against your target database:

```bash
supabase migration up
```

Or run a specific migration file with `psql` against `SUPABASE_DB_URL`.

## Deploy (Vercel CLI)

```bash
vercel link
vercel --prod
```

Set all required environment variables in Vercel Project Settings before deploying.

## Security Notes

- Chat access is protected by Supabase RLS policies (`chats/messages/memories` owner-only).
- OAuth callback `next` redirect is sanitized to internal paths only.
- Security headers are applied in middleware (CSP, frame protection, nosniff, referrer policy).
