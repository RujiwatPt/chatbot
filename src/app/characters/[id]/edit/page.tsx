import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CharacterForm from "../../CharacterForm";
import { updateCharacter, deleteCharacter } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditCharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: character } = await supabase
    .from("characters")
    .select("id, name, alias, persona, greeting, scenario, is_public")
    .eq("id", id)
    .maybeSingle();

  // Public seed characters are read-only — no edit page.
  if (!character || character.is_public) notFound();

  const update = updateCharacter.bind(null, id);
  const remove = deleteCharacter.bind(null, id);

  return (
    <main className="shell space-y-5 px-1 py-5 sm:space-y-6 sm:py-8">
      <Link
        href={`/characters/${id}`}
        className="btn-text text-xs text-neutral-500"
      >
        ← Back to {character.name}
      </Link>
      <h1 className="page-title">Edit character</h1>
      <div className="panel p-5 sm:p-6">
        <CharacterForm action={update} initial={character} submitLabel="Save" />
      </div>
      <form action={remove}>
        <button type="submit" className="btn-text text-xs text-red-600">
          Delete character
        </button>
      </form>
    </main>
  );
}
