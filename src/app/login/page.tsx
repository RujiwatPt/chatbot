"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
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
    <main className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <div className="panel w-full max-w-md space-y-6 p-6 sm:p-7">
        <div className="text-center space-y-2">
          <h1 className="page-title">Sign in</h1>
          <p className="page-subtitle">Continue with Google to get started.</p>
        </div>
        <button
          onClick={signIn}
          disabled={busy}
          className="btn-primary w-full"
        >
          {busy ? "Redirecting…" : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}
