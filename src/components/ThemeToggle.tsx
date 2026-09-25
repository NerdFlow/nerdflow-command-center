"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";
const STORAGE_KEY = "nf-theme";

function applyTheme(mode: ThemeMode) {
  if (mode === "dark") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", "light");
}

/** Dark is the default; light is an explicit opt-in, not system-driven. */
export function ThemeToggle() {
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

  return (
    <button onClick={toggle} className="text-xs text-muted hover:text-ink w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-bg">
      Theme: {mode === "dark" ? "Dark" : "Light"}
    </button>
  );
}
