import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startChat } from "../../chat/actions";

export const dynamic = "force-dynamic";

export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: character } = await supabase
    .from("characters")
    .select("id, name, persona, scenario, is_public")
    .eq("id", id)
    .maybeSingle();
  if (!character) notFound();

  const { data: chats } = await supabase
    .from("chats")
    .select("id, title, created_at")
    .eq("character_id", id)
    .order("created_at", { ascending: false });

  const start = startChat.bind(null, id);

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-6">
      <Link
        href="/characters"
        className="text-xs text-neutral-500 hover:underline"
      >
        ← All characters
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{character.name}</h1>
          {character.is_public && (
            <span className="text-[10px] uppercase tracking-wide rounded bg-neutral-200 px-1.5 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              Featured
            </span>
          )}
        </div>
        {character.scenario && (
          <p className="text-sm text-neutral-500 italic">
            {character.scenario}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
          {character.persona}
        </p>
        {!character.is_public && (
          <Link
            href={`/characters/${id}/edit`}
            className="inline-block text-xs underline text-neutral-500"
          >
            Edit character
          </Link>
        )}
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Your chats with {character.name}</h2>
          <form action={start}>
            <button
              type="submit"
              className="rounded-md bg-black px-3 py-1.5 text-xs text-white dark:bg-white dark:text-black"
            >
              Start new chat
            </button>
          </form>
        </div>

        {!chats?.length ? (
          <p className="text-sm text-neutral-500">
            No chats yet. Start a new one to begin.
          </p>
        ) : (
          <ul className="space-y-2">
            {chats.map((c) => (
              <li
                key={c.id}
                className="rounded-md border border-neutral-200 dark:border-neutral-800"
              >
                <Link
                  href={`/chat/${c.id}`}
                  className="block p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div className="text-sm font-medium">
                    {c.title ?? "Untitled"}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(c.created_at).toLocaleString()}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
