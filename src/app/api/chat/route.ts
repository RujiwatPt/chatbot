import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  loadChatContext,
  maybeSummarize,
} from "@/lib/memory";
import { generateAssistantText } from "@/lib/chat-quality";
import { encryptText } from "@/lib/encryption";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  chatId: z.string().uuid(),
  message: z.string().min(1).max(8000),
});

// Per-user rate limit: how many user messages allowed in the trailing minute.
const RATE_LIMIT_PER_MINUTE = 20;

const NAME_REQUEST_PATTERNS = [
  /\bmy name is\s+([A-Z][a-zA-Z0-9_\-']{1,30})\b/,
  /\bcall me\s+([A-Z][a-zA-Z0-9_\-']{1,30})\b/,
  /\brefer to me as\s+([A-Z][a-zA-Z0-9_\-']{1,30})\b/,
];

function detectPreferredName(text: string): string | null {
  for (const pat of NAME_REQUEST_PATTERNS) {
    const m = text.match(pat);
    if (m?.[1]) {
      const candidate = m[1].trim();
      const lower = candidate.toLowerCase();
      if (
        lower.endsWith("ing") ||
        lower.endsWith("ed") ||
        [
          "a",
          "an",
          "the",
          "so",
          "just",
          "really",
          "here",
          "there",
          "ready",
          "going",
          "coming",
          "cuming",
          "tired",
          "fine",
          "ok",
          "okay",
          "sorry",
          "later",
          "now",
        ].includes(lower)
      ) {
        continue;
      }
      return candidate;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad_request", { status: 400 });
  const { chatId, message } = parsed.data;

  const rl = checkRateLimit({
    identifier: user.id,
    namespace: "chat_user",
    limit: RATE_LIMIT_PER_MINUTE,
    windowSeconds: 60,
  });
  if (!rl.success) {
    return rateLimitResponse(rl.resetSeconds);
  }

  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const [ctx, backstop, { data: ownership }] = await Promise.all([
    loadChatContext(supabase, chatId),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "user")
      .gte("created_at", oneMinuteAgo),
    supabase
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if ((backstop.count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return rateLimitResponse(60);
  }
  if (!ownership || !ctx) return new Response("not_found", { status: 404 });

  const preferredName = detectPreferredName(message);
  if (preferredName && preferredName !== ctx.userName) {
    await supabase
      .from("chats")
      .update({ user_name: preferredName })
      .eq("id", chatId);
  }
  const effectiveUserName = preferredName ?? ctx.userName;

  const { error: insertError } = await supabase.from("messages").insert({
    chat_id: chatId,
    role: "user",
    content: await encryptText(message, user.id),
  });

  if (insertError) {
    console.error("[user_message_insert_failed]", insertError);
    return new Response("failed_to_save_message", { status: 500 });
  }

  const system = buildSystemPrompt({
    character: ctx.character,
    facts: ctx.facts,
    sceneState: ctx.sceneState,
    summary: ctx.summary,
    feedback: ctx.feedback,
    userName: effectiveUserName,
    userPronouns: ctx.userPronouns,
    userDescription: ctx.userDescription,
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
      userName: effectiveUserName,
    });
  } catch (err) {
    console.error("[chat_generation_error]", err);
    return new Response(
      "The model is experiencing some high load, try changing model or wait for a moment before trying again.",
      { status: 503 },
    );
  }

  const finalText = generated.text.trim();
  if (!finalText) {
    return new Response(
      "The model is experiencing some high load, try changing model or wait for a moment before trying again.",
      { status: 503 },
    );
  }

  after(async () => {
    try {
      await supabase.from("messages").insert({
        chat_id: chatId,
        role: "assistant",
        content: await encryptText(finalText, user.id),
      });
      await maybeSummarize(supabase, chatId, ctx.character, user.id);
      console.log("[chat_generation_complete]", {
        chatId,
        model: generated.modelId,
        length: finalText.length,
        validation: generated.validation,
        repetitive: generated.repetitive,
      });
    } catch (err) {
      console.error("[after_save_error]", err);
    }
  });

  return new Response(finalText, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
