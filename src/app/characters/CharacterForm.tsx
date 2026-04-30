type Character = {
  id?: string;
  name?: string | null;
  persona?: string | null;
  greeting?: string | null;
  scenario?: string | null;
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
        <label className="text-sm font-medium">Name</label>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={initial?.name ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Persona</label>
        <textarea
          name="persona"
          required
          rows={6}
          defaultValue={initial?.persona ?? ""}
          placeholder="Describe who this character is, their voice, traits, mannerisms…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Scenario (optional)</label>
        <textarea
          name="scenario"
          rows={3}
          defaultValue={initial?.scenario ?? ""}
          placeholder="The setting or situation the roleplay starts in."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Greeting (optional)</label>
        <textarea
          name="greeting"
          rows={2}
          defaultValue={initial?.greeting ?? ""}
          placeholder="The character's first line in any new chat."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
      >
        {submitLabel}
      </button>
    </form>
  );
}
