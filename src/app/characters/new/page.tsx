import Link from "next/link";
import CharacterForm from "../CharacterForm";
import { createCharacter } from "../actions";

export default function NewCharacterPage() {
  return (
    <main className="page">
      <Link href="/characters" className="btn-text muted text-xs">
        ← All characters
      </Link>
      <h1 className="page-title">New character</h1>
      <div className="panel p-5 sm:p-6">
        <CharacterForm action={createCharacter} submitLabel="Create" />
      </div>
    </main>
  );
}
