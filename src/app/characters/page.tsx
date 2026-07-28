import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getCharacterAvatar } from "@/lib/avatar";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const supabase = await createClient();
  const { data: characters } = await supabase
    .from("characters")
    .select("id, name, alias, persona, persona_display, is_public, user_id, created_at")
    .order("is_public", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <main className="page">
      <div className="reveal-up flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title font-extrabold">Characters</h1>
          <p className="page-subtitle mt-0.5 text-xs sm:text-sm">
            Select a companion or build your own custom roleplay persona.
          </p>
        </div>
        <Link href="/characters/new" className="btn-primary btn-sm shrink-0 px-4 py-2">
          + New Character
        </Link>
      </div>

      {!characters?.length ? (
        <p className="muted text-sm">
          No characters yet. Create one to start a chat.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 sm:gap-4">
          {characters.map((c, i) => {
            const avatarUrl = getCharacterAvatar(c.name, c.alias);
            return (
              <li
                key={c.id}
                className="panel panel-hover stagger-item overflow-hidden"
                style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
              >
                <Link
                  href={`/characters/${c.id}`}
                  className="card-link flex items-stretch gap-3.5 sm:gap-5"
                >
                  {/* Large portrait — vertical list gives this room the grid never had. */}
                  <div className="relative h-36 w-28 shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] shadow-sm sm:h-44 sm:w-36">
                    <Image
                      src={avatarUrl}
                      alt={c.name}
                      fill
                      sizes="(max-width: 640px) 112px, 144px"
                      className="object-cover"
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-bold sm:text-xl">
                        {c.alias || c.name}
                      </h2>
                      {c.is_public && (
                        <span className="badge shrink-0">
                          {c.user_id === null ? "Featured" : "Public"}
                        </span>
                      )}
                    </div>
                    {c.alias && c.alias !== c.name && (
                      <p className="muted mt-0.5 text-xs">{c.name}</p>
                    )}
                    <p className="muted mt-2 line-clamp-4 text-sm leading-relaxed sm:line-clamp-5 sm:text-[0.9375rem]">
                      {c.persona_display ?? c.persona}
                    </p>
                  </div>

                  <span
                    className="muted hidden shrink-0 self-center text-2xl sm:block"
                    aria-hidden
                  >
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
