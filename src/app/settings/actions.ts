"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  if (displayName.length > 60) {
    throw new Error("Display name must be 60 characters or less.");
  }
  if (pronouns.length > 30) {
    throw new Error("Pronouns must be 30 characters or less.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName || null,
      pronouns: pronouns || null,
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

  // 1. Attempt atomic user deletion from auth.users via SECURITY DEFINER RPC (GDPR right to erasure)
  const { error: rpcErr } = await supabase.rpc("delete_own_user");

  if (rpcErr) {
    // Fallback: Delete user table records manually if RPC is not deployed
    const { error: chatsErr } = await supabase.from("chats").delete().eq("user_id", user.id);
    if (chatsErr) throw new Error(`Failed to delete user chats: ${chatsErr.message}`);

    const { error: charErr } = await supabase.from("characters").delete().eq("user_id", user.id);
    if (charErr) throw new Error(`Failed to delete user characters: ${charErr.message}`);

    const { error: profileErr } = await supabase.from("profiles").delete().eq("id", user.id);
    if (profileErr) throw new Error(`Failed to delete user profile: ${profileErr.message}`);
  }

  // 2. Sign out user session and redirect to login
  await supabase.auth.signOut();
  redirect("/login");
}
