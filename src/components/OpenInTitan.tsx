import type { TitanOpenState } from "@/lib/titanOpen";

const linkClass =
  "inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3 rounded-xl text-[15px] hover:bg-accent-hover";

/** Visible whenever the card has an email. Disabled, never removed, when send is blocked or the draft is empty. */
export function OpenInTitan({ state }: { state: TitanOpenState }) {
  if (!state.visible) return null;
  const note = [...state.reasons, state.hint].filter((line): line is string => Boolean(line));
  return (
    <>
      {state.enabled && state.href ? (
        <a href={state.href} className={linkClass}>
          Open in Titan
        </a>
      ) : (
        <button type="button" disabled title={note.join("\n") || undefined} className={`${linkClass} disabled:opacity-40`}>
          Open in Titan
        </button>
      )}
      {state.hint ? <span className="basis-full text-xs text-dim">{state.hint}</span> : null}
      {state.reasons.map((reason, index) => (
        <span key={`${reason}-${index}`} className="basis-full text-xs text-stop">
          {reason}
        </span>
      ))}
    </>
  );
}
