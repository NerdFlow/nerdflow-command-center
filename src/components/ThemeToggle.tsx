"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";
const STORAGE_KEY = "nf-theme";

function applyTheme(mode: ThemeMode) {
  if (mode === "dark") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", "light");
}

function systemMode(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Follows the device by default (per SPEC.md 3); an explicit toggle overrides that and persists. */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [hasOverride, setHasOverride] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    setHasOverride(stored !== null);
    setMode(stored ?? systemMode());

    if (stored !== null) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setMode(systemMode());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    setHasOverride(true);
    localStorage.setItem(STORAGE_KEY, next);
  }

  function resetToSystem() {
    localStorage.removeItem(STORAGE_KEY);
    setHasOverride(false);
    setMode(systemMode());
  }

  return (
    <div className="flex items-center gap-1">
      <button onClick={toggle} className="text-xs text-muted hover:text-ink flex-1 text-left px-2.5 py-1.5 rounded-lg hover:bg-bg">
        Theme: {mode === "dark" ? "Dark" : "Light"}{!hasOverride ? " (device)" : ""}
      </button>
      {hasOverride && (
        <button onClick={resetToSystem} className="text-xs text-muted hover:text-ink px-2 py-1.5 rounded-lg hover:bg-bg" title="Match device theme">
          Reset
        </button>
      )}
    </div>
  );
}
