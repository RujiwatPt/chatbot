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
      <div className="shell flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm sm:px-4 sm:py-3">
        <Link href="/characters" className="font-medium">
          Roleplay
        </Link>
        <div className="order-3 flex w-full gap-4 text-[color:var(--muted)] sm:order-2 sm:w-auto sm:flex-1">
          <Link href="/characters" className="btn-text">
            Characters
          </Link>
          <Link href="/chat" className="btn-text">
            Chats
          </Link>
        </div>
        {user.email && (
          <span className="order-2 text-xs text-neutral-500 hidden sm:inline">
            {user.email}
          </span>
        )}
        <div className="order-2 ml-auto sm:ml-0">
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
