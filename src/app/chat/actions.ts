"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function startChat(characterId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: character, error: cerr } = await supabase
    .from("characters")
    .select("id, name, greeting")
    .eq("id", characterId)
    .maybeSingle();
  if (cerr) throw new Error(cerr.message);
  if (!character) throw new Error("Character not found");

  const { data: chat, error } = await supabase
    .from("chats")
    .insert({
      user_id: user.id,
      character_id: character.id,
      title: character.name,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (character.greeting) {
    await supabase.from("messages").insert({
      chat_id: chat.id,
      role: "assistant",
      content: character.greeting,
    });
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
