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
    .select("id, name, persona, greeting, scenario, is_public")
    .eq("id", id)
    .maybeSingle();

  // Public seed characters are read-only — no edit page.
  if (!character || character.is_public) notFound();

  const update = updateCharacter.bind(null, id);
  const remove = deleteCharacter.bind(null, id);

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-6">
      <Link
        href={`/characters/${id}`}
        className="text-xs text-neutral-500 hover:underline"
      >
        ← Back to {character.name}
      </Link>
      <h1 className="text-2xl font-semibold">Edit character</h1>
      <CharacterForm action={update} initial={character} submitLabel="Save" />
      <form action={remove}>
        <button type="submit" className="text-xs text-red-600 underline">
          Delete character
        </button>
      </form>
    </main>
  );
}
