"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generatePersonaBio } from "@/lib/persona";

function readForm(form: FormData) {
  const rawTags = form.getAll("tags").map((t) => String(t).trim()).filter(Boolean);
  return {
    name: String(form.get("name") ?? "").trim(),
    alias: String(form.get("alias") ?? "").trim() || null,
    persona: String(form.get("persona") ?? "").trim(),
    greeting: String(form.get("greeting") ?? "").trim() || null,
    scenario: String(form.get("scenario") ?? "").trim() || null,
    avatar_url: String(form.get("avatar_url") ?? "").trim() || null,
    is_public: form.get("is_public") === "on",
    tags: Array.from(new Set(rawTags)),
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

  // Best-effort: generate a reader-friendly third-person bio. Never blocks the
  // save — generatePersonaBio swallows failures and returns null.
  const bio = await generatePersonaBio({
    name: payload.name,
    persona: payload.persona,
    scenario: payload.scenario,
  });
  if (bio) {
    await supabase
      .from("characters")
      .update({ persona_display: bio })
      .eq("id", data.id);
  }

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

  // Refresh the third-person bio from the edited persona. Only overwrite when
  // generation succeeds, so a transient failure keeps the previous good bio.
  const bio = await generatePersonaBio({
    name: payload.name,
    persona: payload.persona,
    scenario: payload.scenario,
  });
  if (bio) {
    await supabase
      .from("characters")
      .update({ persona_display: bio })
      .eq("id", id);
  }

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
