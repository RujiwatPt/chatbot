import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

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
    namespace: "chat_undo",
    limit: 10,
    windowSeconds: 60,
  });
  if (!rl.success) {
    return rateLimitResponse(rl.resetSeconds);
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

  // Find remaining max message ID
  const { data: maxMsg } = await supabase
    .from("messages")
    .select("id")
    .eq("chat_id", chatId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxRemainingId = (maxMsg?.id as number | undefined) ?? 0;

  // Delete memory rows derived from undone turns or extending past maxRemainingId
  await supabase
    .from("memories")
    .delete()
    .eq("chat_id", chatId)
    .gt("up_to_message_id", maxRemainingId);

  // If active summary contains undone message IDs, purge summary row to prevent ghost events
  const { data: summaryRow } = await supabase
    .from("memories")
    .select("id, up_to_message_id")
    .eq("chat_id", chatId)
    .eq("kind", "summary")
    .maybeSingle();

  if (
    summaryRow &&
    ((summaryRow.up_to_message_id ?? 0) > maxRemainingId ||
      toDelete.some((id) => id <= (summaryRow.up_to_message_id ?? 0)))
  ) {
    await supabase.from("memories").delete().eq("id", summaryRow.id);
  }

  return Response.json({ ok: true, deletedIds: toDelete.map(String) });
}
