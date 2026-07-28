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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: character } = await supabase
    .from("characters")
    .select("id, name, alias, persona, persona_display, scenario, is_public, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!character) notFound();

  const isOwner = character.user_id === user?.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .maybeSingle();

  const { data: chats } = await supabase
    .from("chats")
    .select("id, title, created_at")
    .eq("character_id", id)
    .order("created_at", { ascending: false });

  const start = startChat.bind(null, id);

  return (
    <main className="page">
      <Link href="/characters" className="btn-text muted text-xs">
        ← All characters
      </Link>

      <header className="panel reveal-up space-y-3 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <h1 className="page-title">{character.name}</h1>
          {character.alias && (
            <span className="muted text-xs">({character.alias})</span>
          )}
          {character.is_public && (
            <span className="badge">
              {character.user_id === null ? "Featured" : "Public"}
            </span>
          )}
        </div>
        {character.scenario && (
          <p className="muted text-sm italic">{character.scenario}</p>
        )}
        <p className="whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
          {character.persona_display ?? character.persona}
        </p>
        {isOwner && (
          <Link
            href={`/characters/${id}/edit`}
            className="btn-text muted inline-block text-xs"
          >
            Edit character
          </Link>
        )}
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Your chats with {character.name}</h2>

        <form action={start} className="panel space-y-3 p-4">
          <p className="muted text-xs">
            How should {character.name} refer to you in this chat?
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <label htmlFor="user_name" className="label">
                Your name
              </label>
              <input
                id="user_name"
                name="user_name"
                maxLength={60}
                defaultValue={profile?.display_name ?? ""}
                placeholder="e.g. Alex"
                className="field"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="user_pronouns" className="label">
                Your pronouns
              </label>
              <select
                id="user_pronouns"
                name="user_pronouns"
                defaultValue=""
                className="field"
              >
                <option value="">Prefer not to say</option>
                <option value="she/her">she/her</option>
                <option value="he/him">he/him</option>
                <option value="they/them">they/them</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary btn-sm">
            Start new chat
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">History</h2>

        {!chats?.length ? (
          <p className="muted text-sm">
            No chats yet. Start a new one to begin.
          </p>
        ) : (
          <ul className="space-y-2">
            {chats.map((c, i) => (
              <li
                key={c.id}
                className="panel stagger-item overflow-hidden"
                style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
              >
                <Link href={`/chat/${c.id}`} className="card-link">
                  <div className="text-sm font-medium">
                    {c.title ?? "Untitled"}
                  </div>
                  <div className="muted text-xs">
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
