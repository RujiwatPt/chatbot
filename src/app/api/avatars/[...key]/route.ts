import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const objectKey = key.join("/");

  try {
    const { env } = await getCloudflareContext();
    const bucket = (
      env as unknown as {
        AVATARS_BUCKET?: {
          get: (k: string) => Promise<{
            body: ReadableStream;
            httpMetadata?: { contentType?: string };
          } | null>;
        };
      }
    ).AVATARS_BUCKET;

    if (bucket && typeof bucket.get === "function") {
      const object = await bucket.get(objectKey);
      if (!object) {
        return new Response("not_found", { status: 404 });
      }

      return new Response(object.body as unknown as BodyInit, {
        headers: {
          "Content-Type":
            object.httpMetadata?.contentType || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  } catch (err) {
    console.error("[avatar_stream] Error fetching object from R2:", err);
  }

  return new Response("not_found", { status: 404 });
}
