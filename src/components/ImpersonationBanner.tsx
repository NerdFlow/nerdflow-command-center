"use client";

import { useState } from "react";
import { stopImpersonation } from "@/server/actions/impersonate";

export function ImpersonationBanner({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="bg-warm text-on-accent px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm relative z-[250]">
      <span>
        Viewing <span className="font-semibold">{name}</span>&apos;s account.
      </span>
      <button
        type="button"
        disabled={busy}
        className="font-semibold underline underline-offset-2 disabled:opacity-60"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await stopImpersonation();
            window.location.href = "/team";
          } catch (e) {
            setBusy(false);
            setError(e instanceof Error ? e.message : "Couldn't switch back.");
          }
        }}
      >
        {busy ? "Returning…" : "Back to your account"}
      </button>
      {error && <span className="text-xs">{error}</span>}
    </div>
  );
}
