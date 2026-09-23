import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  loadChatContext,
  maybeSummarize,
  refreshSceneState,
  stripAppearanceTropes,
  validateInCharacterOutput,
} from "@/lib/memory";
import { streamAssistantText } from "@/lib/chat-quality";
import { encryptText } from "@/lib/encryption";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { CONTINUE_NUDGE } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  chatId: z.string().uuid(),
  message: z.string().max(8000),
});

// Per-user rate limit: how many user messages allowed in the trailing minute.
const RATE_LIMIT_PER_MINUTE = 20;

const NAME_INTRO_PATTERN =
  /(?:^|[.!?]\s*|\b(?:hi|hello|hey|greetings),?\s*)(?:my name is|i am called|i go by|you can call me|please call me)\s+([A-Za-z0-9_\-']{2,30})\b/i;

const CALL_ME_PATTERN =
  /\bcall me\s+([A-Za-z0-9_\-']{2,30})\b/i;

const DISALLOWED_NAMES = new Set([
  "a", "an", "the", "so", "just", "really", "here", "there", "now", "later",
  "when", "if", "after", "before", "while", "tonight", "tomorrow", "back", "up",
  "down", "on", "at", "by", "in", "again", "maybe", "please", "sir", "ma'am",
  "babe", "baby", "honey", "darling", "sweetheart", "sweetie", "friend", "buddy",
  "crazy", "stupid", "dumb", "idiot", "fool", "names", "that", "it", "something",
  "anything", "nothing", "someone", "anyone", "everyone", "nobody"
]);

export function detectPreferredName(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Reject negative sentences ("don't call me", "never call me", etc.)
  if (/\b(?:don't|do\s+not|never|stop|quit|not)\s+call\s+me\b/i.test(trimmed)) {
    return null;
  }

  // 1. Try explicit introductions first ("my name is X", "you can call me X")
  const introMatch = trimmed.match(NAME_INTRO_PATTERN);
  if (introMatch?.[1]) {
    const candidate = introMatch[1].trim();
    if (!DISALLOWED_NAMES.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // 2. Try "call me X" with strict boundary and non-preposition check
  const callMatch = trimmed.match(CALL_ME_PATTERN);
  if (callMatch?.[1]) {
    const candidate = callMatch[1].trim();
    const lower = candidate.toLowerCase();
    if (DISALLOWED_NAMES.has(lower)) return null;

    // Check next word after candidate: if followed by preposition/conjunction, it's not a name
    const afterMatch = trimmed.slice(trimmed.indexOf(candidate) + candidate.length).trim();
    const firstNextWord = afterMatch.split(/\s+/)[0]?.toLowerCase().replace(/[^\w]/g, "");
    if (firstNextWord && ["when", "if", "later", "tonight", "tomorrow", "after", "before", "on", "at"].includes(firstNextWord)) {
      return null;
    }

    return candidate;
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

  const userPromptContent = rawUserMessage.trim();
  const isContinueNudge =
    !userPromptContent ||
    userPromptContent === "[Continue]" ||
    userPromptContent === "*continue*";

  // Load chat context while simultaneously verifying chat ownership
  const ctx = await loadChatContext(supabase, chatId, user.id);
  if (!ctx) {
    return new Response("not_found", { status: 404 });
  }

  // Check if user is introducing or updating their preferred name
  const detectedName = detectPreferredName(userPromptContent);
  if (detectedName && detectedName !== ctx.userName) {
    await supabase
      .from("chats")
      .update({ user_name: detectedName })
      .eq("id", chatId);
  }

  const effectiveUserName = detectedName || ctx.userName;

  // Persist user prompt and empty assistant placeholder in a single batched database roundtrip
  const userContentToSave = isContinueNudge ? "*continue*" : userPromptContent;
  const encryptedUserContent = await encryptText(userContentToSave, user.id);

  const { data: insertedRows, error: insertErr } = await supabase
    .from("messages")
    .insert([
      {
        chat_id: chatId,
        role: "user",
        content: encryptedUserContent,
      },
      {
        chat_id: chatId,
        role: "assistant",
        content: "",
      },
    ])
    .select("id, role")
    .order("id", { ascending: true });

  if (insertErr || !insertedRows || insertedRows.length < 2) {
    console.error("[chat_messages_batch_insert_failed]", insertErr);
    return new Response("failed_to_initialize_message", { status: 500 });
  }

  const userInserted = insertedRows.find((r) => r.role === "user") ?? insertedRows[0];
  const assistantInserted = insertedRows.find((r) => r.role === "assistant") ?? insertedRows[1];
  const assistantMsgId = String(assistantInserted.id);

  const priorAssistant = ctx.recent
    .filter((m) => m.role === "assistant")
    .map((m) => m.content);

  let system = buildSystemPrompt({
    character: ctx.character,
    facts: ctx.facts,
    sceneState: ctx.sceneState,
    summary: ctx.summary,
    userName: effectiveUserName,
    userPronouns: ctx.userPronouns,
    userDescription: ctx.userDescription,
    priorAssistant,
  });

  if (isContinueNudge) {
    system += `\n\n${CONTINUE_NUDGE}`;
  }

  const messages = [
    ...ctx.recent.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user" as const,
      content: isContinueNudge ? "[Continue the scene]" : userPromptContent,
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
      abortSignal: request.signal,
    });
  } catch (err) {
    console.error("[chat_generation_error]", err);
    await supabase
      .from("messages")
      .delete()
      .in("id", [userInserted.id, assistantInserted.id]);
    return new Response(
      "The model is experiencing some high load, try changing model or wait for a moment before trying again.",
      { status: 503 },
    );
  }

  after(async () => {
    try {
      if (request.signal.aborted) {
        console.log("[chat_generation_aborted_by_client]", { chatId, messageId: assistantMsgId });
        await supabase.from("messages").delete().eq("id", assistantInserted.id);
        return;
      }
      const finalText = (await streamed.fullTextPromise).trim();
      if (finalText) {
        const cleanedFinalText = stripAppearanceTropes(finalText);
        await supabase
          .from("messages")
          .update({ content: await encryptText(cleanedFinalText, user.id) })
          .eq("id", assistantInserted.id);

        const validation = validateInCharacterOutput({
          output: cleanedFinalText,
          selfName: ctx.character.alias?.trim() || ctx.character.name,
          sceneState: ctx.sceneState,
          userName: effectiveUserName,
        });
        if (!validation.ok) {
          console.warn("[character_drift_detected]", {
            chatId,
            messageId: assistantMsgId,
            reasons: validation.reasons,
          });
        }

        // Fetch count in background for cadence check without delaying stream response
        const { count: totalMsgCount } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("chat_id", chatId);

        const count = totalMsgCount ?? 0;
        // Stagger background tasks to avoid exceeding Cloudflare Worker CPU/duration limits
        if (count >= 20 && count % 10 === 0) {
          try {
            await maybeSummarize(supabase, chatId, ctx.character, user.id);
          } catch (sumErr) {
            console.error("[maybeSummarize_failed]", sumErr);
          }
        } else if (count >= 5 && count % 5 === 0) {
          try {
            await refreshSceneState(supabase, chatId, ctx.character, user.id);
          } catch (sceneErr) {
            console.error("[refreshSceneState_failed]", sceneErr);
          }
        }
      } else {
        await supabase.from("messages").delete().eq("id", assistantInserted.id);
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
