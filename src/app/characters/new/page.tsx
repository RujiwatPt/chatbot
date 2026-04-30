import Link from "next/link";
import CharacterForm from "../CharacterForm";
import { createCharacter } from "../actions";

export default function NewCharacterPage() {
  return (
    <main className="max-w-2xl mx-auto p-8 space-y-6">
      <Link
        href="/characters"
        className="text-xs text-neutral-500 hover:underline"
      >
        ← All characters
      </Link>
      <h1 className="text-2xl font-semibold">New character</h1>
      <CharacterForm action={createCharacter} submitLabel="Create" />
    </main>
  );
}
