import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

function applySecurityHeaders(request: NextRequest, response: Response, nonce: string) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'nonce-${nonce}'`,
      "connect-src 'self' https: wss:",
    ].join("; "),
  );
  return response;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  request.headers.set("x-nonce", nonce);

  // Apply Edge Rate Limiting on API endpoints (60 req/min per IP)
  if (pathname.startsWith("/api/")) {
    const ip = getClientIp(request);
    const rl = checkRateLimit({
      identifier: ip,
      namespace: "middleware_api_ip",
      limit: 60,
      windowSeconds: 60,
    });

    if (!rl.success) {
      const res = rateLimitResponse(rl.resetSeconds);
      return applySecurityHeaders(request, res, nonce);
    }
  }

  const response = await updateSession(request);
  return applySecurityHeaders(request, response, nonce);
}

export const config = {
  matcher: [
    // Skip Next internals + static files; run on everything else
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
