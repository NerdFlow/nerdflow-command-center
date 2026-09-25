"use client";

import { useState } from "react";
import { Btn, Panel } from "@/components/ui";
import { updateOrgSettings } from "@/server/actions/admin";

type Settings = {
  allowedEmailDomain: string;
  assistantName: string;
  leadDailyCapDefault: number;
  aiMonthlyBudgetUsd: number;
  workingHoursDefault: { start: string; end: string };
};

export function SettingsClient({ settings }: { settings: Settings }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  return (
    <div className="max-w-lg space-y-4">
      <Panel>
        <label className="block text-sm mb-3">
          Allowed email domain
          <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.allowedEmailDomain} onChange={(e) => set("allowedEmailDomain", e.target.value)} />
        </label>
        <label className="block text-sm">
          Assistant name
          <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.assistantName} onChange={(e) => set("assistantName", e.target.value)} />
        </label>
      </Panel>

      <Panel>
        <p className="text-sm font-medium mb-2">Default working hours (new people start with this)</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Start
            <input type="time" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.workingHoursDefault.start} onChange={(e) => set("workingHoursDefault", { ...form.workingHoursDefault, start: e.target.value })} />
          </label>
          <label className="text-sm">
            End
            <input type="time" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.workingHoursDefault.end} onChange={(e) => set("workingHoursDefault", { ...form.workingHoursDefault, end: e.target.value })} />
          </label>
        </div>
      </Panel>

      <Panel>
        <label className="block text-sm mb-3">
          Lead daily cap default (per campaign, once Lead Generation ships)
          <input type="number" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.leadDailyCapDefault} onChange={(e) => set("leadDailyCapDefault", Number(e.target.value))} />
        </label>
        <label className="block text-sm">
          AI monthly budget (USD)
          <input type="number" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.aiMonthlyBudgetUsd} onChange={(e) => set("aiMonthlyBudgetUsd", Number(e.target.value))} />
        </label>
      </Panel>

      {error && <p className="text-sm text-stop">{error}</p>}
      <Btn
        variant="primary"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await updateOrgSettings({ ...form, workingHoursDefault: { ...form.workingHoursDefault, days: [1, 2, 3, 4, 5] } });
            setSaved(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't save settings.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save settings"}
      </Btn>
    </div>
  );
}
