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
            return (
              <li
                key={c.id}
                className="panel stagger-item overflow-hidden"
                style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
              >
                <Link href={`/chat/${c.id}`} className="card-link">
                  <div className="font-medium">
                    {c.title ?? character?.name ?? "Untitled"}
                  </div>
                  <div className="muted text-xs">
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
