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
        <ul className="flex flex-col gap-4 sm:gap-5">
          {characters.map((c, i) => {
            const avatarUrl = getCharacterAvatar(c.name, c.alias);
            return (
              <li
                key={c.id}
                className="panel panel-hover group stagger-item overflow-hidden"
                style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
              >
                <Link
                  href={`/characters/${c.id}`}
                  className="flex items-stretch min-h-[160px] sm:min-h-[195px] transition-colors hover:bg-[color:var(--surface-solid)]/40"
                >
                  {/* Left Side: Full height image covering 100% of left side edge-to-edge */}
                  <div className="relative w-32 sm:w-48 md:w-56 shrink-0 overflow-hidden">
                    <Image
                      src={avatarUrl}
                      alt={c.name}
                      fill
                      sizes="(max-width: 640px) 128px, 224px"
                      className="object-cover object-top transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>

                  {/* Right Side: Description and character info filling all remaining space */}
                  <div className="flex min-w-0 flex-1 flex-col justify-between p-4 sm:p-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-bold sm:text-xl group-hover:text-blue-500 transition-colors">
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
                      <p className="muted mt-2 text-xs sm:text-sm leading-relaxed line-clamp-3 sm:line-clamp-4 md:line-clamp-5">
                        {c.persona_display ?? c.persona}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-[var(--line)]/50">
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:underline">
                        Start roleplay →
                      </span>
                      <span className="muted text-lg transition-transform group-hover:translate-x-1" aria-hidden>
                        ›
                      </span>
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
