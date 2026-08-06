export function getDefaultCharacterAvatar(
  name: string,
  alias?: string | null,
): string {
  const text = `${name || ""} ${alias || ""}`.toLowerCase();

  const matchesWord = (pattern: string) =>
    new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);

  if (matchesWord("kael") || matchesWord("wolfman")) return "/images/avatar_kael.jpg";
  if (matchesWord("aiko") || matchesWord("tsundere")) return "/images/avatar_aiko.jpg";
  if (matchesWord("mira") || text.includes("dr. mira vance") || matchesWord("therapist")) return "/images/avatar_mira.jpg";
  if (matchesWord("sam") || text.includes("childhood best friend") || text.includes("bestfriend")) return "/images/avatar_sam.jpg";

  return "/images/hero_roleplay.jpg";
}

export function getCharacterAvatar(
  name: string,
  alias?: string | null,
  avatarUrl?: string | null,
): string {
  if (avatarUrl && avatarUrl.trim().length > 0) {
    return avatarUrl.trim();
  }

  return getDefaultCharacterAvatar(name, alias);
}
