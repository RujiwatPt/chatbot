import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Gets an environment variable or worker secret.
 * Checks process.env first, then falls back to Cloudflare Workers Context env.
 */
export async function getSecret(key: string, defaultValue = ""): Promise<string> {
  const processVal = process.env[key];
  if (processVal && processVal.trim().length > 0) {
    return processVal.trim();
  }

  try {
    const { env } = await getCloudflareContext();
    const cfVal = (env as unknown as Record<string, string | undefined>)[key];
    if (cfVal && typeof cfVal === "string" && cfVal.trim().length > 0) {
      return cfVal.trim();
    }
  } catch {
    // Outside Cloudflare context or during static generation
  }

  return defaultValue;
}
