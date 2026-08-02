"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteAccount } from "./actions";

interface DeleteAccountButtonProps {
  userEmail: string;
}

export default function DeleteAccountButton({
  userEmail,
}: DeleteAccountButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");

  const isMatch = confirmInput.trim().toLowerCase() === userEmail.trim().toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn-primary btn-danger min-h-10 px-4 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white border-red-700 text-xs font-semibold"
      >
        Delete account...
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="panel w-full max-w-md p-6 space-y-4 bg-[color:var(--surface-solid)] border-red-500/30 shadow-2xl">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-red-500 dark:text-red-400">
                Permanently Delete Account
              </h3>
              <p className="muted text-xs sm:text-sm">
                This action is irreversible. All your custom characters, chat histories, messages, and profile data will be permanently deleted.
              </p>
            </div>

            <form action={deleteAccount} className="space-y-4">
              <input type="hidden" name="confirm_email" value={confirmInput} />

              <div className="space-y-1.5">
                <label htmlFor="confirm_email_input" className="label text-xs">
                  To confirm, type <span className="font-mono font-bold text-foreground">{userEmail}</span> below:
                </label>
                <input
                  id="confirm_email_input"
                  type="email"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={userEmail}
                  className="field text-sm font-mono"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setConfirmInput("");
                  }}
                  className="btn-outline btn-sm px-4 min-h-10 text-xs font-medium"
                >
                  Cancel
                </button>
                <ConfirmDeleteButton isMatch={isMatch} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ConfirmDeleteButton({ isMatch }: { isMatch: boolean }) {
  const { pending } = useFormStatus();
  const disabled = !isMatch || pending;

  return (
    <button
      type="submit"
      disabled={disabled}
      className="btn-primary btn-danger min-h-10 px-4 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white border-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold"
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
