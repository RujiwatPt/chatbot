import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export function sanitizeNext(nextParam: string | null): string {
  if (!nextParam) return "/characters";
  // Only allow same-origin absolute paths.
  if (!nextParam.startsWith("/")) return "/characters";
  // Block protocol-relative redirects like //evil.example or /\evil.example.
  if (nextParam.startsWith("//") || nextParam.startsWith("/\\")) return "/characters";
  return nextParam;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = sanitizeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth_callback] OAuth code exchange failed:", error.message);
      return NextResponse.redirect(new URL("/login?error=auth_failed", url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
