import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  loadChatContext,
  maybeSummarize,
  refreshSceneState,
} from "@/lib/memory";
import { streamAssistantText } from "@/lib/chat-quality";
import { encryptText } from "@/lib/encryption";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  chatId: z.string().uuid(),
  message: z.string().max(8000),
});

// Per-user rate limit: how many user messages allowed in the trailing minute.
const RATE_LIMIT_PER_MINUTE = 20;

const NAME_REQUEST_PATTERNS = [
  /\bmy name is\s+([A-Za-z0-9_\-']{1,30})\b/i,
  /\bcall me\s+([A-Za-z0-9_\-']{1,30})\b/i,
  /\brefer to me as\s+([A-Za-z0-9_\-']{1,30})\b/i,
  /\bi go by\s+([A-Za-z0-9_\-']{1,30})\b/i,
  /\byou can call me\s+([A-Za-z0-9_\-']{1,30})\b/i,
];

export function detectPreferredName(text: string): string | null {
  for (const pat of NAME_REQUEST_PATTERNS) {
    const m = text.match(pat);
    if (m?.[1]) {
      const candidate = m[1].trim();
      const lower = candidate.toLowerCase();
      const reserved = ["a", "an", "the", "so", "just", "really", "here", "there", "now", "later"];
      if (reserved.includes(lower)) continue;
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
  if (!user) {
    return new Response("unauthorized", { status: 401 });
  }

  // Edge / in-memory per-user rate limit check
  const rl = checkRateLimit({
    identifier: user.id,
    namespace: "chat_user_msg",
    limit: RATE_LIMIT_PER_MINUTE,
    windowSeconds: 60,
  });
  if (!rl.success) {
    return rateLimitResponse(rl.resetSeconds);
  }

  // Durable DB rate-limit backstop (20 msg/min per user across chats)
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const { count: recentMsgCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", oneMinuteAgo);

  if ((recentMsgCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return rateLimitResponse(60);
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response("bad_request", { status: 400 });
  }

  const { chatId, message: rawUserMessage } = parsed.data;

  // Verify chat ownership
  const { data: ownership } = await supabase
    .from("chats")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownership) {
    return new Response("not_found", { status: 404 });
  }

  const userPromptContent = rawUserMessage.trim();
  const isContinueNudge =
    !userPromptContent ||
    userPromptContent === "[Continue]" ||
    userPromptContent === "*continue*";

  // Check if user is introducing or updating their preferred name
  const detectedName = detectPreferredName(userPromptContent);
  if (detectedName) {
    await supabase
      .from("chats")
      .update({ user_name: detectedName })
      .eq("id", chatId);
  }

  // Load chat context
  const ctx = await loadChatContext(supabase, chatId);
  if (!ctx) {
    return new Response("not_found", { status: 404 });
  }

  const effectiveUserName = detectedName || ctx.userName;

  // Persist user prompt if not a continuation nudge
  if (!isContinueNudge) {
    const { error: userInsertErr } = await supabase.from("messages").insert({
      chat_id: chatId,
      role: "user",
      content: await encryptText(userPromptContent, user.id),
    });
    if (userInsertErr) {
      return new Response(userInsertErr.message, { status: 500 });
    }
  }

  let system = buildSystemPrompt({
    character: ctx.character,
    facts: ctx.facts,
    sceneState: ctx.sceneState,
    summary: ctx.summary,
    feedback: ctx.feedback,
    userName: effectiveUserName,
    userPronouns: ctx.userPronouns,
    userDescription: ctx.userDescription,
  });

  if (isContinueNudge) {
    system += `\n\n[STORY PROGRESSION NUDGE]: The user is asking you to continue the scene forward. Progress the narrative, actions, and character interaction forward naturally. Do NOT repeat previous actions, sentences, or postures. Introduce new actions, dialogue, physical movement, or emotional developments.`;
  }

  const messages = [
    ...ctx.recent.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user" as const,
      content: isContinueNudge
        ? "[Continue: progress story forward without repeating previous turn]"
        : userPromptContent,
    },
  ];

  let streamed;
  try {
    streamed = await streamAssistantText({
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

  // Synchronously persist initial assistant message row to obtain durable DB message ID for client feedback affordance
  const { data: inserted, error: assistantInsertErr } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      role: "assistant",
      content: "",
    })
    .select("id")
    .single();

  if (assistantInsertErr || !inserted) {
    console.error("[assistant_initial_insert_failed]", assistantInsertErr);
    return new Response("failed_to_initialize_message", { status: 500 });
  }

  const assistantMsgId = String(inserted.id);

  // Fetch total message count for exact scene refresh turn cadence
  const { count: totalMsgCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId);

  after(async () => {
    try {
      const finalText = (await streamed.fullTextPromise).trim();
      if (finalText) {
        await supabase
          .from("messages")
          .update({ content: await encryptText(finalText, user.id) })
          .eq("id", inserted.id);

        if (!ctx.sceneState || ((totalMsgCount ?? 0) + 1) % 5 === 0) {
          await refreshSceneState(supabase, chatId, ctx.character, user.id);
        }
        await maybeSummarize(supabase, chatId, ctx.character, user.id);
      } else {
        await supabase.from("messages").delete().eq("id", inserted.id);
      }
      console.log("[chat_generation_complete]", {
        chatId,
        messageId: assistantMsgId,
        model: streamed.modelId,
        length: finalText.length,
      });
    } catch (err) {
      console.error("[after_stream_save_error]", err);
    }
  });

  return streamed.toTextStreamResponse({
    headers: {
      "x-message-id": assistantMsgId,
    },
  });
}
