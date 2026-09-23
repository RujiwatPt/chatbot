import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { encryptText } from "@/lib/encryption";

const Body = z.object({
  chatId: z.string().uuid(),
  messageId: z.union([z.number(), z.string()]),
  content: z.string().min(1).max(20000),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const rl = checkRateLimit({
    identifier: user.id,
    namespace: "chat_edit",
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.success) {
    return rateLimitResponse(rl.resetSeconds);
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad_request", { status: 400 });
  const { chatId, messageId, content } = parsed.data;

  const msgIdNum = typeof messageId === "string" ? parseInt(messageId, 10) : messageId;
  if (isNaN(msgIdNum) || msgIdNum <= 0) return new Response("bad_request", { status: 400 });

  // Verify chat ownership
  const { data: ownership } = await supabase
    .from("chats")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ownership) return new Response("not_found", { status: 404 });

  const trimmedContent = content.trim();
  if (!trimmedContent) return new Response("empty_content", { status: 400 });

  const encrypted = await encryptText(trimmedContent, user.id);

  const { error } = await supabase
    .from("messages")
    .update({ content: encrypted })
    .eq("id", msgIdNum)
    .eq("chat_id", chatId);

  if (error) return new Response(error.message, { status: 500 });

  return Response.json({ ok: true, messageId: msgIdNum, content: trimmedContent });
}
