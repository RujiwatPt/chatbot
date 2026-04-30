import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({ code: z.string().min(1).max(128) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { error } = await supabase.rpc("redeem_invite", {
    p_code: parsed.data.code,
  });
  if (error) {
    // P0001 = raise_exception (any plpgsql `raise exception`).
    // Match both the SQLSTATE and the literal so we still classify correctly
    // if the message is wrapped or the SDK omits one of them.
    const isInvalid =
      error.code === "P0001" ||
      error.message.includes("invalid_or_used_code");
    return NextResponse.json(
      { error: isInvalid ? "Invalid or already-used code." : error.message },
      { status: isInvalid ? 400 : 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
