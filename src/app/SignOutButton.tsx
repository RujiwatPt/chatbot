"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.replace("/");
        router.refresh();
      }}
      className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 underline"
    >
      Sign out
    </button>
  );
}
