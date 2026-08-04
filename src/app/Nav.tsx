import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import ThemeToggle from "./ThemeToggle";

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (
    <nav className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color:var(--surface)]/80 backdrop-blur-xl">
      <div className="shell flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm sm:px-4 sm:py-3">
        <Link href="/" prefetch={false} className="font-semibold text-base hover:text-blue-500 transition-colors tracking-tight">
          Howly.ai
        </Link>
        <div className="muted order-3 flex w-full gap-4 sm:order-2 sm:w-auto sm:flex-1">
          <Link href="/characters" prefetch={false} className="btn-text">
            Characters
          </Link>
          <Link href="/chat" prefetch={false} className="btn-text">
            Chats
          </Link>
          <Link href="/settings" prefetch={false} className="btn-text">
            Settings
          </Link>
        </div>
        {user.email && (
          <span className="muted order-2 hidden text-xs sm:inline">
            {user.email}
          </span>
        )}
        <ThemeToggle className="order-2" />
        <div className="order-2 ml-auto sm:ml-0">
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
