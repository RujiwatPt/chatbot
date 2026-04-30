import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatClient from "./ChatClient";
import { deleteChat } from "../actions";
import DeleteChatButton from "./DeleteChatButton";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const supabase = await createClient();

  const { data: chat } = await supabase
    .from("chats")
    .select("id, title, character:characters(name, alias)")
    .eq("id", chatId)
    .maybeSingle();

  if (!chat) notFound();

  const character = Array.isArray(chat.character)
    ? chat.character[0]
    : chat.character;

  const { data: rows } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("chat_id", chatId)
    .in("role", ["user", "assistant"])
    .order("id", { ascending: true });

  const initialMessages = (rows ?? []).map((r) => ({
    id: String(r.id),
    role: r.role as "user" | "assistant",
    content: r.content,
  }));

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden py-2 sm:py-4">
      <header className="panel shell flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {chat.title ?? character?.name ?? "Chat"}
          </div>
          <div className="text-xs text-neutral-500 truncate">
            {character?.name}
          </div>
        </div>
        <div className="flex items-center gap-3 pl-1">
          <Link href="/chat" className="btn-text text-xs">
            All chats
          </Link>
          <form action={deleteChat.bind(null, chatId)}>
            <DeleteChatButton />
          </form>
        </div>
      </header>
      <ChatClient
        chatId={chatId}
        initialMessages={initialMessages}
        chatbotName={character?.alias ?? character?.name ?? "Chatbot"}
      />
    </main>
  );
}
