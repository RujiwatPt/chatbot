import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AvatarImage from "@/components/AvatarImage";
import { getCharacterAvatar, getDefaultCharacterAvatar } from "@/lib/avatar";

export const dynamic = "force-dynamic";

export default async function ChatListPage({
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
  const { data: chats, count } = await supabase
    .from("chats")
    .select(
      "id, title, created_at, character:characters(name, alias, avatar_url)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="page space-y-4">
      <div className="reveal-up flex items-center justify-between">
        <h1 className="page-title">Chats</h1>
        <Link href="/characters" prefetch={false} className="btn-text muted text-sm">
          Characters →
        </Link>
      </div>

      {!chats?.length ? (
        <p className="muted text-sm">
          No chats yet. Pick a character to start.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {chats.map((c, i) => {
              const character = Array.isArray(c.character)
                ? c.character[0]
                : c.character;
              const avatarUrl = getCharacterAvatar(
                character?.name || "",
                character?.alias,
                character?.avatar_url,
              );
              const avatarFallbackUrl = getDefaultCharacterAvatar(
                character?.name || "",
                character?.alias,
              );
              return (
                <li
                  key={c.id}
                  className="panel panel-hover stagger-item overflow-hidden"
                  style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
                >
                  <Link
                    href={`/chat/${c.id}`}
                    prefetch={false}
                    className="flex items-center gap-3.5 p-3.5 sm:p-4"
                  >
                    <div className="relative aspect-square w-11 h-11 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] shadow-sm bg-[color:var(--surface-solid)]">
                      <AvatarImage
                        src={avatarUrl}
                        fallbackSrc={avatarFallbackUrl}
                        alt={character?.name || "Avatar"}
                        sizes="44px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm sm:text-base truncate">
                        {c.title ?? character?.name ?? "Untitled"}
                      </div>
                      <div className="muted text-xs truncate">
                        {new Date(c.created_at).toLocaleString()}
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
              aria-label="Chat list pagination"
            >
              {currentPage > 1 ? (
                <Link
                  href={`/chat?page=${currentPage - 1}`}
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
                  href={`/chat?page=${currentPage + 1}`}
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
