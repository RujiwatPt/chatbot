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
import { detectPreferredName } from "@/lib/name-detection";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  chatId: z.string().uuid(),
  message: z.string().max(8000),
});

// Per-user rate limit: how many user messages allowed in the trailing minute.
const RATE_LIMIT_PER_MINUTE = 20;

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

    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("Insufficient credits") || errMsg.includes("402")) {
      return new Response(
        "OpenRouter account credits are depleted. Please top up credits at https://openrouter.ai/settings/credits.",
        { status: 402 },
      );
    }
    if (
      errMsg.includes("401") ||
      errMsg.includes("Unauthorized") ||
      errMsg.includes("User not found") ||
      errMsg.includes("Key not found") ||
      errMsg.includes("auth credentials")
    ) {
      return new Response(
        "OpenRouter API key is invalid or expired. Please check your API key in settings.",
        { status: 401 },
      );
    }
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
      let rawText = "";
      try {
        rawText = await streamed.fullTextPromise;
      } catch (streamErr) {
        console.error("[streamed_fullTextPromise_error]", streamErr);
      }
      const finalText = rawText.trim();
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
