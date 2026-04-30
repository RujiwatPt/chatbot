import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ChatListPage() {
  const supabase = await createClient();
  const { data: chats } = await supabase
    .from("chats")
    .select("id, title, created_at, character:characters(name)")
    .order("created_at", { ascending: false });

  return (
    <main className="shell space-y-5 px-1 py-5 sm:space-y-6 sm:py-8">
      <div className="reveal-up flex items-center justify-between">
        <h1 className="page-title">Chats</h1>
        <Link href="/characters" className="btn-text text-sm">
          Characters →
        </Link>
      </div>

      {!chats?.length ? (
        <p className="text-sm text-neutral-500">
          No chats yet. Pick a character to start.
        </p>
      ) : (
        <ul className="space-y-2">
          {chats.map((c, i) => {
            const character = Array.isArray(c.character)
              ? c.character[0]
              : c.character;
            return (
              <li
                key={c.id}
                className="panel stagger-item overflow-hidden"
                style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
              >
                <Link
                  href={`/chat/${c.id}`}
                  className="block p-4 transition-colors hover:bg-white/40 dark:hover:bg-slate-900/40"
                >
                  <div className="font-medium">
                    {c.title ?? character?.name ?? "Untitled"}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(c.created_at).toLocaleString()}
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
