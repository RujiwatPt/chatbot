"use client";

import { useState } from "react";
import Image from "next/image";
import { getCharacterAvatar } from "@/lib/avatar";
import AvatarCropModal from "./AvatarCropModal";

type Character = {
  id?: string;
  name?: string | null;
  alias?: string | null;
  persona?: string | null;
  greeting?: string | null;
  scenario?: string | null;
  avatar_url?: string | null;
  is_public?: boolean | null;
};

export default function CharacterForm({
  action,
  initial,
  submitLabel = "Save",
}: {
  action: (form: FormData) => void | Promise<void>;
  initial?: Character;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [alias, setAlias] = useState(initial?.alias ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatar_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const displayAvatar = getCharacterAvatar(name, alias, avatarUrl);

  // 1. File selected by user -> open crop modal
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Original image must be smaller than 10 MB");
      return;
    }

    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCropImageSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
    // Reset file input so user can re-select same file if canceled
    e.target.value = "";
  }

  // 2. Crop confirmed by user -> upload 512x512 WebP blob to R2
  async function handleCroppedUpload(croppedBlob: Blob) {
    setCropImageSrc(null);
    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append(
        "avatar",
        croppedBlob,
        `avatar_512x512_${Date.now()}.webp`,
      );

      const res = await fetch("/api/characters/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Upload failed");
      }

      const data = (await res.json()) as { url: string };
      setAvatarUrl(data.url);
    } catch (err) {
      console.error("Avatar upload error:", err);
      setUploadError(
        err instanceof Error ? err.message : "Failed to upload image",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={action} className="space-y-5">
      {/* Interactive Crop Modal */}
      {cropImageSrc && (
        <AvatarCropModal
          imageSrc={cropImageSrc}
          onCrop={handleCroppedUpload}
          onCancel={() => setCropImageSrc(null)}
        />
      )}

      {/* Avatar Image Selector & Live Preview */}
      <div className="space-y-2">
        <label className="label">Character Avatar (512×512 Cloudflare R2)</label>
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--line)] shadow-sm bg-[color:var(--surface-solid)]">
            <Image
              src={displayAvatar}
              alt="Avatar Preview"
              fill
              className="object-cover"
            />
          </div>
          <div className="space-y-1.5 min-w-0 flex-1">
            <label className="btn-outline btn-sm inline-flex items-center gap-2 cursor-pointer">
              <span>
                {uploading ? "Uploading 512×512 to R2..." : "📷 Upload & Frame Avatar"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileSelect}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="muted text-xs">
              Frame, zoom, and crop to 512×512 resolution before uploading to Cloudflare R2.
            </p>

            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl("")}
                className="text-xs text-red-400 hover:underline block font-medium"
              >
                Reset to default avatar
              </button>
            )}

            {uploadError && (
              <p className="text-xs text-red-400 font-medium">{uploadError}</p>
            )}
          </div>
        </div>
        <input type="hidden" name="avatar_url" value={avatarUrl} />
      </div>

      <div className="space-y-1">
        <label className="label">Name</label>
        <input
          name="name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field"
        />
      </div>
      <div className="space-y-1">
        <label className="label">Alias (optional)</label>
        <input
          name="alias"
          maxLength={120}
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Used by the bot for self-reference (e.g., Kael)"
          className="field"
        />
      </div>
      <div className="space-y-1">
        <label className="label">Persona</label>
        <textarea
          name="persona"
          required
          rows={6}
          defaultValue={initial?.persona ?? ""}
          placeholder="Describe who this character is, their voice, traits, mannerisms…"
          className="field"
        />
      </div>
      <div className="space-y-1">
        <label className="label">Scenario (optional)</label>
        <textarea
          name="scenario"
          rows={3}
          defaultValue={initial?.scenario ?? ""}
          placeholder="The setting or situation the roleplay starts in."
          className="field"
        />
      </div>
      <div className="space-y-1">
        <label className="label">Greeting (optional)</label>
        <textarea
          name="greeting"
          rows={2}
          defaultValue={initial?.greeting ?? ""}
          placeholder="The character's first line in any new chat."
          className="field"
        />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="is_public"
          defaultChecked={initial?.is_public ?? false}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Make public</span>
          <span className="muted block text-xs">
            Other users can discover and chat with this character.
          </span>
        </span>
      </label>
      <button type="submit" className="btn-primary" disabled={uploading}>
        {submitLabel}
      </button>
    </form>
  );
}
