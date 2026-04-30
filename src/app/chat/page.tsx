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
    <main className="max-w-2xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chats</h1>
        <Link href="/characters" className="text-sm underline">
          Characters →
        </Link>
      </div>

      {!chats?.length ? (
        <p className="text-sm text-neutral-500">
          No chats yet. Pick a character to start.
        </p>
      ) : (
        <ul className="space-y-2">
          {chats.map((c) => {
            const character = Array.isArray(c.character)
              ? c.character[0]
              : c.character;
            return (
              <li
                key={c.id}
                className="rounded-md border border-neutral-200 dark:border-neutral-800"
              >
                <Link
                  href={`/chat/${c.id}`}
                  className="block p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
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
