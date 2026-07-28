import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CharactersPage() {
  const supabase = await createClient();
  const { data: characters } = await supabase
    .from("characters")
    .select("id, name, persona, persona_display, is_public, user_id, created_at")
    .order("is_public", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <main className="page">
      <div className="reveal-up flex items-center justify-between">
        <h1 className="page-title">Characters</h1>
        <Link href="/characters/new" className="btn-primary btn-sm">
          New
        </Link>
      </div>

      {!characters?.length ? (
        <p className="muted text-sm">
          No characters yet. Create one to start a chat.
        </p>
      ) : (
        <ul className="space-y-2">
          {characters.map((c, i) => (
            <li
              key={c.id}
              className="panel stagger-item overflow-hidden"
              style={{ animationDelay: `${Math.min(i * 55, 380)}ms` }}
            >
              <Link href={`/characters/${c.id}`} className="card-link">
                <div className="flex items-center gap-2 truncate font-medium">
                  <span className="truncate">{c.name}</span>
                  {c.is_public && (
                    <span className="badge">
                      {c.user_id === null ? "Featured" : "Public"}
                    </span>
                  )}
                </div>
                <p className="muted mt-1 line-clamp-2 text-xs">
                  {c.persona_display ?? c.persona}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
