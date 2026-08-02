"use client";

import { useFormStatus } from "react-dom";

export default function DeleteCharacterButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-text btn-danger text-xs inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
      onClick={(e) => {
        if (pending) {
          e.preventDefault();
          return;
        }
        const ok = window.confirm(
          "Delete this character permanently? This action cannot be undone.",
        );
        if (!ok) e.preventDefault();
      }}
    >
      {pending ? (
        <>
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Deleting character...</span>
        </>
      ) : (
        "Delete character"
      )}
    </button>
  );
}
