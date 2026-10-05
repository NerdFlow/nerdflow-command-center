"use client";

import { useState } from "react";
import { Btn, Panel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { TITAN_FROM } from "@/lib/pipelineToday";
import type { MailboxSignatureMap } from "@/lib/mailboxSignature";
import { liveAiSummary, type LiveAiConfig } from "@/lib/liveAi";
import { updateOrgSettings } from "@/server/actions/admin";

type CadenceChannel = "email" | "linkedin" | "call";

type SignatureRow = { email: string; name: string; signature: string };

type Settings = {
  allowedEmailDomain: string;
  assistantName: string;
  leadDailyCapDefault: number;
  aiMonthlyBudgetUsd: number;
  workingHoursDefault: { start: string; end: string };
  focusCadence: { day: number; channel: CadenceChannel }[];
  outreachDraftKillSwitch: boolean;
  outreachDraftDailyCap: number;
  postalAddress: string;
  optOutLine: string;
  mailboxSignatures: MailboxSignatureMap;
};

type OutreachUsage = {
  draftsToday: number;
  tokensToday: number;
  tokensMonth: number;
  costMonthUsd: number;
  lastDraftLatencyMs: number | null;
  lastDraftModel: string | null;
};

function signatureRows(map: MailboxSignatureMap): SignatureRow[] {
  const rows = Object.entries(map).map(([email, sig]) => ({
    email,
    name: sig.name,
    signature: sig.signature,
  }));
  if (rows.length === 0) rows.push({ email: TITAN_FROM, name: "", signature: "" });
  return rows;
}

const CHANNEL_LABEL: Record<CadenceChannel, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  call: "Call",
};

export function SettingsClient({ settings, usage, ai }: { settings: Settings; usage: OutreachUsage; ai: LiveAiConfig }) {
  const toast = useToast();
  const [form, setForm] = useState(settings);
  const [signatures, setSignatures] = useState<SignatureRow[]>(() => signatureRows(settings.mailboxSignatures));
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

      <Panel>
        <p className="text-sm font-medium mb-1">Outreach drafts</p>
        <p className="text-sm text-muted mb-3">
          Generate runs only when someone clicks it. Nothing is sent from here. The daily cap counts Asia/Karachi days.
        </p>
        <label className="flex items-center gap-2 text-sm mb-3">
          <input
            type="checkbox"
            checked={form.outreachDraftKillSwitch}
            onChange={(e) => set("outreachDraftKillSwitch", e.target.checked)}
          />
          Switch off draft generation
        </label>
        <label className="block text-sm mb-3">
          Daily draft cap
          <input
            type="number"
            min={1}
            max={500}
            className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
            value={form.outreachDraftDailyCap}
            onChange={(e) => set("outreachDraftDailyCap", Number(e.target.value))}
          />
        </label>
        <p className="text-sm mb-3">{liveAiSummary(ai)}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Drafts today</dt>
          <dd>{usage.draftsToday}</dd>
          <dt className="text-muted">Tokens today</dt>
          <dd>{usage.tokensToday.toLocaleString()}</dd>
          <dt className="text-muted">Tokens this month</dt>
          <dd>{usage.tokensMonth.toLocaleString()}</dd>
          <dt className="text-muted">Cost this month</dt>
          <dd>${usage.costMonthUsd.toFixed(2)}</dd>
          <dt className="text-muted">Last draft latency</dt>
          <dd>{usage.lastDraftLatencyMs == null ? "None yet" : `${usage.lastDraftLatencyMs.toLocaleString()} ms`}</dd>
          <dt className="text-muted">Last model used</dt>
          <dd>{usage.lastDraftModel ?? "None yet"}</dd>
        </dl>
      </Panel>

      <Panel>
        <p className="text-sm font-medium mb-1">Email compliance</p>
        <p className="text-sm text-muted mb-3">
          Leave these blank and Focus only warns. Once saved, a missing postal address or opt-out line blocks send.
        </p>
        <label className="block text-sm mb-3">
          Postal address
          <textarea
            className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1 min-h-16"
            value={form.postalAddress}
            onChange={(e) => set("postalAddress", e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Opt-out line
          <input
            className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
            value={form.optOutLine}
            onChange={(e) => set("optOutLine", e.target.value)}
          />
        </label>
      </Panel>

      <Panel>
        <p className="text-sm font-medium mb-1">Mailbox signatures</p>
        <p className="text-sm text-muted mb-3">
          The name must appear in the email before send. Pipeline email uses {TITAN_FROM}. Other email uses the rep&apos;s address.
        </p>
        <div className="space-y-3">
          {signatures.map((row, index) => (
            <div key={index} className="space-y-2 border border-rule rounded-lg p-3">
              <label className="block text-sm">
                Mailbox
                <input
                  type="email"
                  className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
                  value={row.email}
                  onChange={(e) => {
                    const email = e.target.value;
                    setSignatures((rows) => rows.map((item, itemIndex) => (itemIndex === index ? { ...item, email } : item)));
                    setSaved(false);
                  }}
                />
              </label>
              <label className="block text-sm">
                Name on the signature
                <input
                  className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
                  value={row.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setSignatures((rows) => rows.map((item, itemIndex) => (itemIndex === index ? { ...item, name } : item)));
                    setSaved(false);
                  }}
                />
              </label>
              <label className="block text-sm">
                Signature block
                <textarea
                  className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1 min-h-16"
                  value={row.signature}
                  onChange={(e) => {
                    const signature = e.target.value;
                    setSignatures((rows) => rows.map((item, itemIndex) => (itemIndex === index ? { ...item, signature } : item)));
                    setSaved(false);
                  }}
                />
              </label>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => {
                  setSignatures((rows) => rows.filter((_, itemIndex) => itemIndex !== index));
                  setSaved(false);
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="text-sm text-accent font-medium mt-3"
          onClick={() => {
            setSignatures((rows) => [...rows, { email: "", name: "", signature: "" }]);
            setSaved(false);
          }}
        >
          Add mailbox
        </button>
      </Panel>

      {error && <p className="text-sm text-stop">{error}</p>}
      <Btn
        variant="primary"
        loading={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            const mailboxSignatures: MailboxSignatureMap = {};
            for (const row of signatures) {
              const email = row.email.trim().toLowerCase();
              if (!email.includes("@")) continue;
              mailboxSignatures[email] = { name: row.name.trim(), signature: row.signature.trim() };
            }
            await updateOrgSettings({
              ...form,
              postalAddress: form.postalAddress.trim() || null,
              optOutLine: form.optOutLine.trim() || null,
              mailboxSignatures,
              workingHoursDefault: { ...form.workingHoursDefault, days: [1, 2, 3, 4, 5] },
            });
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
