type Character = {
  id?: string;
  name?: string | null;
  alias?: string | null;
  persona?: string | null;
  greeting?: string | null;
  scenario?: string | null;
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
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <label className="label">Name</label>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={initial?.name ?? ""}
          className="field"
        />
      </div>
      <div className="space-y-1">
        <label className="label">Alias (optional)</label>
        <input
          name="alias"
          maxLength={120}
          defaultValue={initial?.alias ?? ""}
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
      <button type="submit" className="btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}
