import Link from "next/link";
import CharacterForm from "../CharacterForm";
import { createCharacter } from "../actions";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/auth-admin";

export default async function NewCharacterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminUser(user?.email);

  return (
    <main className="page">
      <Link href="/characters" prefetch={false} className="btn-text muted text-xs">
        ← All characters
      </Link>
      <h1 className="page-title">New character</h1>
      <div className="panel p-5 sm:p-6">
        <CharacterForm action={createCharacter} submitLabel="Create" isAdmin={isAdmin} />
      </div>
    </main>
  );
}
