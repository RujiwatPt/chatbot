import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  chatId: z.string().uuid(),
  messageId: z.coerce.number().int().positive(),
  feedback: z.enum(["more_in_character", "too_generic", "too_verbose"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthenticated", { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad_request", { status: 400 });
  const { chatId, messageId, feedback } = parsed.data;

  const { error } = await supabase.from("message_feedback").upsert(
    {
      user_id: user.id,
      chat_id: chatId,
      message_id: messageId,
      feedback,
    },
    { onConflict: "user_id,message_id,feedback", ignoreDuplicates: true },
  );
  if (error) return new Response(error.message, { status: 500 });

  return new Response("ok");
}
