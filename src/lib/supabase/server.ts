import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

async function getSupabaseCredentials() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  let key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    try {
      const { env } = await getCloudflareContext();
      const record = env as unknown as Record<string, string | undefined>;
      url = url || record.NEXT_PUBLIC_SUPABASE_URL || record.SUPABASE_URL;
      key = key || record.NEXT_PUBLIC_SUPABASE_ANON_KEY || record.SUPABASE_ANON_KEY;
    } catch {
      // outside Cloudflare context
    }
  }

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.",
    );
  }

  return { url, key };
}

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = await getSupabaseCredentials();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // called from a Server Component — safe to ignore if middleware refreshes the session
        }
      },
    },
  });
}
