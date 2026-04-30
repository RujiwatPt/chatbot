import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/auth/callback"];

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
  if (isApi) return response;

  // Logged in users should not stay on login.
  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/characters";
    return NextResponse.redirect(url);
  }

  return response;
}
