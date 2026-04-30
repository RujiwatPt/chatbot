"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    if (code.trim()) {
      sessionStorage.setItem("invite_code", code.trim());
    }
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setBusy(false);
      alert(error.message);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-neutral-500">
            New here? Enter your invite code first.
          </p>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Invite code (new accounts only)"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          onClick={signIn}
          disabled={busy}
          className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? "Redirecting…" : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}
