"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function readForm(form: FormData) {
  return {
    name: String(form.get("name") ?? "").trim(),
    alias: String(form.get("alias") ?? "").trim() || null,
    persona: String(form.get("persona") ?? "").trim(),
    greeting: String(form.get("greeting") ?? "").trim() || null,
    scenario: String(form.get("scenario") ?? "").trim() || null,
  };
}

export async function createCharacter(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const payload = readForm(form);
  if (!payload.name || !payload.persona) {
    throw new Error("Name and persona are required.");
  }

  const { data, error } = await supabase
    .from("characters")
    .insert({ ...payload, user_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/characters");
  redirect(`/characters/${data.id}`);
}

export async function updateCharacter(id: string, form: FormData) {
  const supabase = await createClient();
  const payload = readForm(form);
  if (!payload.name || !payload.persona) {
    throw new Error("Name and persona are required.");
  }
  const { error } = await supabase
    .from("characters")
    .update(payload)
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/characters");
  revalidatePath(`/characters/${id}`);
}

export async function deleteCharacter(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("characters").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/characters");
  redirect("/characters");
}
