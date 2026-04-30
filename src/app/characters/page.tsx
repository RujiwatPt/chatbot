import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const supabase = await createClient();
  const { data: characters } = await supabase
    .from("characters")
    .select("id, name, persona, is_public, created_at")
    .order("is_public", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Characters</h1>
        <Link
          href="/characters/new"
          className="rounded-md bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
        >
          New
        </Link>
      </div>

      {!characters?.length ? (
        <p className="text-sm text-neutral-500">
          No characters yet. Create one to start a chat.
        </p>
      ) : (
        <ul className="space-y-2">
          {characters.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-neutral-200 dark:border-neutral-800"
            >
              <Link
                href={`/characters/${c.id}`}
                className="block p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="font-medium truncate flex items-center gap-2">
                  <span className="truncate">{c.name}</span>
                  {c.is_public && (
                    <span className="text-[10px] uppercase tracking-wide rounded bg-neutral-200 px-1.5 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      Featured
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 line-clamp-2 mt-1">
                  {c.persona}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
