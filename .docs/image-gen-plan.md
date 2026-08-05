# 📷 Scene Image Generation Feature Plan

Design document and technical roadmap for adding a **"Generate Scene Image"** feature to the roleplay chat interface.

---

## 🎯 Goal & User Experience

Allow users to generate a visual scene illustration based on the current context of the conversation at any moment during a chat session.

1. **User Action**: Click the **"📷 Generate Scene"** button in the chat thread.
2. **Context Summarization**: The app automatically extracts the character's visual description, scene state, and latest conversation turns to compile a detailed visual prompt.
3. **Generation**: An image is generated using FLUX / OpenRouter / Fal.ai.
4. **Presentation**: The generated scene image is inserted directly into the chat thread with a full-screen Lightbox preview and download options.

---

## 💰 Model Matrix & Cost Breakdown

| Model Provider | Price / Image | Images per $1.00 | Features & Moderation |
| --- | --- | --- | --- |
| **`black-forest-labs/flux-1-schnell`** *(Default)* | **~$0.003** (0.3¢) | **~330 images** | ⚡ Fast (1.5s), high quality, SFW filtered |
| **`black-forest-labs/flux-1-dev`** | **~$0.025** (2.5¢) | **~40 images** | 🖼️ Highest photorealism & prompt adherence |
| **Fal.ai / Replicate** *(Uncensored)* | **~$0.003 – $0.008** | **~125 – 330 images** | 🌶️ Unfiltered / NSFW capable (Pony / SDXL / FLUX) |

---

## 📐 Architecture & Pipeline

```
[User Clicks "Generate Scene"]
       │
       ▼
1. LLM Visual Summarizer Route (/api/chat/generate-image)
   - Inputs: Character persona, appearance, scenario, and recent 5 messages
   - System Prompt: "Extract physical appearance, environment, lighting, pose, and camera angle into a 1-sentence SD/FLUX prompt."
       │
       ▼
2. Image Generation Request
   - Call OpenRouter Image API: POST https://openrouter.ai/api/v1/images
   - Body: { model: "black-forest-labs/flux-1-schnell", prompt: "<summarized_prompt>", aspect_ratio: "1:1" }
       │
       ▼
3. Store & Render
   - Insert generated image message into messages table (or inline state)
   - Render in ChatClient with Lightbox preview & download button
```

---

## 🗄️ Proposed Database Schema Updates

Add an optional `image_url` column to the `messages` table:

```sql
-- Migration: Add image_url to messages table for scene rendering
alter table public.messages add column if not exists image_url text;
```

---

## 🛠️ Implementation Steps

### Phase 1: API Route (`src/app/api/chat/generate-image/route.ts`)
- Authenticate user session.
- Apply per-user rate limiting (e.g. 5 image generations / min).
- Run visual prompt summarizer using Gemini 2.5 Flash.
- Invoke OpenRouter Image API (`POST https://openrouter.ai/api/v1/images`).
- Save assistant/system message with `image_url` to Supabase `messages` table.

### Phase 2: Chat UI Integration (`src/app/chat/[chatId]/ChatClient.tsx`)
- Add **"📷 Generate Scene"** action button in composer toolbar.
- Display a shimmering skeleton placeholder while generating.
- Support Lightbox modal preview when tapping/clicking generated images.

### Phase 3: Uncensored Provider Switch (Optional)
- Add provider setting (`PROVIDER=openrouter` vs `PROVIDER=fal`).
