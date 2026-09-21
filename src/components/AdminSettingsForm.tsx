"use client";

import { useState } from "react";
import { Btn, Panel } from "@/components/ui";
import { updateOrgSettings } from "@/server/actions/admin";

type Settings = {
  allowedEmailDomain: string;
  welcomeMessage: string;
  assistantName: string;
  campaignLimitPerRep: number;
  leadDailyCapDefault: number;
  autoPauseTouchThreshold: number;
  autoPauseReplyFloorPct: number;
  autoPauseBounceCeilPct: number;
  emailDraftSavingEnabled: boolean;
  recordingConsentPolicy: string;
  aiMonthlyBudgetUsd: number;
};

export function AdminSettingsForm({ settings }: { settings: Settings }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
        <label className="block text-sm mb-3">
          Welcome message (onboarding step 1)
          <textarea className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1 min-h-[100px]" value={form.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} />
        </label>
      </Panel>

      <Panel>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Campaign limit per rep
            <input type="number" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.campaignLimitPerRep} onChange={(e) => set("campaignLimitPerRep", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Lead daily cap default
            <input type="number" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.leadDailyCapDefault} onChange={(e) => set("leadDailyCapDefault", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Auto-pause touch threshold
            <input type="number" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.autoPauseTouchThreshold} onChange={(e) => set("autoPauseTouchThreshold", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Auto-pause reply floor (%)
            <input type="number" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.autoPauseReplyFloorPct} onChange={(e) => set("autoPauseReplyFloorPct", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Auto-pause bounce ceiling (%)
            <input type="number" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.autoPauseBounceCeilPct} onChange={(e) => set("autoPauseBounceCeilPct", Number(e.target.value))} />
          </label>
          <label className="text-sm">
            AI monthly budget (USD)
            <input type="number" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.aiMonthlyBudgetUsd} onChange={(e) => set("aiMonthlyBudgetUsd", Number(e.target.value))} />
          </label>
        </div>
        <p className="text-xs text-muted mt-3">Auto-pause and lead engine caps take effect once Phase 4 ships.</p>
      </Panel>

      <Panel>
        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" className="accent-accent" checked={form.emailDraftSavingEnabled} onChange={(e) => set("emailDraftSavingEnabled", e.target.checked)} />
          Allow saving AI-drafted emails to Gmail drafts (Phase 4)
        </label>
        <label className="block text-sm">
          Recording consent policy
          <textarea className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={form.recordingConsentPolicy} onChange={(e) => set("recordingConsentPolicy", e.target.value)} />
        </label>
      </Panel>

      <Btn
        variant="primary"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await updateOrgSettings(form);
          setSaving(false);
          setSaved(true);
        }}
      >
        {saving ? "Saving…" : saved ? "Saved" : "Save settings"}
      </Btn>
    </div>
  );
}
