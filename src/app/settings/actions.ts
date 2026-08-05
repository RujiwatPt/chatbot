"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function updateProfile(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = String(form.get("display_name") ?? "").trim();
  const pronouns = String(form.get("pronouns") ?? "").trim();
  const bio = String(form.get("bio") ?? "").trim();

  if (displayName.length > 60) {
    throw new Error("Display name must be 60 characters or less.");
  }
  if (pronouns.length > 30) {
    throw new Error("Pronouns must be 30 characters or less.");
  }
  if (bio.length > 500) {
    throw new Error("Description must be 500 characters or less.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName || null,
      pronouns: pronouns || null,
      bio: bio || null,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings");
  revalidatePath("/characters");
}

export async function deleteAccount(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const confirmEmail = String(form.get("confirm_email") ?? "").trim().toLowerCase();
  const expectedEmail = (user.email ?? "").trim().toLowerCase();

  if (!expectedEmail || confirmEmail !== expectedEmail) {
    throw new Error("Email confirmation does not match your account email.");
  }

  // 1. Clean up user character avatar objects in R2 storage
  const { data: userChars } = await supabase
    .from("characters")
    .select("avatar_url")
    .eq("user_id", user.id);

  if (userChars && userChars.length > 0) {
    try {
      const { env } = await getCloudflareContext();
      const bucket = (
        env as unknown as {
          AVATARS_BUCKET?: { delete: (k: string) => Promise<void> };
        }
      ).AVATARS_BUCKET;

      if (bucket && typeof bucket.delete === "function") {
        for (const char of userChars) {
          if (char.avatar_url && char.avatar_url.startsWith("/api/avatars/")) {
            const objectKey = char.avatar_url.replace("/api/avatars/", "");
            await bucket.delete(objectKey).catch(() => null);
          }
        }
      }
    } catch {
      // outside Cloudflare context
    }
  }

  // 2. Perform atomic user deletion from auth.users via SECURITY DEFINER RPC (GDPR right to erasure)
  const { error: rpcErr } = await supabase.rpc("delete_own_user");

  if (rpcErr) {
    console.error("[deleteAccount] delete_own_user RPC failed:", rpcErr);
    throw new Error(`Account deletion failed: ${rpcErr.message}. Please try again or contact support.`);
  }

  // 3. Sign out user session and redirect to login
  await supabase.auth.signOut();
  redirect("/login");
}
