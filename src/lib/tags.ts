import type { SupabaseClient } from "@supabase/supabase-js";

export const PRESET_TAGS = [
  "Male",
  "Female",
  "Gender-Neutral",
  "Furry",
  "Teenager",
  "Adult",
  "NSFW",
  "Violence",
  "Anime",
  "Cozy",
  "Fantasy",
  "Support",
  "Sci-Fi",
  "Romance",
  "Horror",
] as const;

export type PresetTag = (typeof PRESET_TAGS)[number];

export interface TagRow {
  id: string;
  name: string;
  slug: string;
  is_preset: boolean;
  created_at: string;
}

/**
 * Ensures all tags in the given list exist in the global `tags` database table.
 */
export async function ensureTagsExist(
  supabase: SupabaseClient,
  tags: string[],
): Promise<void> {
  const cleanTags = Array.from(new Set(tags))
    .map((t) => t.trim().slice(0, 30))
    .filter((t) => t.length > 0 && /^[A-Za-z0-9_\-\s]+$/.test(t))
    .slice(0, 10);

  if (!cleanTags.length) return;

  const rows = cleanTags.map((name) => ({
    name,
    slug: name.toLowerCase(),
    is_preset: (PRESET_TAGS as readonly string[]).includes(name),
  }));

  await supabase.from("tags").upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
}
