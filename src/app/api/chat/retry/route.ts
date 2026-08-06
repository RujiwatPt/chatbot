import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  loadChatContext,
  maybeSummarize,
} from "@/lib/memory";
import { generateAssistantText } from "@/lib/chat-quality";
import { decryptText, encryptText } from "@/lib/encryption";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
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

  if (isContinueNudge) {
    system += `\n\n[STORY PROGRESSION NUDGE]: The user is asking you to continue the scene forward. Progress the narrative, actions, and character interaction forward naturally. Do NOT repeat previous actions, sentences, or postures. Introduce new actions, dialogue, physical movement, or emotional developments.`;
  }

  const messages = ctx.recent.map((m, idx) => {
    if (idx === ctx.recent.length - 1 && m.role === "user" && isContinueNudge) {
      return {
        role: m.role,
        content: "[Continue: progress story forward without repeating previous turn]",
      };
    }
    return { role: m.role, content: m.content };
  });

  const generated = await generateAssistantText({
    character: ctx.character,
    sceneState: ctx.sceneState,
    system,
    messages,
    priorAssistant,
    userName: ctx.userName,
  });

  const finalText = generated.text.trim();
  if (!finalText) {
    return new Response(
      "The model is experiencing some high load, try changing model or wait for a moment before trying again.",
      { status: 503 },
    );
  }

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      role: "assistant",
      content: await encryptText(finalText, user.id),
    })
    .select("id, role, content")
    .single();
  if (error) return new Response(error.message, { status: 500 });

  try {
    await maybeSummarize(supabase, chatId, ctx.character, user.id);
  } catch {
    // best effort
  }

  return Response.json({
    ok: true,
    message: {
      id: String(inserted.id),
      role: inserted.role,
      content: finalText,
    },
  });
}
