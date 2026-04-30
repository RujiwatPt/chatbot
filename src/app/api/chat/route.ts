import { after } from "next/server";
import { z } from "zod";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { model } from "@/lib/openrouter";
import {
  buildSystemPrompt,
  loadChatContext,
  maybeSummarize,
} from "@/lib/memory";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  chatId: z.string().uuid(),
  message: z.string().min(1).max(8000),
});

// Per-user rate limit: how many user messages allowed in the trailing minute.
// Uses RLS-scoped count, so each authed user's window is isolated.
const RATE_LIMIT_PER_MINUTE = 20;

export async function POST(request: Request) {
  // Auth was already enforced by middleware; RLS handles per-row authorization.
  const supabase = await createClient();

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad_request", { status: 400 });
  const { chatId, message } = parsed.data;

  const ctx = await loadChatContext(supabase, chatId);
  if (!ctx) return new Response("not_found", { status: 404 });

  // Rate limit: count this user's messages in the last minute. RLS narrows
  // the messages table to chats this user owns, so the count is per-user.
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", oneMinuteAgo);
  if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return new Response("rate_limited", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // Persist the user's new message (RLS guarantees the chat is theirs)
  {
    const { error } = await supabase
      .from("messages")
      .insert({ chat_id: chatId, role: "user", content: message });
    if (error) return new Response(error.message, { status: 500 });
  }

  const system = buildSystemPrompt({
    character: ctx.character,
    facts: ctx.facts,
    summary: ctx.summary,
  });

  const messages = [
    ...ctx.recent.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  // Accumulate tokens server-side so we can persist a partial reply if the
  // client aborts the stream mid-flight.
  let accumulated = "";
  let completedCleanly = false;
  const result = streamText({
    model: model(ctx.character.model),
    system,
    messages,
    onChunk({ chunk }) {
      if (chunk.type === "text-delta") accumulated += chunk.text;
    },
    onFinish() {
      completedCleanly = true;
    },
  });

  after(async () => {
    // Drain the stream so all chunks fire even if the client aborted reading.
    try {
      await result.consumeStream();
    } catch {
      // upstream error — we persist whatever we got
    }
    if (accumulated) {
      const content = completedCleanly
        ? accumulated
        : `${accumulated}\n\n[…interrupted]`;
      await supabase
        .from("messages")
        .insert({ chat_id: chatId, role: "assistant", content });
    }
    try {
      await maybeSummarize(supabase, chatId, ctx.character);
    } catch {
      // best-effort — failures are logged inside maybeSummarize
    }
  });

  return result.toTextStreamResponse();
}
