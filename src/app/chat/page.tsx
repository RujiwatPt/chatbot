import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getCharacterAvatar } from "@/lib/avatar";

export const dynamic = "force-dynamic";

export default async function ChatListPage() {
  const supabase = await createClient();
  const { data: chats } = await supabase
    .from("chats")
    .select("id, title, created_at, character:characters(name, alias, avatar_url)")
    .order("created_at", { ascending: false });

  return (
    <main className="page">
      <div className="reveal-up flex items-center justify-between">
        <h1 className="page-title">Chats</h1>
        <Link href="/characters" className="btn-text muted text-sm">
          Characters →
        </Link>
      </div>

      {!chats?.length ? (
        <p className="muted text-sm">
          No chats yet. Pick a character to start.
        </p>
      ) : (
        <ul className="space-y-2">
          {chats.map((c, i) => {
            const character = Array.isArray(c.character)
              ? c.character[0]
              : c.character;
            const avatarUrl = getCharacterAvatar(
              character?.name || "",
              character?.alias,
              character?.avatar_url,
            );
            return (
              <li
                key={c.id}
                className="panel panel-hover stagger-item overflow-hidden"
                style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
              >
                <Link href={`/chat/${c.id}`} className="flex items-center gap-3.5 p-3.5 sm:p-4">
                  <div className="relative aspect-square w-11 h-11 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] shadow-sm bg-[color:var(--surface-solid)]">
                    <Image
                      src={avatarUrl}
                      alt={character?.name || "Avatar"}
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm sm:text-base truncate">
                      {c.title ?? character?.name ?? "Untitled"}
                    </div>
                    <div className="muted text-xs truncate">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
