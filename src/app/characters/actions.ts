"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generatePersonaBio } from "@/lib/persona";
import { ensureTagsExist } from "@/lib/tags";

import { z } from "zod";
import { sanitizeModel } from "@/lib/openrouter";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const CharacterSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120, "Name must be 120 characters or less."),
  alias: z.string().trim().max(120, "Alias must be 120 characters or less.").nullable().optional(),
  persona: z.string().trim().min(1, "Persona is required.").max(8000, "Persona must be 8,000 characters or less."),
  greeting: z.string().trim().max(2000, "Greeting must be 2,000 characters or less.").nullable().optional(),
  scenario: z.string().trim().max(2000, "Scenario must be 2,000 characters or less.").nullable().optional(),
  avatar_url: z.string().trim().max(2000, "Avatar URL must be 2,000 characters or less.").nullable().optional(),
  model: z.string().trim(),
  is_public: z.boolean(),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(30, "Each tag must be 30 characters or less.")
        .regex(/^[A-Za-z0-9_\-\s]+$/, "Tags may only contain letters, numbers, hyphens, and spaces."),
    )
    .max(10, "Maximum of 10 tags allowed per character."),
});

function readAndValidateForm(form: FormData) {
  const rawTags = form.getAll("tags").map((t) => String(t).trim()).filter(Boolean);
  const rawModel = String(form.get("model") ?? "").trim();
  const raw = {
    name: String(form.get("name") ?? "").trim(),
    alias: String(form.get("alias") ?? "").trim() || null,
    persona: String(form.get("persona") ?? "").trim(),
    greeting: String(form.get("greeting") ?? "").trim() || null,
    scenario: String(form.get("scenario") ?? "").trim() || null,
    avatar_url: String(form.get("avatar_url") ?? "").trim() || null,
    model: sanitizeModel(rawModel),
    is_public: form.get("is_public") === "on",
    tags: Array.from(new Set(rawTags)),
  };

  const parsed = CharacterSchema.safeParse(raw);
  if (!parsed.success) {
    const firstMsg = parsed.error.issues[0]?.message || "Invalid character data.";
    throw new Error(firstMsg);
  }

  return {
    ...parsed.data,
    alias: parsed.data.alias || null,
    greeting: parsed.data.greeting || null,
    scenario: parsed.data.scenario || null,
    avatar_url: parsed.data.avatar_url || null,
  };
}

export async function createCharacter(form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const payload = readAndValidateForm(form);

  await ensureTagsExist(supabase, payload.tags);

  const { data, error } = await supabase
    .from("characters")
    .insert({ ...payload, user_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Background bio generation: never blocks form submission or redirect
  after(async () => {
    try {
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
    } catch {
      // background best-effort
    }
  });

  revalidatePath("/characters");
  redirect(`/characters/${data.id}`);
}

export async function updateCharacter(id: string, form: FormData) {
  const supabase = await createClient();
  const payload = readAndValidateForm(form);

  await ensureTagsExist(supabase, payload.tags);

  const { error } = await supabase
    .from("characters")
    .update(payload)
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Background bio generation: never blocks form submission
  after(async () => {
    try {
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
    } catch {
      // background best-effort
    }
  });

  revalidatePath("/characters");
  revalidatePath(`/characters/${id}`);
}

export async function deleteCharacter(id: string) {
  const supabase = await createClient();

  const { data: char } = await supabase
    .from("characters")
    .select("avatar_url")
    .eq("id", id)
    .maybeSingle();

  if (char?.avatar_url && char.avatar_url.startsWith("/api/avatars/")) {
    const objectKey = char.avatar_url.replace("/api/avatars/", "");
    try {
      const { env } = await getCloudflareContext();
      const bucket = (
        env as unknown as {
          AVATARS_BUCKET?: { delete: (k: string) => Promise<void> };
        }
      ).AVATARS_BUCKET;
      if (bucket && typeof bucket.delete === "function") {
        await bucket.delete(objectKey);
      }
    } catch {
      // outside Cloudflare or R2 unavailable
    }
  }

  const { error } = await supabase.from("characters").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/characters");
  redirect("/characters");
}
