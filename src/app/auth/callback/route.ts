import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/characters";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Send the browser to a tiny page that reads sessionStorage for the invite
  // code and posts it to /api/redeem-invite, then redirects to `next`.
  // We can't read sessionStorage from a server route handler.
  const target = new URL("/auth/finish", url.origin);
  target.searchParams.set("next", next);
  return NextResponse.redirect(target);
}
