import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCharacterAvatar } from "@/lib/avatar";
import { decryptText } from "@/lib/encryption";
import ChatClient from "./ChatClient";
import { deleteChat } from "../actions";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const supabase = await createClient();

  // Fetch auth, chat metadata, and message rows concurrently. The message query
  // only needs chatId; user.id is used later just to decrypt the content.
  const [
    {
      data: { user },
    },
    { data: chat },
    { data: rows },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("chats")
      .select("*, character:characters(name, alias, avatar_url, scenario, model)")
      .eq("id", chatId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id, role, content")
      .eq("chat_id", chatId)
      .in("role", ["user", "assistant"])
      .order("id", { ascending: false })
      .limit(50),
  ]);

  if (!chat) notFound();

  const character = Array.isArray(chat.character)
    ? chat.character[0]
    : chat.character;

  const avatarUrl = getCharacterAvatar(
    character?.name || "",
    character?.alias,
    character?.avatar_url,
  );

  const rawRows = rows ?? [];
  const initialHasMore = rawRows.length >= 50;
  const reversedRows = [...rawRows].reverse();

  const initialMessages = await Promise.all(
    reversedRows.map(async (r) => {
      try {
        return {
          id: String(r.id),
          role: r.role as "user" | "assistant",
          content: user ? await decryptText(r.content, user.id) : r.content,
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

  const currentModelId = chat.model || character?.model || "sao10k/l3.3-euryale-70b";

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden py-1 sm:py-2">
      <ChatClient
        chatId={chatId}
        initialMessages={initialMessages}
        initialHasMore={initialHasMore}
        chatbotName={character?.alias ?? character?.name ?? "Chatbot"}
        chatTitle={chat.title ?? character?.alias ?? character?.name ?? "Chat"}
        avatarUrl={avatarUrl}
        scenario={character?.scenario ?? null}
        initialModelId={currentModelId}
        deleteAction={deleteChat.bind(null, chatId)}
      />
    </main>
  );
}
