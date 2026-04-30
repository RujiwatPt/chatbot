import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  buildSystemPrompt,
  loadChatContext,
  maybeSummarize,
} from "@/lib/memory";
import { generateAssistantText } from "@/lib/chat-quality";

const Body = z.object({
  chatId: z.string().uuid(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad_request", { status: 400 });
  const { chatId } = parsed.data;

  const { data: latestUser } = await supabase
    .from("messages")
    .select("id, content")
    .eq("chat_id", chatId)
    .eq("role", "user")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestUser) return new Response("no_user_message", { status: 400 });

  const { data: latestAssistant } = await supabase
    .from("messages")
    .select("id")
    .eq("chat_id", chatId)
    .eq("role", "assistant")
    .gt("id", latestUser.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestAssistant) {
    const { error: delErr } = await supabase
      .from("messages")
      .delete()
      .eq("id", latestAssistant.id);
    if (delErr) return new Response(delErr.message, { status: 500 });
  }

  const ctx = await loadChatContext(supabase, chatId);
  if (!ctx) return new Response("not_found", { status: 404 });

  const system = buildSystemPrompt({
    character: ctx.character,
    facts: ctx.facts,
    sceneState: ctx.sceneState,
    summary: ctx.summary,
  });
  const messages = ctx.recent.map((m) => ({ role: m.role, content: m.content }));

  const generated = await generateAssistantText({
    character: ctx.character,
    sceneState: ctx.sceneState,
    system,
    messages,
    priorAssistant: ctx.recent
      .filter((m) => m.role === "assistant")
      .map((m) => m.content),
  });

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      role: "assistant",
      content: generated.text,
    })
    .select("id, role, content")
    .single();
  if (error) return new Response(error.message, { status: 500 });

  try {
    await maybeSummarize(supabase, chatId, ctx.character);
  } catch {
    // best effort
  }

  return Response.json({
    ok: true,
    message: {
      id: String(inserted.id),
      role: inserted.role,
      content: inserted.content,
    },
  });
}
