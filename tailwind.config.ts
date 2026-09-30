import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        panel2: "var(--panel2)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        rule: "var(--rule)",
        signal: "var(--signal)",
        "signal-soft": "var(--signal-soft)",
        go: "var(--go)",
        "go-soft": "var(--go-soft)",
        stop: "var(--stop)",
        "stop-soft": "var(--stop-soft)",
        warm: "var(--warm)",
        "warm-soft": "var(--warm-soft)",
        cold: "var(--cold)",
        "cold-soft": "var(--cold-soft)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-soft": "var(--accent-soft)",
        "on-accent": "var(--on-accent)",
        dim: "var(--dim)",
      },
      borderRadius: {
        card: "14px",
        xl2: "18px",
      },
      boxShadow: {
        soft: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.45)",
        lift: "0 12px 40px -16px rgba(0,0,0,0.55)",
      },
      maxWidth: {
        cockpit: "720px",
        wide: "1100px",
      },
    },
  },
  plugins: [],
};

export default config;
