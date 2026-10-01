"use client";

import { Btn, Panel } from "@/components/ui";
import { applyAutoDetailingStarter } from "@/lib/playbooks/autoDetailing";
import type { CampaignStrategy } from "@/server/strategy";

function scriptPair(value: [string, string] | string[] | undefined): [string, string] {
  return [value?.[0] ?? "", value?.[1] ?? ""];
}

export function ScriptsPanel({
  strategy,
  productName,
  canManage,
  onChange,
  onSave,
  dirty,
  saving,
  saveError,
}: {
  strategy: CampaignStrategy;
  productName: string;
  canManage: boolean;
  onChange: (mutator: (s: CampaignStrategy) => CampaignStrategy) => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
}) {
  const call = scriptPair(strategy.call_scripts);
  const email = scriptPair(strategy.email_scripts);

  function setScript(kind: "call_scripts" | "email_scripts", index: 0 | 1, value: string) {
    onChange((s) => {
      const next = scriptPair(kind === "call_scripts" ? s.call_scripts : s.email_scripts);
      next[index] = value;
      return { ...s, [kind]: next };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <p className="text-sm text-muted m-0 max-w-xl">
          Two openers per channel. Focus assigns A or B for each lead. You do not pick. Call and email are separate.
        </p>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => onChange((s) => applyAutoDetailingStarter(s, productName))}
            >
              Load auto-detailing starter
            </Btn>
            <Btn size="sm" variant="primary" disabled={!dirty} loading={saving} onClick={onSave}>
              {saving ? "Saving…" : "Save"}
            </Btn>
          </div>
        )}
      </div>
      {saveError && <p className="text-sm text-stop">{saveError}</p>}

      <Panel>
        <h3 className="text-sm font-medium mb-1">Call</h3>
        <p className="text-xs text-muted mb-3 m-0">What the rep says. Two or three sentences.</p>
        {(["A", "B"] as const).map((letter, idx) => (
          <label key={letter} className="block text-xs text-muted mb-3">
            Script {letter}
            <textarea
              className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1 text-sm"
              rows={4}
              disabled={!canManage}
              value={call[idx]}
              onChange={(e) => setScript("call_scripts", idx as 0 | 1, e.target.value)}
            />
          </label>
        ))}
      </Panel>

      <Panel>
        <h3 className="text-sm font-medium mb-1">Email</h3>
        <p className="text-xs text-muted mb-3 m-0">Subject line, then a short body. Separate from the call scripts.</p>
        {(["A", "B"] as const).map((letter, idx) => (
          <label key={letter} className="block text-xs text-muted mb-3">
            Script {letter}
            <textarea
              className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1 text-sm"
              rows={5}
              disabled={!canManage}
              placeholder={letter === "A" ? "Subject: …\n\nHi {name}," : "Subject: …"}
              value={email[idx]}
              onChange={(e) => setScript("email_scripts", idx as 0 | 1, e.target.value)}
            />
          </label>
        ))}
        <p className="text-xs text-muted m-0">Placeholders: {"{name} {biz} {city} {me} {product}"}</p>
      </Panel>
    </div>
  );
}
