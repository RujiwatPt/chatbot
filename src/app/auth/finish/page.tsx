"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthFinishPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-8 text-sm text-neutral-500">
          Finishing sign-in…
        </main>
      }
    >
      <AuthFinish />
    </Suspense>
  );
}

function AuthFinish() {
  const router = useRouter();
  const params = useSearchParams();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const next = params.get("next") || "/characters";
    const code = sessionStorage.getItem("invite_code");

    (async () => {
      if (code) {
        const res = await fetch("/api/redeem-invite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        });
        sessionStorage.removeItem("invite_code");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Could not redeem invite code.");
          return;
        }
        router.replace(next);
      } else {
        // No code stashed — let middleware route to /redeem if no profile yet
        router.replace(next);
      }
    })();
  }, [params, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-sm text-neutral-500">
        {error ? (
          <div className="space-y-3 text-center">
            <p className="text-red-600">{error}</p>
            <a href="/redeem" className="underline">
              Try a different code
            </a>
          </div>
        ) : (
          "Finishing sign-in…"
        )}
      </div>
    </main>
  );
}
