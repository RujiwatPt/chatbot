"use client";

import { useFormStatus } from "react-dom";

export default function DeleteAccountButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary btn-danger min-h-10 px-4 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white border-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-xs font-semibold"
      onClick={(e) => {
        if (pending) {
          e.preventDefault();
          return;
        }
        const ok = window.confirm(
          "ARE YOU ABSOLUTELY SURE?\n\nDeleting your account will permanently remove all your custom characters, chat histories, messages, and profile data. This action CANNOT be undone.",
        );
        if (!ok) {
          e.preventDefault();
        }
      }}
    >
      {pending ? (
        <>
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Deleting account...</span>
        </>
      ) : (
        "Permanently delete account"
      )}
    </button>
  );
}
