export function getCharacterAvatar(
  name: string,
  alias?: string | null,
  avatarUrl?: string | null,
): string {
  if (avatarUrl && avatarUrl.trim().length > 0) {
    return avatarUrl.trim();
  }

  const n = `${name || ""} ${alias || ""}`.toLowerCase();
  if (n.includes("kael") || n.includes("wolfman") || n.includes("wolf")) return "/images/avatar_kael.jpg";
  if (n.includes("aiko") || n.includes("tsundere")) return "/images/avatar_aiko.jpg";
  if (n.includes("mira") || n.includes("therapist") || n.includes("vance")) return "/images/avatar_mira.jpg";
  if (n.includes("sam") || n.includes("childhood") || n.includes("bestfriend")) return "/images/avatar_sam.jpg";
  return "/images/hero_roleplay.jpg";
}
