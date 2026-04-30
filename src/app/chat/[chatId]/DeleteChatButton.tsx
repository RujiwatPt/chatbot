"use client";

export default function DeleteChatButton() {
  return (
    <button
      type="submit"
      className="btn-text text-xs text-red-600"
      onClick={(e) => {
        const ok = window.confirm(
          "Delete this chat permanently? This action cannot be undone.",
        );
        if (!ok) e.preventDefault();
      }}
    >
      Delete
    </button>
  );
}
