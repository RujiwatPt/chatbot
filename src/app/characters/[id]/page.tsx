import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startChat } from "../../chat/actions";

import Image from "next/image";
import { getCharacterAvatar } from "@/lib/avatar";
import StartChatSubmitButton from "./StartChatSubmitButton";

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
    .select("id, name, alias, persona, persona_display, scenario, avatar_url, is_public, user_id, tags")
    .eq("id", id)
    .maybeSingle();
  if (!character) notFound();

  const avatarUrl = getCharacterAvatar(character.name, character.alias, character.avatar_url);
  const isOwner = character.user_id === user?.id;
  const tags: string[] = Array.isArray(character.tags) ? character.tags : [];

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

      <header className="panel reveal-up flex flex-col sm:flex-row items-start gap-4 sm:gap-5 p-5 sm:p-6">
        <div className="relative aspect-square w-20 h-20 sm:w-24 sm:h-24 shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] shadow-sm bg-[color:var(--surface-solid)]">
          <Image
            src={avatarUrl}
            alt={character.name}
            fill
            sizes="(max-width: 640px) 80px, 96px"
            className="object-cover"
          />
        </div>

        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
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
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {tags.map((t) => (
                <Link
                  key={t}
                  href={`/characters?tag=${encodeURIComponent(t)}`}
                  className="badge hover:border-blue-500/50 transition-colors"
                >
                  #{t}
                </Link>
              ))}
            </div>
          )}
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
        </div>
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
          <StartChatSubmitButton />
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
