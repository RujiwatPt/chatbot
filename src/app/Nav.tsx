import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <nav className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color:var(--surface)]/80 backdrop-blur-xl">
      <div className="shell flex items-center gap-4 px-4 py-3 text-sm">
        <Link href="/characters" className="font-medium">
          Roleplay
        </Link>
        <div className="flex flex-1 gap-4 text-[color:var(--muted)]">
          <Link href="/characters" className="btn-text">
            Characters
          </Link>
          <Link href="/chat" className="btn-text">
            Chats
          </Link>
        </div>
        {user.email && (
          <span className="text-xs text-neutral-500 hidden sm:inline">
            {user.email}
          </span>
        )}
        <SignOutButton />
      </div>
    </nav>
  );
}
