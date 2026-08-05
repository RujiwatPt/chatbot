"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../ThemeToggle";

export default function RedeemInvitePage() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setBusy(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/redeem-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });

      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !data?.ok) {
        setErrorMessage(
          data?.error === "invalid_or_used_code"
            ? "Invalid or already used invite code."
            : data?.error || "Failed to redeem invite code.",
        );
        setBusy(false);
        return;
      }

      router.push("/characters");
      router.refresh();
    } catch {
      setBusy(false);
      setErrorMessage("Network error. Please try again.");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <ThemeToggle className="theme-toggle-corner" />
      <div className="panel w-full max-w-md space-y-6 p-6 sm:p-7">
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 text-xl font-bold">
            🎟️
          </div>
          <h1 className="page-title">Invite Required</h1>
          <p className="page-subtitle">
            Howly.ai is currently invite-only. Enter your invite code below to gain access.
          </p>
        </div>

        {errorMessage && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 font-medium text-center">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite_code" className="block text-xs font-medium muted mb-1.5">
              Invite Code
            </label>
            <input
              id="invite_code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. ALPHA-USER-2026"
              required
              disabled={busy}
              className="input-field w-full uppercase tracking-wider font-mono text-center"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="btn-primary w-full min-h-11"
          >
            {busy ? "Redeeming..." : "Redeem Invite Code"}
          </button>
        </form>

        <div className="text-center pt-2">
          <a href="/login" className="btn-text muted text-xs">
            Sign in with a different account
          </a>
        </div>
      </div>
    </main>
  );
}
