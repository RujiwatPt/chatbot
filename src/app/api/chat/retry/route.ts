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
import { decryptText, encryptText } from "@/lib/encryption";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  chatId: z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
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

  // Durable DB rate-limit backstop (20 msg/min per user across chats)
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const { count: recentMsgCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", oneMinuteAgo);

  if ((recentMsgCount ?? 0) >= 20) {
    return rateLimitResponse(60);
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad_request", { status: 400 });
  const { chatId } = parsed.data;

  // Verify chat ownership
  const { data: ownership } = await supabase
    .from("chats")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ownership) return new Response("not_found", { status: 404 });

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

  const { data: latestAssistant } = await supabase
    .from("messages")
    .select("id, content")
    .eq("chat_id", chatId)
    .eq("role", "assistant")
    .gt("id", latestUser.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  let rejectedAssistantContent: string | null = null;
  if (latestAssistant) {
    rejectedAssistantContent = await decryptText(latestAssistant.content, user.id);
    const { error: delErr } = await supabase
      .from("messages")
      .delete()
      .eq("id", latestAssistant.id);
    if (delErr) return new Response(delErr.message, { status: 500 });
  }

  const ctx = await loadChatContext(supabase, chatId);
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
    feedback: ctx.feedback,
    userName: ctx.userName,
    userPronouns: ctx.userPronouns,
    userDescription: ctx.userDescription,
    priorAssistant,
  });

  if (rejectedAssistantContent) {
    system += `\n\n[RETRY ANTI-REPETITION MANDATE]: The user requested a retry because your previous response was unsatisfactory. You MUST provide an entirely new response with fresh actions, different phrasing, and ZERO self-appearance commentary.`;
  }

  if (isContinueNudge) {
    system += `\n\n[STORY PROGRESSION NUDGE]: The user is asking you to continue the scene forward. Progress the narrative, actions, and character interaction forward naturally. Do NOT repeat previous actions, sentences, or postures. Introduce new actions, dialogue, physical movement, or emotional developments.`;
  }

  // Ensure prompt messages array strictly ends with a user turn for correct LLM conversation alignment
  const lastUserIndex = ctx.recent.reduce(
    (lastIdx, m, idx) => (m.role === "user" ? idx : lastIdx),
    -1,
  );
  const alignedRecent = lastUserIndex >= 0 ? ctx.recent.slice(0, lastUserIndex + 1) : ctx.recent;

  const messages = alignedRecent.map((m, idx) => {
    if (idx === alignedRecent.length - 1 && m.role === "user" && isContinueNudge) {
      return {
        role: m.role,
        content: "[Continue: progress story forward without repeating previous turn]",
      };
    }
    return {
      role: m.role,
      content: m.role === "assistant" ? stripAppearanceTropes(m.content) : m.content,
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
    return new Response(
      "The model is experiencing some high load, try changing model or wait for a moment before trying again.",
      { status: 503 },
    );
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

  const assistantMsgId = String(inserted.id);

  // Fetch total message count for exact scene refresh turn cadence
  const { count: totalMsgCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId);

  after(async () => {
    try {
      if (request.signal.aborted) {
        console.log("[retry_generation_aborted_by_client]", { chatId, messageId: assistantMsgId });
        return;
      }
      const finalText = (await streamed.fullTextPromise).trim();
      if (finalText) {
        const cleanedFinalText = stripAppearanceTropes(finalText);
        await supabase
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

        if (!ctx.sceneState || ((totalMsgCount ?? 0) + 1) % 5 === 0) {
          await refreshSceneState(supabase, chatId, ctx.character, user.id);
        }
        await maybeSummarize(supabase, chatId, ctx.character, user.id);
      } else {
        await supabase.from("messages").delete().eq("id", inserted.id);
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

  return streamed.toTextStreamResponse({
    headers: {
      "x-message-id": assistantMsgId,
    },
  });
}
