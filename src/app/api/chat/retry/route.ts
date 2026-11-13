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
import { decryptText, encryptText } from "@/lib/encryption";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { CONTINUE_NUDGE, RETRY_MANDATE } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  chatId: z.string().uuid(),
  rejectedContent: z.string().max(8000).optional(),
});

export async function POST(request: Request) {
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  let assistantPlaceholderId: number | null = null;

  try {
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Response("unauthorized", { status: 401 });

    const rl = checkRateLimit({
      identifier: user.id,
      namespace: "chat_retry",
      limit: 10,
      windowSeconds: 60,
    });
    if (!rl.success) {
      return rateLimitResponse(rl.resetSeconds);
    }

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("bad_request", { status: 400 });
    const { chatId, rejectedContent: clientRejectedContent } = parsed.data;

    const { data: latestUser } = await supabase
      .from("messages")
      .select("id, content")
      .eq("chat_id", chatId)
      .eq("role", "user")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latestUser) return new Response("no_user_message", { status: 400 });

    const decryptedUserMsg = await decryptText(latestUser.content, user.id);
    const isContinueNudge =
      !decryptedUserMsg ||
      decryptedUserMsg === "[Continue]" ||
      decryptedUserMsg === "*continue*";

    const { data: latestAssistants } = await supabase
      .from("messages")
      .select("id, content")
      .eq("chat_id", chatId)
      .eq("role", "assistant")
      .gt("id", latestUser.id)
      .order("id", { ascending: false });

    let rejectedAssistantContent: string | null = clientRejectedContent || null;
    if (latestAssistants && latestAssistants.length > 0) {
      const mostRecent = latestAssistants[0];
      const decrypted = await decryptText(mostRecent.content, user.id);
      if (decrypted) rejectedAssistantContent = decrypted;

      const idsToDelete = latestAssistants.map((a) => a.id);
      const minDeletedId = Math.min(...idsToDelete);
      const { error: delErr } = await supabase
        .from("messages")
        .delete()
        .in("id", idsToDelete);
      if (delErr) return new Response(delErr.message, { status: 500 });

      // Clean up any memory rows derived from the rejected assistant message
      await supabase
        .from("memories")
        .delete()
        .eq("chat_id", chatId)
        .gte("up_to_message_id", minDeletedId);
    }

    // If active summary contains retried turn IDs, purge it to prevent empty recent context
    const { data: summaryRow } = await supabase
      .from("memories")
      .select("id, up_to_message_id")
      .eq("chat_id", chatId)
      .eq("kind", "summary")
      .maybeSingle();

    if (summaryRow && (summaryRow.up_to_message_id ?? 0) >= latestUser.id) {
      await supabase.from("memories").delete().eq("id", summaryRow.id);
    }

    const ctx = await loadChatContext(supabase, chatId, user.id);
    if (!ctx) return new Response("not_found", { status: 404 });

    const priorAssistant = ctx.recent
      .filter((m) => m.role === "assistant")
      .map((m) => m.content);

    if (rejectedAssistantContent) {
      priorAssistant.push(rejectedAssistantContent);
    }

    let system = buildSystemPrompt({
      character: ctx.character,
      facts: ctx.facts,
      sceneState: ctx.sceneState,
      summary: ctx.summary,
      userName: ctx.userName,
      userPronouns: ctx.userPronouns,
      userDescription: ctx.userDescription,
      priorAssistant,
    });

    if (rejectedAssistantContent) {
      system += `\n\n${RETRY_MANDATE}`;
    }

    if (isContinueNudge) {
      system += `\n\n${CONTINUE_NUDGE}`;
    }

    // Ensure prompt messages array strictly ends with a user turn for correct LLM conversation alignment
    const lastUserIndex = ctx.recent.reduce(
      (lastIdx, m, idx) => (m.role === "user" ? idx : lastIdx),
      -1,
    );
    let alignedRecent = lastUserIndex >= 0 ? ctx.recent.slice(0, lastUserIndex + 1) : ctx.recent;

    const userTurnText = isContinueNudge
      ? "[Continue the scene]"
      : (decryptedUserMsg || "*continue*");

    // Guarantee that the prompt contains the user turn being retried and ends with a user message
    if (alignedRecent.length === 0 || alignedRecent[alignedRecent.length - 1].role !== "user") {
      alignedRecent = [
        ...alignedRecent.filter((m) => m.role === "user" || m.role === "assistant"),
        { role: "user", content: userTurnText },
      ];
    }

    const messages = alignedRecent.map((m, idx) => {
      if (idx === alignedRecent.length - 1 && m.role === "user") {
        return {
          role: m.role,
          content: userTurnText,
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

    let streamed;
    try {
      streamed = await streamAssistantText({
        character: ctx.character,
        sceneState: ctx.sceneState,
        system,
        messages,
        priorAssistant,
        userName: ctx.userName,
        abortSignal: request.signal,
      });
    } catch (err) {
      console.error("[retry_generation_error]", err);
      return mapLlmErrorToResponse(err);
    }

    // Synchronously persist initial assistant message row to obtain durable DB message ID
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
      console.error("[retry_assistant_initial_insert_failed]", assistantInsertErr);
      return new Response("failed_to_initialize_message", { status: 500 });
    }

    assistantPlaceholderId = inserted.id as number;
    const assistantMsgId = String(inserted.id);
    const db = supabase;

    after(async () => {
      try {
        if (request.signal.aborted) {
          console.log("[retry_generation_aborted_by_client]", { chatId, messageId: assistantMsgId });
          await db.from("messages").delete().eq("id", inserted.id);
          return;
        }
        let rawText = "";
        try {
          rawText = await streamed.fullTextPromise;
        } catch (streamErr) {
          console.error("[retry_streamed_fullTextPromise_error]", streamErr);
        }
        const finalText = rawText.trim();
        if (finalText) {
          const cleanedFinalText = stripAppearanceTropes(finalText);
          await db
            .from("messages")
            .update({ content: await encryptText(cleanedFinalText, user.id) })
            .eq("id", inserted.id);

          const validation = validateInCharacterOutput({
            output: cleanedFinalText,
            selfName: ctx.character.alias?.trim() || ctx.character.name,
            sceneState: ctx.sceneState,
            userName: ctx.userName,
          });
          if (!validation.ok) {
            console.warn("[retry_character_drift_detected]", {
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
            newMessagesAdded: 1,
            logPrefix: "retry",
          });
        } else {
          await db.from("messages").delete().eq("id", inserted.id);
        }
        console.log("[retry_generation_complete]", {
          chatId,
          messageId: assistantMsgId,
          model: streamed.modelId,
          length: finalText.length,
        });
      } catch (err) {
        console.error("[after_retry_stream_save_error]", err);
      }
    });

    const response = streamed.toTextStreamResponse({
      headers: {
        "x-message-id": assistantMsgId,
      },
    });
    assistantPlaceholderId = null;
    return response;
  } catch (err) {
    console.error("[retry_route_unexpected_error]", err);
    if (supabase && assistantPlaceholderId !== null) {
      try {
        await supabase.from("messages").delete().eq("id", assistantPlaceholderId);
      } catch {
        // ignore cleanup failure during error handling
      }
    }
    return new Response(DEFAULT_HIGH_LOAD_MESSAGE, { status: 500 });
  }
}
