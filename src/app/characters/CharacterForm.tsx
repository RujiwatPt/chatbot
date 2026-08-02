"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { getCharacterAvatar } from "@/lib/avatar";
import AvatarCropModal from "./AvatarCropModal";

import { PRESET_TAGS } from "@/lib/tags";

type Character = {
  id?: string;
  name?: string | null;
  alias?: string | null;
  persona?: string | null;
  greeting?: string | null;
  scenario?: string | null;
  avatar_url?: string | null;
  is_public?: boolean | null;
  tags?: string[] | null;
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
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initial?.tags ?? [],
  );
  const [customTagInput, setCustomTagInput] = useState("");
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
        <label className="label">Character Avatar (512×512)</label>
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
                {uploading ? "Uploading 512×512 avatar..." : "📷 Upload & Frame Avatar"}
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
              Frame, zoom, and crop to 512×512 resolution before uploading.
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
      {/* Hidden inputs to pass tags array in FormData */}
      {selectedTags.map((tag) => (
        <input type="hidden" key={tag} name="tags" value={tag} />
      ))}

      <div className="space-y-2">
        <label className="label">Tags</label>
        <p className="muted text-xs">
          Select matching tags or add custom tags to help categorize your character.
        </p>

        {/* Preset Tag Pills */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {PRESET_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setSelectedTags((prev) =>
                    prev.includes(tag)
                      ? prev.filter((t) => t !== tag)
                      : [...prev, tag],
                  )
                }
                className={`btn-sm text-xs rounded-full px-3 py-1 font-semibold transition-all border ${
                  active
                    ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                    : "bg-[color:var(--surface-solid)] text-[color:var(--muted-color)] border-[var(--line)] hover:border-blue-500/50"
                }`}
              >
                {active ? `✓ ${tag}` : `+ ${tag}`}
              </button>
            );
          })}
        </div>

        {/* Custom Tags Display & Input */}
        <div className="pt-2">
          {selectedTags.filter((t) => !PRESET_TAGS.includes(t as (typeof PRESET_TAGS)[number])).length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 items-center">
              <span className="text-xs muted font-medium">Custom tags:</span>
              {selectedTags
                .filter((t) => !PRESET_TAGS.includes(t as (typeof PRESET_TAGS)[number]))
                .map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs px-2.5 py-0.5 rounded-full font-semibold"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTags((prev) => prev.filter((x) => x !== t))
                      }
                      className="hover:text-red-400 font-bold ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
            </div>
          )}
          <div className="flex items-center gap-2 max-w-sm">
            <input
              type="text"
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const tag = customTagInput.trim();
                  if (tag && !selectedTags.includes(tag)) {
                    setSelectedTags((prev) => [...prev, tag]);
                  }
                  setCustomTagInput("");
                }
              }}
              placeholder="Add custom tag (Enter)..."
              className="field text-xs py-1.5"
            />
            <button
              type="button"
              onClick={() => {
                const tag = customTagInput.trim();
                if (tag && !selectedTags.includes(tag)) {
                  setSelectedTags((prev) => [...prev, tag]);
                }
                setCustomTagInput("");
              }}
              className="btn-outline btn-sm shrink-0 text-xs"
            >
              Add Tag
            </button>
          </div>
        </div>
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
      <FormSubmitButton label={submitLabel} uploading={uploading} />
    </form>
  );
}

function FormSubmitButton({
  label,
  uploading,
}: {
  label: string;
  uploading: boolean;
}) {
  const { pending } = useFormStatus();
  const disabled = pending || uploading;

  return (
    <button
      type="submit"
      disabled={disabled}
      className="btn-primary inline-flex items-center justify-center gap-2 min-h-11 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Saving character...</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
