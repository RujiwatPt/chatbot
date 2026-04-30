import Link from "next/link";
import CharacterForm from "../CharacterForm";
import { createCharacter } from "../actions";

export default function NewCharacterPage() {
  return (
    <main className="shell space-y-5 px-1 py-5 sm:space-y-6 sm:py-8">
      <Link
        href="/characters"
        className="btn-text text-xs text-neutral-500"
      >
        ← All characters
      </Link>
      <h1 className="page-title">New character</h1>
      <div className="panel p-5 sm:p-6">
        <CharacterForm action={createCharacter} submitLabel="Create" />
      </div>
    </main>
  );
}
