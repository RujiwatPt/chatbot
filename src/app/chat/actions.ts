"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { encryptText } from "@/lib/encryption";
import { sanitizeModel } from "@/lib/models";

export async function startChat(characterId: string, formData?: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const userName = String(formData?.get("user_name") ?? "").trim() || null;
  const userPronouns =
    String(formData?.get("user_pronouns") ?? "").trim() || null;
  const userDescription =
    String(formData?.get("user_description") ?? "").trim() || null;

  const { data: character, error: cerr } = await supabase
    .from("characters")
    .select("id, name, greeting, model")
    .eq("id", characterId)
    .maybeSingle();
  if (cerr) {
    console.error("[startChat_fetch_character_error]", cerr);
    throw new Error(cerr.message);
  }
  if (!character) throw new Error("Character not found");

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      user_id: user.id,
      character_id: character.id,
      title: character.name,
      model: sanitizeModel(character.model),
      user_name: userName,
      user_pronouns: userPronouns,
      user_description: userDescription,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[startChat_insert_chat_error]", error);
    throw new Error(error.message);
  }

  if (character.greeting) {
    const { error: msgErr } = await supabase.from("messages").insert({
      chat_id: chat.id,
      role: "assistant",
      content: await encryptText(character.greeting, user.id),
    });
    if (msgErr) {
      console.error("[startChat_greeting_error]", msgErr);
    }
  }

  revalidatePath("/chat");
  redirect(`/chat/${chat.id}`);
}

export async function deleteChat(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("chats").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/chat");
  redirect("/chat");
}
