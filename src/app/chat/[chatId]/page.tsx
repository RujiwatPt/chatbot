import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const { data: chat } = await supabase
    .from("chats")
    .select("id, title, character:characters(name)")
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
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800 p-3 flex items-center justify-between max-w-2xl mx-auto w-full">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {chat.title ?? character?.name ?? "Chat"}
          </div>
          <div className="text-xs text-neutral-500 truncate">
            {character?.name}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/chat" className="text-xs underline">
            All chats
          </Link>
          <form action={deleteChat.bind(null, chatId)}>
            <button type="submit" className="text-xs text-red-600 underline">
              Delete
            </button>
          </form>
        </div>
      </header>
      <ChatClient chatId={chatId} initialMessages={initialMessages} />
    </main>
  );
}
