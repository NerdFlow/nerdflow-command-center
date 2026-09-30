"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";
const STORAGE_KEY = "nf-theme";

function applyTheme(mode: ThemeMode) {
  if (mode === "dark") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", "light");
}

/** Dark is default; light is an explicit opt-in. */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "dark";
    setMode(stored);
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={mode === "dark" ? "Switch to light" : "Switch to dark"}
        aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="w-8 h-8 rounded-lg border border-rule text-dim hover:text-ink hover:border-accent/40 flex items-center justify-center transition-colors"
      >
        {mode === "dark" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center justify-between gap-2 w-full text-xs text-muted hover:text-ink px-2.5 py-2 rounded-lg hover:bg-bg transition-colors"
    >
      <span>{mode === "dark" ? "Dark" : "Light"}</span>
      <span className={"relative w-9 h-5 rounded-full transition-colors " + (mode === "dark" ? "bg-accent/30" : "bg-panel2 border border-rule")}>
        <span
          className={
            "absolute top-0.5 w-4 h-4 rounded-full bg-accent transition-transform " +
            (mode === "dark" ? "left-0.5" : "left-4")
          }
        />
      </span>
    </button>
  );
}
