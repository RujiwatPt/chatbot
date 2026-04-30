import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/auth/callback", "/auth/finish"];
const REDEEM_PATH = "/redeem";
// Paths an authed-but-no-profile user is allowed to hit
const NO_PROFILE_OK = new Set([
  "/redeem",
  "/api/redeem-invite",
  "/auth/finish",
  "/auth/callback",
]);

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const isRedeem = pathname === REDEEM_PATH;
  const isApi = pathname.startsWith("/api/");

  // Not logged in → only public paths allowed; API gets a 401 (not a redirect)
  if (!user) {
    if (isPublic) return response;
    if (isApi) return new NextResponse("unauthenticated", { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // For API routes, auth alone is enough — RLS authorizes per-row access.
  // Skipping the profiles lookup avoids an extra round-trip on every /api/chat.
  if (isApi) return response;

  // Logged in: check for profile (= invite redeemed)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    if (NO_PROFILE_OK.has(pathname)) return response;
    const url = request.nextUrl.clone();
    url.pathname = REDEEM_PATH;
    return NextResponse.redirect(url);
  }

  // Has profile but on /login or /redeem → bounce to app
  if (pathname === "/login" || isRedeem) {
    const url = request.nextUrl.clone();
    url.pathname = "/characters";
    return NextResponse.redirect(url);
  }

  return response;
}
