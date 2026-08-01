import { createClient } from "@/lib/supabase/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;
    if (!file) {
      return new Response("no_file_provided", { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return new Response("invalid_file_type", { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response("file_too_large", { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const extension = file.name.split(".").pop() || "png";
    const filename = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const objectKey = `avatars/${filename}`;

    // Try Cloudflare R2 bucket binding first
    try {
      const { env } = await getCloudflareContext();
      const bucket = (env as unknown as { AVATARS_BUCKET?: { put: Function } })
        .AVATARS_BUCKET;

      if (bucket && typeof bucket.put === "function") {
        await bucket.put(objectKey, fileBuffer, {
          httpMetadata: { contentType: file.type },
        });
        return Response.json({
          url: `/api/avatars/${objectKey}`,
        });
      }
    } catch {
      // Fallback for local Node.js environment without Cloudflare context
    }

    // Fallback for non-Cloudflare environments: return inline Data URL
    const base64 = Buffer.from(fileBuffer).toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    return Response.json({
      url: dataUrl,
    });
  } catch (err) {
    console.error("[avatar_upload] Failed to process upload:", err);
    return new Response("upload_failed", { status: 500 });
  }
}
