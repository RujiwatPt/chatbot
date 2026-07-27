import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
    .select("id")
    .eq("chat_id", chatId)
    .eq("role", "user")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestUser) return new Response("nothing_to_undo", { status: 400 });

  const { data: latestAssistant } = await supabase
    .from("messages")
    .select("id")
    .eq("chat_id", chatId)
    .eq("role", "assistant")
    .gt("id", latestUser.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const toDelete = [latestUser.id, latestAssistant?.id].filter(Boolean) as number[];
  const { error } = await supabase.from("messages").delete().in("id", toDelete);
  if (error) return new Response(error.message, { status: 500 });

  // Sanitize memory progress pointers if deleted messages were past the memory checkpoint
  const { data: maxMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("chat_id", chatId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxRemainingId = (maxMsg?.id as number | undefined) ?? 0;

  await supabase
    .from("memories")
    .update({ up_to_message_id: maxRemainingId })
    .eq("chat_id", chatId)
    .gt("up_to_message_id", maxRemainingId);

  return Response.json({ ok: true, deletedIds: toDelete.map(String) });
}
