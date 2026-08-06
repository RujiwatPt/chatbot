import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { decryptText } from "@/lib/encryption";

export const runtime = "nodejs";

const BodySchema = z.object({
  chatId: z.string().uuid(),
  beforeId: z.string(),
  limit: z.number().int().min(1).max(100).optional().default(30),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("unauthorized", { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response("bad_request", { status: 400 });
  }

  const { chatId, beforeId, limit } = parsed.data;
  const beforeNum = parseInt(beforeId, 10);
  if (isNaN(beforeNum)) {
    return new Response("bad_request", { status: 400 });
  }

  const { data: ownership } = await supabase
    .from("chats")
    .select("id")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownership) {
    return new Response("not_found", { status: 404 });
  }

  const { data: rows } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("chat_id", chatId)
    .in("role", ["user", "assistant"])
    .neq("content", "")
    .lt("id", beforeNum)
    .order("id", { ascending: false })
    .limit(limit);

  const rawRows = rows ?? [];
  const hasMore = rawRows.length >= limit;
  const reversedRows = [...rawRows].reverse();

  const messages = await Promise.all(
    reversedRows.map(async (r) => {
      try {
        return {
          id: String(r.id),
          role: r.role as "user" | "assistant",
          content: await decryptText(r.content, user.id),
        };
      } catch {
        return {
          id: String(r.id),
          role: r.role as "user" | "assistant",
          content: "[Unable to decrypt message - key mismatch]",
        };
      }
    }),
  );

  return NextResponse.json({ messages, hasMore });
}
