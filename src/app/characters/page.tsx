import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getCharacterAvatar } from "@/lib/avatar";
import { PRESET_TAGS } from "@/lib/tags";

export const dynamic = "force-dynamic";

export default async function CharactersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tag?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q || "").trim();
  const selectedTag = (params.tag || "").trim();

  const PAGE_SIZE = 10;
  const rawPage = parseInt(params.page || "1", 10);
  const currentPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  let query = supabase
    .from("characters")
    .select(
      "id, name, alias, persona, persona_display, is_public, avatar_url, user_id, created_at, tags",
      { count: "exact" },
    );

  if (q) {
    const term = `%${q}%`;
    query = query.or(
      `name.ilike.${term},alias.ilike.${term},persona_display.ilike.${term},persona.ilike.${term}`,
    );
  }

  if (selectedTag) {
    query = query.contains("tags", [selectedTag]);
  }

  const { data: characters, count } = await query
    .order("is_public", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Query all global tags from the tags table, fallback to PRESET_TAGS
  const { data: globalTagRows } = await supabase
    .from("tags")
    .select("name, is_preset")
    .order("is_preset", { ascending: false })
    .order("name", { ascending: true });

  const displayFilterTags = globalTagRows?.length
    ? globalTagRows.map((t) => t.name)
    : Array.from(PRESET_TAGS);

  const buildUrl = (opts: { page?: number; tag?: string | null; q?: string | null }) => {
    const p = opts.page !== undefined ? opts.page : currentPage;
    const t = opts.tag !== undefined ? opts.tag : selectedTag;
    const search = opts.q !== undefined ? opts.q : q;

    const paramsObj = new URLSearchParams();
    if (search) paramsObj.set("q", search);
    if (t) paramsObj.set("tag", t);
    if (p > 1) paramsObj.set("page", String(p));

    const qs = paramsObj.toString();
    return `/characters${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="page space-y-6">
      <div className="reveal-up flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title font-extrabold">Characters</h1>
          <p className="page-subtitle mt-0.5 text-xs sm:text-sm">
            Select a companion or build your own custom roleplay persona.
          </p>
        </div>
        <Link href="/characters/new" className="btn-primary btn-sm shrink-0 px-4 py-2 self-start sm:self-auto">
          + New Character
        </Link>
      </div>

      {/* Search & Tag Filter Bar */}
      <div className="panel space-y-3.5 p-3.5 sm:p-4">
        <form method="GET" action="/characters" className="flex items-center gap-2">
          {selectedTag && <input type="hidden" name="tag" value={selectedTag} />}
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by name, alias, or personality..."
            className="field text-sm py-2 flex-1"
          />
          <button type="submit" className="btn-primary btn-sm px-4 py-2 min-h-10">
            Search
          </button>
          {(q || selectedTag) && (
            <Link
              href="/characters"
              className="btn-outline btn-sm px-3 py-2 min-h-10 text-xs font-semibold text-red-500 hover:text-red-600"
            >
              Clear
            </Link>
          )}
        </form>

        {/* Preset Tag Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5 overflow-hidden">
          <span className="text-xs font-semibold muted shrink-0 mr-1">Tags:</span>
          <Link
            href={buildUrl({ tag: null, page: 1 })}
            className={`btn-sm text-xs rounded-full px-3 py-1 font-semibold transition-all border ${
              !selectedTag
                ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                : "bg-[color:var(--surface-solid)] text-[color:var(--muted)] border-[var(--line)] hover:border-blue-500/50"
            }`}
          >
            All
          </Link>
          {displayFilterTags.map((t) => {
            const active = selectedTag === t;
            return (
              <Link
                key={t}
                href={buildUrl({ tag: active ? null : t, page: 1 })}
                className={`btn-sm text-xs rounded-full px-3 py-1 font-semibold transition-all border ${
                  active
                    ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                    : "bg-[color:var(--surface-solid)] text-[color:var(--muted)] border-[var(--line)] hover:border-blue-500/50"
                }`}
              >
                {t}
              </Link>
            );
          })}
        </div>
      </div>

      {!characters?.length ? (
        <div className="panel p-8 text-center space-y-2">
          <p className="font-semibold text-base">No characters found</p>
          <p className="muted text-xs">
            {q || selectedTag
              ? "Try adjusting your search criteria or tag filters."
              : "No characters yet. Create one to start a chat."}
          </p>
          {(q || selectedTag) && (
            <div className="pt-2">
              <Link href="/characters" className="btn-outline btn-sm text-xs">
                Reset Filters
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-4 sm:gap-5">
            {characters.map((c, i) => {
              const avatarUrl = getCharacterAvatar(c.name, c.alias, c.avatar_url);
              const charTags: string[] = Array.isArray(c.tags) ? c.tags : [];
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
                    {/* Left Side: 1:1 Square avatar image */}
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

                        {/* Character Tags Badges */}
                        {charTags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {charTags.map((tag) => (
                              <span
                                key={tag}
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  selectedTag === tag
                                    ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40"
                                    : "bg-[color:var(--surface-solid)] text-[color:var(--muted-color)] border-[var(--line)]"
                                }`}
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="muted mt-2 text-xs sm:text-sm leading-relaxed line-clamp-3 sm:line-clamp-4">
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
                  href={buildUrl({ page: currentPage - 1 })}
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
                  href={buildUrl({ page: currentPage + 1 })}
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
