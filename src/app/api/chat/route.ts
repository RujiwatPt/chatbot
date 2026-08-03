import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  loadChatContext,
  maybeSummarize,
} from "@/lib/memory";
import { streamAssistantText } from "@/lib/chat-quality";
import { encryptText } from "@/lib/encryption";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  chatId: z.string().uuid(),
  message: z.string().min(1).max(8000),
});

// Per-user rate limit: how many user messages allowed in the trailing minute.
// Uses RLS-scoped count, so each authed user's window is isolated.
const RATE_LIMIT_PER_MINUTE = 20;

// Detect an explicit "call me X" / "my name is X" request so we can remember
// what the user wants to be called and prioritize it for the rest of the chat.
const NAME_REQUEST_PATTERNS = [
  /(?:call me|my name is|i'm|i am)\s+([A-Z][a-z0-9_-]{1,30})\b/i,
  /refer to me as\s+([A-Z][a-z0-9_-]{1,30})\b/i,
];

function detectPreferredName(text: string): string | null {
  for (const pat of NAME_REQUEST_PATTERNS) {
    const m = text.match(pat);
    if (m?.[1]) {
      const candidate = m[1].trim();
      const lower = candidate.toLowerCase();
      if (
        lower !== "a" &&
        lower !== "an" &&
        lower !== "the" &&
        lower !== "so" &&
        lower !== "just" &&
        lower !== "really"
      ) {
        return candidate;
      }
    }
  }
  return null;
}

export async function POST(request: Request) {
  // Auth was already enforced by middleware; RLS handles per-row authorization.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad_request", { status: 400 });
  const { chatId, message } = parsed.data;

  const ctx = await loadChatContext(supabase, chatId);
  if (!ctx) return new Response("not_found", { status: 404 });

  // Rate limit: fast memory sliding window check per-user (20 msg/min)
  const rl = checkRateLimit({
    identifier: user.id,
    namespace: "chat_user",
    limit: RATE_LIMIT_PER_MINUTE,
    windowSeconds: 60,
  });
  if (!rl.success) {
    return rateLimitResponse(rl.resetSeconds);
  }

  // Backup DB count check: count this user's messages in the last minute.
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", oneMinuteAgo);
  if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return rateLimitResponse(60);
  }

  // If the user asks to be called something, remember it on the chat so it
  // persists and takes priority for the rest of the conversation.
  const preferredName = detectPreferredName(message);
  if (preferredName && preferredName !== ctx.userName) {
    await supabase
      .from("chats")
      .update({ user_name: preferredName })
      .eq("id", chatId);
  }
  const effectiveUserName = preferredName ?? ctx.userName;

  // Persist the user's new message (RLS guarantees the chat is theirs)
  {
    const { error } = await supabase.from("messages").insert({
      chat_id: chatId,
      role: "user",
      content: await encryptText(message, user.id),
    });
    if (error) return new Response(error.message, { status: 500 });
  }

  const system = buildSystemPrompt({
    character: ctx.character,
    facts: ctx.facts,
    sceneState: ctx.sceneState,
    summary: ctx.summary,
    feedback: ctx.feedback,
    userName: effectiveUserName,
    userPronouns: ctx.userPronouns,
  });

  const messages = [
    ...ctx.recent.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: message },
  ];

  let generated;
  try {
    generated = await streamAssistantText({
      character: ctx.character,
      sceneState: ctx.sceneState,
      system,
      messages,
      priorAssistant: ctx.recent
        .filter((m) => m.role === "assistant")
        .map((m) => m.content),
      userName: effectiveUserName,
    });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "generation_failed",
      { status: 500 },
    );
  }

  after(async () => {
    try {
      const finalText = (await generated.fullTextPromise).trim();
      if (finalText) {
        await supabase.from("messages").insert({
          chat_id: chatId,
          role: "assistant",
          content: await encryptText(finalText, user.id),
        });
      }
      await maybeSummarize(supabase, chatId, ctx.character);
      console.log("[chat_streaming_complete]", {
        chatId,
        model: generated.modelId,
        length: finalText.length,
      });
    } catch (err) {
      console.error("[after_save_error]", err);
    }
  });

  return new Response(generated.stream, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
