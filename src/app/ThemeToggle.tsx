"use client";

type Theme = "light" | "dark";

const STORAGE_KEY = "howly-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const nextTheme: Theme = currentTheme === "light" ? "dark" : "light";
    applyTheme(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <svg className="theme-icon theme-icon-sun" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.28 5.28l1.42 1.42m10.6 10.6 1.42 1.42m0-13.44L17.3 6.7M6.7 17.3l-1.42 1.42" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <svg className="theme-icon theme-icon-moon" viewBox="0 0 24 24" fill="none">
          <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="theme-toggle-thumb" />
      </span>
    </button>
  );
}
