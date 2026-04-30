"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RedeemPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/redeem-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not redeem code.");
      setBusy(false);
      return;
    }
    router.replace("/characters");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Enter invite code</h1>
          <p className="text-sm text-neutral-500">
            You&apos;re signed in but need an invite to access the app.
          </p>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Invite code"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={submit}
          disabled={busy || !code.trim()}
          className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? "Redeeming…" : "Redeem"}
        </button>
        <button
          onClick={signOut}
          className="w-full text-xs text-neutral-500 underline"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
