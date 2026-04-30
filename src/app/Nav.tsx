import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .maybeSingle();
  // No nav until invite redeemed (no profile yet).
  if (!profile) return null;

  return (
    <nav className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4 text-sm">
        <Link href="/characters" className="font-medium">
          Roleplay
        </Link>
        <div className="flex-1 flex gap-4 text-neutral-600 dark:text-neutral-400">
          <Link href="/characters" className="hover:underline">
            Characters
          </Link>
          <Link href="/chat" className="hover:underline">
            Chats
          </Link>
        </div>
        {profile.display_name && (
          <span className="text-xs text-neutral-500 hidden sm:inline">
            {profile.display_name}
          </span>
        )}
        <SignOutButton />
      </div>
    </nav>
  );
}
