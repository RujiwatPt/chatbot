"use client";

export default function DeleteChatButton() {
  return (
    <button
      type="submit"
      className="btn-text btn-danger text-xs"
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
