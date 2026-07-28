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
      <div className="reveal-up flex items-center justify-between">
        <div>
          <h1 className="page-title font-extrabold">Characters</h1>
          <p className="page-subtitle text-xs sm:text-sm mt-0.5">
            Select a companion or build your own custom roleplay persona.
          </p>
        </div>
        <Link href="/characters/new" className="btn-primary btn-sm px-4 py-2">
          + New Character
        </Link>
      </div>

      {!characters?.length ? (
        <p className="muted text-sm">
          No characters yet. Create one to start a chat.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {characters.map((c, i) => {
            const avatarUrl = getCharacterAvatar(c.name, c.alias);
            return (
              <div
                key={c.id}
                className="panel panel-hover stagger-item overflow-hidden"
                style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
              >
                <Link href={`/characters/${c.id}`} className="card-link flex gap-3.5 items-start">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] shadow-sm">
                    <Image
                      src={avatarUrl}
                      alt={c.name}
                      width={100}
                      height={100}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate font-bold text-sm sm:text-base">
                      <span className="truncate">{c.alias || c.name}</span>
                      {c.is_public && (
                        <span className="badge shrink-0">
                          {c.user_id === null ? "Featured" : "Public"}
                        </span>
                      )}
                    </div>
                    <p className="muted mt-1 line-clamp-2 text-xs leading-relaxed">
                      {c.persona_display ?? c.persona}
                    </p>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
