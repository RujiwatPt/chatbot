import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getCharacterAvatar } from "@/lib/avatar";

export const dynamic = "force-dynamic";

export default async function CharactersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const PAGE_SIZE = 10;
  const rawPage = parseInt(params.page || "1", 10);
  const currentPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data: characters, count } = await supabase
    .from("characters")
    .select(
      "id, name, alias, persona, persona_display, is_public, avatar_url, user_id, created_at",
      { count: "exact" },
    )
    .order("is_public", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
          No characters found. Create one to start a chat.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-4 sm:gap-5">
            {characters.map((c, i) => {
              const avatarUrl = getCharacterAvatar(c.name, c.alias, c.avatar_url);
              return (
                <li
                  key={c.id}
                  className="panel panel-hover group stagger-item overflow-hidden"
                  style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
                >
                  <Link
                    href={`/characters/${c.id}`}
                    className="flex items-center gap-4 p-4 sm:p-5 transition-colors hover:bg-[color:var(--surface-solid)]/40"
                  >
                    {/* Left Side: Strict 1:1 Square avatar image */}
                    <div className="relative aspect-square w-28 h-28 sm:w-36 sm:h-36 md:w-40 md:h-40 shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] shadow-sm bg-[color:var(--surface-solid)]">
                      <Image
                        src={avatarUrl}
                        alt={c.name}
                        fill
                        sizes="(max-width: 640px) 112px, 160px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>

                    {/* Right Side: Description and character info */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
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

          {totalPages > 1 && (
            <nav
              className="mt-6 flex items-center justify-between gap-2 pt-4 border-t border-[var(--line)]"
              aria-label="Character list pagination"
            >
              {currentPage > 1 ? (
                <Link
                  href={`/characters?page=${currentPage - 1}`}
                  className="btn-outline btn-sm px-3 py-1.5 text-xs font-semibold"
                >
                  ← Previous
                </Link>
              ) : (
                <span className="btn-outline btn-sm opacity-40 cursor-not-allowed px-3 py-1.5 text-xs font-semibold">
                  ← Previous
                </span>
              )}

              <div className="flex items-center gap-1.5 text-xs muted font-medium">
                <span>
                  Page <strong className="text-[color:var(--foreground)]">{currentPage}</strong> of{" "}
                  <strong>{totalPages}</strong>
                </span>
                <span className="hidden sm:inline">({totalCount} total)</span>
              </div>

              {currentPage < totalPages ? (
                <Link
                  href={`/characters?page=${currentPage + 1}`}
                  className="btn-outline btn-sm px-3 py-1.5 text-xs font-semibold"
                >
                  Next →
                </Link>
              ) : (
                <span className="btn-outline btn-sm opacity-40 cursor-not-allowed px-3 py-1.5 text-xs font-semibold">
                  Next →
                </span>
              )}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
