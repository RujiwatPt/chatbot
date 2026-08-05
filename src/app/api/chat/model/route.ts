import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sanitizeModel } from "@/lib/openrouter";

const Body = z.object({
  chatId: z.string().uuid(),
  modelId: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("unauthorized", { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return new Response("bad_request", { status: 400 });
  }

  const { chatId, modelId } = parsed.data;
  const sanitized = sanitizeModel(modelId);

  const { error } = await supabase
    .from("chats")
    .update({ model: sanitized })
    .eq("id", chatId)
    .eq("user_id", user.id);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return Response.json({ ok: true, modelId: sanitized });
}
