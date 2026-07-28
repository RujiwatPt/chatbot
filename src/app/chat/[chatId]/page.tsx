import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCharacterAvatar } from "@/lib/avatar";
import ChatClient from "./ChatClient";
import FontSizeControl from "./FontSizeControl";
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

  const avatarUrl = getCharacterAvatar(character?.name || "", character?.alias);

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
      <header className="panel shell shrink-0 flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--line)] shadow-sm">
            <Image
              src={avatarUrl}
              alt={character?.name || "Avatar"}
              width={64}
              height={64}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">
              {chat.title ?? character?.alias ?? character?.name ?? "Chat"}
            </div>
            <div className="muted text-xs truncate flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {character?.alias || character?.name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 pl-1">
          <FontSizeControl />
          <Link href="/chat" className="btn-text muted text-xs">
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
        avatarUrl={avatarUrl}
      />
    </main>
  );
}
