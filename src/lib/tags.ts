export const PRESET_TAGS = [
  "Male",
  "Female",
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
