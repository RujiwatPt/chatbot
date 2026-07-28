import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  loadChatContext,
  maybeSummarize,
} from "@/lib/memory";
import { generateAssistantText, toSmoothWordStream } from "@/lib/chat-quality";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  /\byou can call me\s+([\p{L}][\p{L}'-]{0,29})/iu,
  /\bcall me\s+([\p{L}][\p{L}'-]{0,29})/iu,
  /\bmy name('?s| is)\s+([\p{L}][\p{L}'-]{0,29})/iu,
  /\bi go by\s+([\p{L}][\p{L}'-]{0,29})/iu,
  /\bi'?m called\s+([\p{L}][\p{L}'-]{0,29})/iu,
];
// Words that follow "call me" but aren't names.
const NAME_STOPWORDS = new Set([
  "maybe", "later", "back", "now", "tonight", "tomorrow", "when", "if",
  "please", "that", "this", "anytime", "sometime", "crazy",
]);

function detectPreferredName(message: string): string | null {
  for (const re of NAME_REQUEST_PATTERNS) {
    const m = message.match(re);
    if (!m) continue;
    // The name is the last captured group (patterns with an alternation use $2).
    const captured = m[m.length - 1]?.trim();
    if (!captured) continue;
    if (NAME_STOPWORDS.has(captured.toLowerCase())) continue;
    return captured.charAt(0).toUpperCase() + captured.slice(1);
  }
  return null;
}

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
    const { error } = await supabase
      .from("messages")
      .insert({ chat_id: chatId, role: "user", content: message });
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
    generated = await generateAssistantText({
      character: ctx.character,
      sceneState: ctx.sceneState,
      system,
      messages,
      priorAssistant: ctx.recent
        .filter((m) => m.role === "assistant")
        .map((m) => m.content),
    });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "generation_failed",
      { status: 500 },
    );
  }
  const finalText = generated.text;

  after(async () => {
    if (finalText) {
      await supabase.from("messages").insert({
        chat_id: chatId,
        role: "assistant",
        content: finalText,
      });
    }
    try {
      await maybeSummarize(supabase, chatId, ctx.character);
    } catch {
      // best-effort — failures are logged inside maybeSummarize
    }
    console.log("[chat_quality]", {
      chatId,
      model: generated.modelId,
      hadRewrite: !generated.validation.ok || generated.repetitive,
      validationOk: generated.validation.ok,
      repetitive: generated.repetitive,
    });
  });

  return new Response(toSmoothWordStream(finalText), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
