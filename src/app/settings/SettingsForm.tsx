"use client";

import { useFormStatus } from "react-dom";
import { updateProfile } from "./actions";

interface SettingsFormProps {
  initialDisplayName: string;
  initialPronouns: string;
}

export default function SettingsForm({
  initialDisplayName,
  initialPronouns,
}: SettingsFormProps) {
  return (
    <form action={updateProfile} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="display_name" className="label">
          Default Display Name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          maxLength={60}
          defaultValue={initialDisplayName}
          placeholder="e.g. Alex"
          className="field"
        />
        <p className="muted text-xs">
          This name will be pre-filled when starting new roleplay sessions.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="pronouns" className="label">
          Preferred Pronouns
        </label>
        <select
          id="pronouns"
          name="pronouns"
          defaultValue={initialPronouns}
          className="field"
        >
          <option value="">Prefer not to say</option>
          <option value="she/her">she/her</option>
          <option value="he/him">he/him</option>
          <option value="they/them">they/them</option>
        </select>
        <p className="muted text-xs">
          Companions will use your preferred pronouns in roleplay actions.
        </p>
      </div>

      <div className="pt-2">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary inline-flex items-center justify-center gap-2 min-h-10 px-5 disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold"
    >
      {pending ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Saving settings...</span>
        </>
      ) : (
        "Save settings"
      )}
    </button>
  );
}
