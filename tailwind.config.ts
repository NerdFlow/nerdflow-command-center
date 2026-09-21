import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sora)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
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
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-soft": "var(--accent-soft)",
        "on-accent": "var(--on-accent)",
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
