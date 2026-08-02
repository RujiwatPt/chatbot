"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      // Hard redirect to clear all App Router caches and cookies
      window.location.href = "/login";
    }
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={busy}
      className="btn-text muted text-xs"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
