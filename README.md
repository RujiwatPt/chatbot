# Howly.ai

Persistent-memory AI roleplay and companion platform built by **HowlingHeaven Studio**.

---

## 🌟 Key Features

### 🎭 Character Creation & Discovery
- **Public & Private Companions**: Create custom roleplay companions or explore public companions available to all users.
- **Avatar Cropper & Framer**: Built-in 512×512 avatar cropping, zooming, and framing tool.
- **Global Tag Taxonomy**: Categorize and filter companions with dynamic tags (`Gender-Neutral`, `Male`, `Female`, `Furry`, `Teenager`, `Adult`, `NSFW`, `Violence`, `Anime`, `Cozy`, `Fantasy`, `Support`, `Sci-Fi`, `Romance`, `Horror`).
- **Paginated Search & Filters**: 10-item page navigation with full-text query search and tag filter bar.

### 💬 Interactive Chat Engine
- **Realtime Response Streaming**: Fast streaming responses with stop controls and cooldown timers.
- **Infinite Memory Engine**: Automatic background summarization and durable fact extraction to keep long story arcs coherent without running out of context.
- **Reading Controls & Focus Mode**: Custom text font scaling (`A-`, `A+`, `Reset`) and single-click focus mode to hide top site navigation.
- **Retry, Undo, & Feedback**: Retry responses, undo turns, or submit fine-grained message quality feedback (`more_in_character`, `too_generic`, `too_verbose`).

### 👤 User Settings & Identity
- **Profile Customization**: `/settings` page to edit default display name and preferred pronouns (`she/her`, `he/him`, `they/them`).
- **Start Chat Pre-Filling**: Automatically pre-fills name and pronouns into new chat session forms.
- **Permanent Account Deletion**: Self-service account deletion with email confirmation verification that cleans up user chats, messages, and profile data.

### 🛡️ Security & Infrastructure
- **Edge Rate Limiting**: Sliding-window rate limiting on API endpoints and chat messages to protect against spam.
- **Security Headers**: Production security headers enforced in middleware (HSTS, CSP, Permissions-Policy, Frame Protection, X-Content-Type-Options).
- **Row Level Security (RLS)**: Strict Supabase RLS policies ensuring chats and messages are accessible only by the authenticated owner.
- **Encrypted Storage**: All chat messages, summaries, and facts are encrypted at rest per user.

---

## 🛠️ Tech Stack

- **Framework**: Next.js App Router
- **Database & Auth**: Supabase (PostgreSQL, Row Level Security, Auth)
- **Styling**: Tailwind CSS & Glassmorphism Design Token System

---

## 🚀 Environment Variables

Create `.env` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENROUTER_API_KEY=your_api_key
```

Optional configuration:

```bash
OPENROUTER_MODEL=sao10k/l3.3-euryale-70b
OPENROUTER_FALLBACK_MODELS=sophosympatheia/midnight-rose-70b,neversleep/llama-3-lumimaid-70b,gryphe/mythomax-l2-13b
OPENROUTER_SITE_URL=https://howly.ai
OPENROUTER_APP_NAME=Howly.ai
```

---

## 💻 Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` to view Howly.ai.

---

## 🗄️ Database Migrations

Apply migration files located in `supabase/migrations/` using Supabase CLI:

```bash
supabase migration up
```

---

## 📜 Terms & Legal

- **Terms of Service**: Available at [/terms](http://localhost:3000/terms)
- **Copyright**: © HowlingHeaven Studio 2026. All rights reserved.
