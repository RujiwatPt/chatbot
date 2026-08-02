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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: chat } = await supabase
    .from("chats")
    .select("id, title, character:characters(name, alias, avatar_url)")
    .eq("id", chatId)
    .maybeSingle();

  if (!chat) notFound();

  const character = Array.isArray(chat.character)
    ? chat.character[0]
    : chat.character;

  const avatarUrl = getCharacterAvatar(
    character?.name || "",
    character?.alias,
    character?.avatar_url,
  );

  const { data: rows } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("chat_id", chatId)
    .in("role", ["user", "assistant"])
    .order("id", { ascending: true });

  const initialMessages = await Promise.all(
    (rows ?? []).map(async (r) => ({
      id: String(r.id),
      role: r.role as "user" | "assistant",
      content: user ? await decryptText(r.content, user.id) : r.content,
    })),
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden py-1 sm:py-2">
      <ChatClient
        chatId={chatId}
        initialMessages={initialMessages}
        chatbotName={character?.alias ?? character?.name ?? "Chatbot"}
        chatTitle={chat.title ?? character?.alias ?? character?.name ?? "Chat"}
        avatarUrl={avatarUrl}
        deleteAction={deleteChat.bind(null, chatId)}
      />
    </main>
  );
}
