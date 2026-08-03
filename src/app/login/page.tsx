"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "../ThemeToggle";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: false,
        },
      });

      if (error) {
        setBusy(false);
        setErrorMessage(error.message);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setBusy(false);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to initiate sign in",
      );
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <ThemeToggle className="theme-toggle-corner" />
      <div className="panel w-full max-w-md space-y-6 p-6 sm:p-7">
        <div className="text-center space-y-2">
          <h1 className="page-title">Sign in</h1>
          <p className="page-subtitle">Continue with Google to get started.</p>
        </div>

        {errorMessage && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 font-medium text-center">
            {errorMessage}
          </div>
        )}

        <button
          onClick={signIn}
          disabled={busy}
          className="btn-primary w-full min-h-11"
        >
          {busy ? "Redirecting to Google…" : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}
