"use client";

import { useState } from "react";
import { Btn, Panel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { updateOrgSettings } from "@/server/actions/admin";

type CadenceChannel = "email" | "linkedin" | "call";

type Settings = {
  allowedEmailDomain: string;
  assistantName: string;
  leadDailyCapDefault: number;
  aiMonthlyBudgetUsd: number;
  workingHoursDefault: { start: string; end: string };
  focusCadence: { day: number; channel: CadenceChannel }[];
};

const CHANNEL_LABEL: Record<CadenceChannel, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  call: "Call",
};

export function SettingsClient({ settings }: { settings: Settings }) {
  const toast = useToast();
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
        <p className="text-sm font-medium mb-1">Focus cadence</p>
        <p className="text-sm text-muted mb-3">
          One card at a time. The next step shows after the previous one is Done, on that day in Asia/Karachi. Day 0 is the day the first card is queued.
        </p>
        <div className="space-y-2">
          {form.focusCadence.map((step, index) => (
            <div key={`${step.channel}-${index}`} className="grid grid-cols-[5rem_1fr_auto] gap-2 items-end">
              <label className="text-sm">
                Day
                <input
                  type="number"
                  min={0}
                  max={365}
                  className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
                  value={step.day}
                  onChange={(e) => {
                    const day = Number(e.target.value);
                    set(
                      "focusCadence",
                      form.focusCadence.map((item, itemIndex) => (itemIndex === index ? { ...item, day: Number.isFinite(day) ? day : 0 } : item)),
                    );
                  }}
                />
              </label>
              <label className="text-sm">
                Channel
                <select
                  className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
                  value={step.channel}
                  onChange={(e) => {
                    const channel = e.target.value as CadenceChannel;
                    set(
                      "focusCadence",
                      form.focusCadence.map((item, itemIndex) => (itemIndex === index ? { ...item, channel } : item)),
                    );
                  }}
                >
                  {(Object.keys(CHANNEL_LABEL) as CadenceChannel[]).map((channel) => (
                    <option key={channel} value={channel}>
                      {CHANNEL_LABEL[channel]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="text-sm text-muted px-2 py-2 disabled:opacity-40"
                disabled={form.focusCadence.length <= 1}
                onClick={() => set("focusCadence", form.focusCadence.filter((_, itemIndex) => itemIndex !== index))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="text-sm text-accent font-medium mt-3"
          disabled={form.focusCadence.length >= 12}
          onClick={() => {
            const last = form.focusCadence[form.focusCadence.length - 1];
            set("focusCadence", [...form.focusCadence, { day: (last?.day ?? 0) + 1, channel: "email" }]);
          }}
        >
          Add step
        </button>
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
        loading={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await updateOrgSettings({ ...form, workingHoursDefault: { ...form.workingHoursDefault, days: [1, 2, 3, 4, 5] } });
            setSaved(true);
            toast("Settings saved.");
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
