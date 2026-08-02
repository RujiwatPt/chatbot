import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const Body = z.object({
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid code format"),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit({
    identifier: ip,
    namespace: "redeem_invite_ip",
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.success) {
    return rateLimitResponse(rl.resetSeconds);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_input", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { code } = parsed.data;

  // Call the atomic SECURITY DEFINER redeem_invite function in Supabase
  const { error } = await supabase.rpc("redeem_invite", { p_code: code });

  if (error) {
    return Response.json(
      { error: error.message || "redemption_failed" },
      { status: 400 },
    );
  }

  return Response.json({ ok: true });
}
