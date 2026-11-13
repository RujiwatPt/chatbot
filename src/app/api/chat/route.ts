import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  loadChatContext,
  runStaggeredMemoryUpdate,
  stripAppearanceTropes,
  validateInCharacterOutput,
} from "@/lib/memory";
import { streamAssistantText } from "@/lib/chat-quality";
import { DEFAULT_HIGH_LOAD_MESSAGE, mapLlmErrorToResponse } from "@/lib/chat-errors";
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
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  let insertedIdsToClean: number[] = [];

  try {
    supabase = await createClient();
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
    insertedIdsToClean = [userInserted.id, assistantInserted.id];

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
        priorAssistant,
        userName: effectiveUserName,
        abortSignal: request.signal,
      });
    } catch (err) {
      console.error("[chat_generation_error]", err);
      await supabase
        .from("messages")
        .delete()
        .in("id", insertedIdsToClean);
      insertedIdsToClean = [];
      return mapLlmErrorToResponse(err);
    }

    const db = supabase;
    after(async () => {
      try {
        if (request.signal.aborted) {
          console.log("[chat_generation_aborted_by_client]", { chatId, messageId: assistantMsgId });
          await db.from("messages").delete().eq("id", assistantInserted.id);
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
          await db
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

          await runStaggeredMemoryUpdate({
            supabase: db,
            chatId,
            character: ctx.character,
            userId: user.id,
            unbudgetedMessages: ctx.unbudgetedMessages,
            messagesSinceScene: ctx.messagesSinceScene,
            newMessagesAdded: 2,
          });
        } else {
          await db.from("messages").delete().eq("id", assistantInserted.id);
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

    const response = streamed.toTextStreamResponse({
      headers: {
        "x-message-id": assistantMsgId,
      },
    });
    insertedIdsToClean = [];
    return response;
  } catch (err) {
    console.error("[chat_route_unexpected_error]", err);
    if (supabase && insertedIdsToClean.length > 0) {
      try {
        await supabase.from("messages").delete().in("id", insertedIdsToClean);
      } catch {
        // ignore cleanup failure during error handling
      }
    }
    return new Response(DEFAULT_HIGH_LOAD_MESSAGE, { status: 500 });
  }
}
