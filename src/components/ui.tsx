import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("bg-panel border border-rule rounded-card p-5 shadow-soft", className)}
      {...props}
    />
  );
}

export function Btn({
  variant = "default",
  size = "md",
  className,
  loading,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "go" | "stop" | "ghost" | "urgent";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const base =
    "border rounded-xl font-medium disabled:opacity-55 disabled:cursor-default transition-all duration-150 inline-flex items-center justify-center gap-1.5 active:scale-[0.97] active:brightness-95";
  const sizes =
    size === "lg"
      ? "px-5 py-3 text-[15px]"
      : size === "sm"
        ? "px-2.5 py-1.5 text-[13px]"
        : "px-3.5 py-2 text-sm";
  const variants: Record<string, string> = {
    default: "bg-panel border-rule text-ink hover:border-accent",
    primary: "bg-accent border-accent text-on-accent font-semibold hover:bg-accent-hover hover:border-accent-hover",
    go: "bg-go-soft border-go/40 text-go font-semibold hover:brightness-95",
    stop: "bg-panel border-rule text-stop hover:border-stop",
    urgent: "bg-stop-soft border-stop/50 text-stop font-semibold hover:border-stop",
    ghost: "bg-transparent border-transparent text-muted hover:bg-panel2 hover:text-ink",
  };
  return (
    <button className={cx(base, sizes, variants[variant], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && (
        <svg className="btn-spinner shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}

export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "hot" | "go" | "stop" | "acc" | "warm" | "cold";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-panel2 text-muted",
    hot: "bg-accent-soft text-accent font-semibold",
    go: "bg-go-soft text-go",
    stop: "bg-stop-soft text-stop",
    acc: "bg-accent-soft text-accent",
    warm: "bg-warm-soft text-warm",
    cold: "bg-cold-soft text-cold",
  };
  return (
    <span className={cx("inline-block text-xs px-2.5 py-0.5 rounded-full mr-1.5 mb-1.5", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Bar({ pct, tone = "accent" }: { pct: number; tone?: "accent" | "go" | "warm" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = tone === "go" ? "bg-go" : tone === "warm" ? "bg-warm" : "bg-accent";
  return (
    <div className="h-2 bg-panel2 rounded-full overflow-hidden my-1.5">
      <div className={cx("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Badge({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "stop" | "warm" }) {
  const tones = {
    accent: "bg-accent text-on-accent",
    stop: "bg-stop text-on-accent",
    warm: "bg-warm text-on-accent",
  };
  return <span className={cx("text-xs rounded-full px-2 py-0.5 font-semibold", tones[tone])}>{children}</span>;
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("section-label m-0 mb-3", className)}>{children}</p>;
}

export function VoiceLine({ name, children, thinking }: { name: string; children: ReactNode; thinking?: boolean }) {
  return (
    <div className="flex gap-4 items-start">
      <div
        className={cx(
          "flex-none w-11 h-11 rounded-xl bg-[#050807] border border-accent/25 flex items-center justify-center overflow-hidden",
          thinking && "orb-think",
        )}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-mark.png" alt="" className="h-6 w-auto" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <span className="text-[11px] text-accent font-semibold tracking-wide uppercase block mb-1.5">{name}</span>
        <div className="next-action whitespace-pre-line">{children}</div>
      </div>
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-rule mb-4 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cx(
            "bg-transparent border-0 border-b-2 px-3 py-2.5 whitespace-nowrap text-sm",
            active === t.key ? "border-accent text-ink font-semibold" : "border-transparent text-muted",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="p-10 text-center text-muted text-sm">{children}</div>;
}

/** One meaning per color: progress uses accent only (hot = on track). */
export function Ring({
  value,
  target,
  label,
  hint,
  size = 88,
}: {
  value: number;
  target: number;
  label: string;
  hint?: string;
  size?: number;
}) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const stroke = 5;
  const r = size / 2 - stroke;
  const circumference = 2 * Math.PI * r;
  const done = target > 0 && value >= target;
  const color = done ? "var(--accent)" : value === 0 ? "var(--cold)" : "var(--accent)";
  return (
    <div className="flex flex-col items-center gap-2 max-w-[7.5rem] text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--panel2)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tracking-tight">{value}</span>
          <span className="text-[10px] text-dim">of {target}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-ink leading-snug">{label}</span>
      {hint && <span className="text-[10px] text-dim leading-snug">{hint}</span>}
    </div>
  );
}
