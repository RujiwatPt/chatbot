"use client";

import { useEffect, useState } from "react";

// Scale factors applied to the chat message text. Persisted in localStorage and
// exposed to CSS via the --chat-font-scale custom property on <html>.
const LEVELS = [
  { key: "S", scale: 0.9 },
  { key: "M", scale: 1 },
  { key: "L", scale: 1.15 },
  { key: "XL", scale: 1.3 },
] as const;

const STORAGE_KEY = "chat-font-scale";

function applyScale(scale: number) {
  document.documentElement.style.setProperty("--chat-font-scale", String(scale));
}

export default function FontSizeControl() {
  const [scale, setScale] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return LEVELS.some((l) => l.scale === saved) ? saved : 1;
  });

  // Apply scale to DOM whenever it changes
  useEffect(() => {
    applyScale(scale);
  }, [scale]);

  function choose(next: number) {
    setScale(next);
    applyScale(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  return (
    <div className="seg" role="group" aria-label="Message text size">
      {LEVELS.map((l) => (
        <button
          key={l.key}
          type="button"
          className="seg-btn"
          aria-pressed={scale === l.scale}
          title={`Text size: ${l.key}`}
          onClick={() => choose(l.scale)}
        >
          {l.key}
        </button>
      ))}
    </div>
  );
}
