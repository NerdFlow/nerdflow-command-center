"use client";

import { useEffect, useState } from "react";

type ThemeMode = "system" | "light" | "dark";
const STORAGE_KEY = "nf-theme";

function applyTheme(mode: ThemeMode) {
  if (mode === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
    setMode(stored);
  }, []);

  function cycle() {
    const next: ThemeMode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const label = mode === "system" ? "Theme: system" : mode === "light" ? "Theme: light" : "Theme: dark";

  return (
    <button
      onClick={cycle}
      className="text-xs text-muted hover:text-ink w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-bg"
    >
      {label}
    </button>
  );
}
