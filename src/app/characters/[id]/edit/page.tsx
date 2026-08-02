import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CharacterForm from "../../CharacterForm";
import { updateCharacter, deleteCharacter } from "../../actions";

import DeleteCharacterButton from "./DeleteCharacterButton";

export const dynamic = "force-dynamic";

export default async function EditCharacterPage({
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
    .select("id, name, alias, persona, greeting, scenario, is_public, avatar_url, user_id, tags")
    .eq("id", id)
    .maybeSingle();

  // System seed characters are read-only — no edit page.
  if (!character || character.user_id === null || character.user_id !== user?.id) {
    notFound();
  }

  const update = updateCharacter.bind(null, id);
  const remove = deleteCharacter.bind(null, id);

  return (
    <main className="page">
      <Link href={`/characters/${id}`} className="btn-text muted text-xs">
        ← Back to {character.name}
      </Link>
      <h1 className="page-title">Edit character</h1>
      <div className="panel p-5 sm:p-6">
        <CharacterForm action={update} initial={character} submitLabel="Save" />
      </div>
      <form action={remove}>
        <DeleteCharacterButton />
      </form>
    </main>
  );
}
