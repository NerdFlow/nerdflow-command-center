import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("bg-panel border border-rule rounded-card p-5", className)}
      {...props}
    />
  );
}

export function Btn({
  variant = "default",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "go" | "stop" | "ghost";
  size?: "sm" | "md";
}) {
  const base = "border rounded-lg font-medium disabled:opacity-55 disabled:cursor-default transition-colors";
  const sizes = size === "sm" ? "px-2.5 py-1.5 text-[13px]" : "px-3.5 py-2 text-sm";
  const variants: Record<string, string> = {
    default: "bg-panel border-rule text-ink hover:border-accent",
    primary: "bg-accent border-accent text-on-accent font-semibold hover:bg-accent-hover hover:border-accent-hover",
    go: "bg-go-soft border-go text-go font-semibold hover:brightness-95",
    stop: "bg-panel border-rule text-stop hover:border-stop",
    ghost: "bg-transparent border-transparent text-muted hover:bg-panel2 hover:text-ink",
  };
  return <button className={cx(base, sizes, variants[variant], className)} {...props} />;
}

export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "hot" | "go" | "stop" | "acc";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-bg text-muted",
    hot: "bg-signal-soft text-signal font-semibold",
    go: "bg-go-soft text-go",
    stop: "bg-stop-soft text-stop",
    acc: "bg-accent-soft text-accent",
  };
  return (
    <span className={cx("inline-block text-xs px-2.5 py-0.5 rounded-full mr-1.5 mb-1.5", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Bar({ pct, tone = "accent" }: { pct: number; tone?: "accent" | "go" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2 bg-panel2 rounded-full overflow-hidden my-1.5">
      <div
        className={cx("h-full rounded-full", tone === "go" ? "bg-go" : "bg-accent")}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs bg-accent text-on-accent rounded-full px-2 py-0.5 font-semibold">{children}</span>
  );
}

export function VoiceLine({ name, children, thinking }: { name: string; children: ReactNode; thinking?: boolean }) {
  return (
    <div className="flex gap-3.5 items-start mb-7">
      <div
        className={cx(
          "flex-none w-10 h-10 rounded-xl bg-ink border border-rule flex items-center justify-center text-accent font-bold",
          thinking && "orb-think",
        )}
      >
        F
      </div>
      <div>
        <span className="text-xs text-signal font-semibold block mb-0.5">{name}</span>
        <p className="text-lg leading-relaxed max-w-[68ch] whitespace-pre-line m-0">{children}</p>
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
  return <div className="p-7 text-center text-muted">{children}</div>;
}
