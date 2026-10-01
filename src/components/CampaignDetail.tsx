"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Btn, Chip, Panel, SectionLabel, Tabs } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { CampaignStrategy } from "@/server/strategy";
import {
  updateCampaignStrategy,
  rethinkStrategy,
  addCampaignNote,
  pauseCampaign,
  resumeCampaign,
  archiveCampaign,
} from "@/server/actions/campaigns";
import { addKnowledgeDocPaste, deleteKnowledgeDoc } from "@/server/actions/knowledge";
import { LeadGenRunner } from "@/components/LeadGenRunner";
import { ScriptsPanel } from "@/components/ScriptsPanel";
import type { Channel, CampaignNoteKind, CampaignStatus, LeadSource } from "@prisma/client";

const CHANNELS: Channel[] = ["email", "call", "instagram", "linkedin"];
const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", call: "Call", instagram: "Instagram", linkedin: "LinkedIn" };

type CampaignData = {
  id: string;
  name: string;
  status: CampaignStatus;
  goal: string | null;
  location: string | null;
  productName: string;
  ownerName: string;
  strategy: CampaignStrategy;
  strategyVersion: number;
  leadDailyCap: number;
  pausedReason: string | null;
  leadCountByStatus: Record<string, number>;
};

export function CampaignDetail({
  campaign,
  notes,
  sourceRuns,
  knowledgeDocs,
  touchStats,
  canManage,
}: {
  campaign: CampaignData;
  notes: { id: string; body: string; kind: CampaignNoteKind; authorName: string | null; createdAt: string }[];
  sourceRuns: { id: string; source: LeadSource; found: number; new: number; duplicates: number; startedAt: string }[];
  knowledgeDocs: { id: string; title: string; source: string }[];
  touchStats: { channel: Channel; outcome: string; count: number }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const [strategy, setStrategy] = useState(campaign.strategy);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rethinking, setRethinking] = useState(false);
  const [rethinkNotice, setRethinkNotice] = useState<string | null>(null);

  function update(mutator: (s: CampaignStrategy) => CampaignStrategy) {
    setStrategy((s) => mutator(structuredClone(s)));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateCampaignStrategy(campaign.id, strategy);
      setDirty(false);
      toast("Changes saved.");
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  }

  const statusLabel =
    campaign.status === "active" ? "Live" : campaign.status === "paused" ? "Paused" : campaign.status.replace("_", " ");
  const totalLeads = Object.values(campaign.leadCountByStatus).reduce((a, b) => a + b, 0);
  const readyInFocus =
    (campaign.leadCountByStatus["queued"] ?? 0) + (campaign.leadCountByStatus["in_cadence"] ?? 0);

  return (
    <div className="animate-fade-up max-w-wide">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-2">
        <div className="min-w-0">
          <h1 className="page-title m-0 mb-1">{campaign.name}</h1>
          <p className="text-muted text-sm m-0">
            {campaign.productName} · {campaign.ownerName}
            {campaign.location ? ` · ${campaign.location}` : ""}
          </p>
        </div>
        <Chip tone={campaign.status === "active" ? "go" : campaign.status === "paused" ? "stop" : "default"}>
          {statusLabel}
        </Chip>
      </div>

      <CampaignActions campaign={campaign} canManage={canManage} />

      {(totalLeads > 0 || readyInFocus > 0) && (
        <div className="flex flex-wrap gap-8 mb-8 mt-4">
          <div>
            <p className="stat-number text-accent m-0">{readyInFocus}</p>
            <p className="text-xs text-dim mt-1.5 mb-0">ready in Focus</p>
          </div>
          <div>
            <p className="stat-number m-0">{totalLeads}</p>
            <p className="text-xs text-dim mt-1.5 mb-0">total leads</p>
          </div>
        </div>
      )}

      {readyInFocus > 0 && (
        <div className="mb-8">
          <Link
            href="/focus"
            className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3.5 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
          >
            Open Focus · {readyInFocus} ready
          </Link>
        </div>
      )}

      <Tabs
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "icp", label: "ICP and lead gen" },
          { key: "playbook", label: "Playbook" },
          { key: "scripts", label: "Scripts" },
          { key: "knowledge", label: "Knowledge" },
          { key: "log", label: "Log" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
        <div className="space-y-8">
          <section>
            <SectionLabel>Plan</SectionLabel>
            <p className="text-[15px] leading-relaxed m-0 mb-3">{strategy.summary || "No summary yet."}</p>
            <p className="text-sm text-muted m-0 mb-1">
              <span className="text-ink font-medium">Goal:</span> {campaign.goal || "Not set"}
            </p>
            <p className="text-sm text-muted m-0">
              <span className="text-ink font-medium">Kill rule:</span> {strategy.kill_rule || "Not set"}
            </p>
          </section>

          <section>
            <SectionLabel>Leads by status</SectionLabel>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(campaign.leadCountByStatus).map(([status, count]) => (
                <Chip key={status}>
                  {status.replace(/_/g, " ")}: {count}
                </Chip>
              ))}
              {Object.keys(campaign.leadCountByStatus).length === 0 && (
                <p className="text-sm text-muted m-0">No leads yet.</p>
              )}
            </div>
          </section>

          <section>
            <SectionLabel>Results by channel</SectionLabel>
            {touchStats.length === 0 ? (
              <p className="text-sm text-muted m-0">No touches logged yet.</p>
            ) : (
              <div className="rounded-card border border-rule bg-panel overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-dim text-xs uppercase tracking-wide bg-panel2">
                      <th className="text-left font-semibold px-4 py-2.5">Channel</th>
                      <th className="text-left font-semibold px-4 py-2.5">Outcome</th>
                      <th className="text-left font-semibold px-4 py-2.5">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {touchStats.map((t, i) => (
                      <tr key={i} className="border-t border-rule">
                        <td className="px-4 py-2.5">{CHANNEL_LABEL[t.channel]}</td>
                        <td className="px-4 py-2.5 text-muted">{t.outcome.replace("_", " ")}</td>
                        <td className="px-4 py-2.5 font-semibold">{t.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <SectionLabel>Lead engine</SectionLabel>
            <p className="text-sm text-muted m-0 leading-relaxed">
              Import a list from Campaigns, or run discovery on the ICP tab if Places is configured. New leads land in
              Focus — nothing is sent to prospects.
            </p>
          </section>
        </div>
      )}

      {tab === "icp" && (
        <div className="space-y-4">
          <Panel>
            <h2 className="text-[17px] font-medium mb-3">ICP</h2>
            <div className="grid grid-cols-2 gap-3">
              {(["buyer", "business", "location", "size"] as const).map((field) => (
                <label key={field} className="text-sm capitalize">
                  {field}
                  <input
                    className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1"
                    value={strategy.icp[field]}
                    disabled={!canManage}
                    onChange={(e) => update((s) => ({ ...s, icp: { ...s.icp, [field]: e.target.value } }))}
                  />
                </label>
              ))}
            </div>
            <label className="block text-sm mt-3">
              Triggers (one per line)
              <textarea
                className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1"
                disabled={!canManage}
                value={strategy.icp.triggers.join("\n")}
                onChange={(e) => update((s) => ({ ...s, icp: { ...s.icp, triggers: e.target.value.split("\n").filter(Boolean) } }))}
              />
            </label>
            <label className="block text-sm mt-3">
              Disqualifiers (one per line)
              <textarea
                className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1"
                disabled={!canManage}
                value={strategy.icp.disqualifiers.join("\n")}
                onChange={(e) => update((s) => ({ ...s, icp: { ...s.icp, disqualifiers: e.target.value.split("\n").filter(Boolean) } }))}
              />
            </label>
          </Panel>

          <Panel>
            <h2 className="text-[17px] font-medium mb-3">Lead-gen config</h2>
            {(["sources", "search_queries", "must_have", "score_boost"] as const).map((field) => (
              <label key={field} className="block text-sm mb-3">
                {field.replace("_", " ")} (one per line)
                <textarea
                  className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1"
                  disabled={!canManage}
                  value={strategy.lead_gen[field].join("\n")}
                  onChange={(e) =>
                    update((s) => ({ ...s, lead_gen: { ...s.lead_gen, [field]: e.target.value.split("\n").filter(Boolean) } }))
                  }
                />
              </label>
            ))}
            <p className="text-sm text-muted">Daily cap: {campaign.leadDailyCap}</p>
          </Panel>

          {canManage && <LeadGenRunner campaignId={campaign.id} />}

          <Panel>
            <h2 className="text-[17px] font-medium mb-2">Run history</h2>
            {sourceRuns.length === 0 ? (
              <p className="text-sm text-muted">No runs yet.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {sourceRuns.map((r) => (
                  <li key={r.id}>
                    {r.source} — found {r.found}, new {r.new}, duplicates {r.duplicates} — {new Date(r.startedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {saveError && <p className="text-sm text-stop">{saveError}</p>}
          {canManage && (
            <Btn variant="primary" disabled={!dirty} loading={saving} onClick={save}>
              {saving ? "Saving…" : "Save changes"}
            </Btn>
          )}
        </div>
      )}

      {tab === "scripts" && (
        <ScriptsPanel
          strategy={strategy}
          productName={campaign.productName}
          canManage={canManage}
          onChange={update}
          onSave={save}
          dirty={dirty}
          saving={saving}
          saveError={saveError}
        />
      )}

      {tab === "playbook" && (
        <PlaybookEditor
          campaignId={campaign.id}
          strategy={strategy}
          canManage={canManage}
          onChange={update}
          onRethink={async (changeRequest) => {
            setRethinking(true);
            setRethinkNotice(null);
            try {
              const result = await rethinkStrategy(campaign.id, changeRequest || undefined);
              setStrategy(result.strategy);
              setDirty(true);
              setRethinkNotice(
                result.source === "ai" ? "Regenerated by Flow. Review below, then Save to apply." : `AI unavailable (${result.reason}) — regenerated from the template instead.`,
              );
            } catch (e) {
              setRethinkNotice(e instanceof Error ? e.message : "Couldn't rethink the playbook.");
            } finally {
              setRethinking(false);
            }
          }}
          onSave={save}
          dirty={dirty}
          saving={saving}
          saveError={saveError}
          rethinking={rethinking}
          rethinkNotice={rethinkNotice}
          version={campaign.strategyVersion}
        />
      )}

      {tab === "knowledge" && <KnowledgeTab campaignId={campaign.id} docs={knowledgeDocs} canManage={canManage} />}

      {tab === "log" && <LogTab campaignId={campaign.id} notes={notes} canManage={canManage} />}
    </div>
  );
}

function CampaignActions({ campaign, canManage }: { campaign: CampaignData; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [showPause, setShowPause] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  async function run(fn: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast(successMessage);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
    <div className="flex flex-wrap gap-2 items-center">
      {campaign.status === "active" && !showPause && (
        <Btn size="sm" variant="stop" onClick={() => setShowPause(true)}>
          Pause
        </Btn>
      )}
      {showPause && (
        <div className="flex gap-2 items-center">
          <input
            className="border border-rule rounded-lg px-2 py-1 text-sm bg-panel"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Btn size="sm" variant="stop" disabled={!reason} loading={busy} onClick={() => run(() => pauseCampaign(campaign.id, reason), "Campaign paused.")}>
            Confirm pause
          </Btn>
          <Btn size="sm" variant="ghost" disabled={busy} onClick={() => setShowPause(false)}>
            Cancel
          </Btn>
        </div>
      )}
      {campaign.status === "paused" && (
        <Btn size="sm" variant="go" loading={busy} onClick={() => run(() => resumeCampaign(campaign.id), "Campaign resumed.")}>
          Resume
        </Btn>
      )}
      {campaign.status !== "archived" && (
        <Btn size="sm" variant="ghost" loading={busy} onClick={() => run(() => archiveCampaign(campaign.id), "Campaign archived.")}>
          Archive
        </Btn>
      )}
    </div>
      {error && <p className="text-sm text-stop mt-2">{error}</p>}
    </div>
  );
}

function PlaybookEditor({
  campaignId,
  strategy,
  canManage,
  onChange,
  onRethink,
  onSave,
  dirty,
  saving,
  saveError,
  rethinking,
  rethinkNotice,
  version,
}: {
  campaignId: string;
  strategy: CampaignStrategy;
  canManage: boolean;
  onChange: (mutator: (s: CampaignStrategy) => CampaignStrategy) => void;
  onRethink: (changeRequest: string) => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  rethinking: boolean;
  rethinkNotice: string | null;
  version: number;
}) {
  const [changeRequest, setChangeRequest] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted">Version {version}</p>
        <div className="flex gap-2">
          {canManage && (
            <Link href={`/campaigns/${campaignId}/wizard`}>
              <Btn size="sm" variant="ghost">
                Rebuild via wizard (Research → ICP → Playbook)
              </Btn>
            </Link>
          )}
          {canManage && (
            <Btn size="sm" variant="primary" disabled={!dirty} loading={saving} onClick={onSave}>
              {saving ? "Saving…" : "Save"}
            </Btn>
          )}
        </div>
      </div>
      {saveError && <p className="text-sm text-stop">{saveError}</p>}

      {canManage && (
        <Panel>
          <p className="text-sm font-medium mb-2">Rethink with Flow</p>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-rule rounded-lg px-3 py-2 bg-bg text-sm"
              placeholder="Optional: what should change? e.g. 'focus more on LinkedIn' — leave blank to just regenerate"
              value={changeRequest}
              onChange={(e) => setChangeRequest(e.target.value)}
              disabled={rethinking}
            />
            <Btn size="sm" variant="ghost" loading={rethinking} onClick={() => onRethink(changeRequest)}>
              {rethinking ? "Thinking…" : "Rethink"}
            </Btn>
          </div>
          {rethinkNotice && <p className="text-xs text-muted mt-2">{rethinkNotice}</p>}
        </Panel>
      )}

      <Panel>
        <label className="block text-sm">
          Summary
          <textarea
            className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1"
            disabled={!canManage}
            value={strategy.summary}
            onChange={(e) => onChange((s) => ({ ...s, summary: e.target.value }))}
          />
        </label>
      </Panel>

      <Panel>
        <h3 className="text-sm font-medium mb-2">Channels</h3>
        {strategy.channels.map((c, i) => (
          <div key={i} className="flex gap-2 mb-2 items-start">
            <select
              className="border border-rule rounded-lg px-2 py-1.5 bg-bg"
              value={c.channel}
              disabled={!canManage}
              onChange={(e) =>
                onChange((s) => {
                  const target = s.channels[i];
                  if (target) target.channel = e.target.value as Channel;
                  return s;
                })
              }
            >
              {CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_LABEL[ch]}
                </option>
              ))}
            </select>
            <input
              className="flex-1 border border-rule rounded-lg px-2.5 py-1.5 bg-bg"
              value={c.why}
              disabled={!canManage}
              onChange={(e) =>
                onChange((s) => {
                  const target = s.channels[i];
                  if (target) target.why = e.target.value;
                  return s;
                })
              }
            />
            {canManage && (
              <button
                onClick={() => onChange((s) => ({ ...s, channels: s.channels.filter((_, idx) => idx !== i) }))}
                className="text-stop text-sm px-2"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <button
            className="text-sm text-accent font-medium"
            onClick={() => onChange((s) => ({ ...s, channels: [...s.channels, { channel: "email", why: "" }] }))}
          >
            + Add channel
          </button>
        )}
      </Panel>

      <Panel>
        <h3 className="text-sm font-medium mb-2">Cadence</h3>
        {strategy.cadence.map((c, i) => (
          <div key={i} className="border border-rule rounded-lg p-3 mb-2">
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                className="w-20 border border-rule rounded-lg px-2 py-1.5 bg-bg"
                value={c.day}
                disabled={!canManage}
                onChange={(e) =>
                  onChange((s) => {
                    const target = s.cadence[i];
                    if (target) target.day = Number(e.target.value);
                    return s;
                  })
                }
              />
              <select
                className="border border-rule rounded-lg px-2 py-1.5 bg-bg"
                value={c.channel}
                disabled={!canManage}
                onChange={(e) =>
                  onChange((s) => {
                    const target = s.cadence[i];
                    if (target) target.channel = e.target.value as Channel;
                    return s;
                  })
                }
              >
                {CHANNELS.map((ch) => (
                  <option key={ch} value={ch}>
                    {CHANNEL_LABEL[ch]}
                  </option>
                ))}
              </select>
              {canManage && (
                <div className="ml-auto flex gap-1">
                  <button
                    disabled={i === 0}
                    onClick={() =>
                      onChange((s) => {
                        const prev = s.cadence[i - 1];
                        const curr = s.cadence[i];
                        if (prev && curr) {
                          s.cadence[i - 1] = curr;
                          s.cadence[i] = prev;
                        }
                        return s;
                      })
                    }
                    className="text-sm px-2 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    disabled={i === strategy.cadence.length - 1}
                    onClick={() =>
                      onChange((s) => {
                        const next = s.cadence[i + 1];
                        const curr = s.cadence[i];
                        if (next && curr) {
                          s.cadence[i + 1] = curr;
                          s.cadence[i] = next;
                        }
                        return s;
                      })
                    }
                    className="text-sm px-2 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button onClick={() => onChange((s) => ({ ...s, cadence: s.cadence.filter((_, idx) => idx !== i) }))} className="text-stop text-sm px-2">
                    ✕
                  </button>
                </div>
              )}
            </div>
            <input
              className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mb-2"
              placeholder="Purpose"
              value={c.purpose}
              disabled={!canManage}
              onChange={(e) =>
                onChange((s) => {
                  const target = s.cadence[i];
                  if (target) target.purpose = e.target.value;
                  return s;
                })
              }
            />
            <input
              className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg"
              placeholder="Sales tip"
              value={c.tip}
              disabled={!canManage}
              onChange={(e) =>
                onChange((s) => {
                  const target = s.cadence[i];
                  if (target) target.tip = e.target.value;
                  return s;
                })
              }
            />
          </div>
        ))}
        {canManage && (
          <button
            className="text-sm text-accent font-medium"
            onClick={() =>
              onChange((s) => ({
                ...s,
                cadence: [...s.cadence, { day: (s.cadence.at(-1)?.day ?? 0) + 3, channel: "email", purpose: "", tip: "" }],
              }))
            }
          >
            + Add step
          </button>
        )}
      </Panel>

      <Panel>
        <h3 className="text-sm font-medium mb-1">Scripts</h3>
        <p className="text-sm text-muted m-0">
          Call and email A/B openers live on the Scripts tab. Focus assigns one. This playbook does not ask the rep to pick.
        </p>
      </Panel>

      <Panel>
        <h3 className="text-sm font-medium mb-2">Messages</h3>
        {CHANNELS.filter((ch) => strategy.channels.some((c) => c.channel === ch)).map((ch) => (
          <div key={ch} className="mb-4">
            <p className="text-sm font-medium mb-1">{CHANNEL_LABEL[ch]}</p>
            {(["first", "follow"] as const).map((variant) => (
              <label key={variant} className="block text-xs text-muted mb-2">
                {variant === "first" ? "First message" : "Follow-up"}
                <textarea
                  className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1 font-mono text-xs"
                  rows={4}
                  disabled={!canManage}
                  value={strategy.messages[ch]?.[variant] ?? ""}
                  onChange={(e) =>
                    onChange((s) => {
                      s.messages[ch] = { ...(s.messages[ch] ?? { first: "", follow: "" }), [variant]: e.target.value };
                      return s;
                    })
                  }
                />
              </label>
            ))}
          </div>
        ))}
        <p className="text-xs text-muted">Placeholders: {"{name} {biz} {city} {me} {product}"}</p>
      </Panel>

      <Panel>
        <h3 className="text-sm font-medium mb-2">Objections</h3>
        {strategy.objections.map((o, i) => (
          <div key={i} className="border border-rule rounded-lg p-3 mb-2">
            <input
              className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mb-2"
              placeholder="Objection"
              value={o.question}
              disabled={!canManage}
              onChange={(e) =>
                onChange((s) => {
                  const target = s.objections[i];
                  if (target) target.question = e.target.value;
                  return s;
                })
              }
            />
            <textarea
              className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg"
              placeholder="Response"
              value={o.answer}
              disabled={!canManage}
              onChange={(e) =>
                onChange((s) => {
                  const target = s.objections[i];
                  if (target) target.answer = e.target.value;
                  return s;
                })
              }
            />
            {canManage && (
              <button onClick={() => onChange((s) => ({ ...s, objections: s.objections.filter((_, idx) => idx !== i) }))} className="text-stop text-sm mt-1">
                Remove
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <button
            className="text-sm text-accent font-medium"
            onClick={() => onChange((s) => ({ ...s, objections: [...s.objections, { question: "", answer: "" }] }))}
          >
            + Add objection
          </button>
        )}
      </Panel>

      <Panel>
        <label className="block text-sm">
          Kill rule
          <input
            className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mt-1"
            value={strategy.kill_rule}
            disabled={!canManage}
            onChange={(e) => onChange((s) => ({ ...s, kill_rule: e.target.value }))}
          />
        </label>
      </Panel>
    </div>
  );
}

function KnowledgeTab({ campaignId, docs, canManage }: { campaignId: string; docs: { id: string; title: string; source: string }[]; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Docs</h2>
        {docs.length === 0 && <p className="text-sm text-muted mb-3">No knowledge docs yet.</p>}
        {docs.map((d) => (
          <div key={d.id} className="flex justify-between items-center py-2 border-b border-rule last:border-0 text-sm">
            <span>
              {d.title} <span className="text-muted">({d.source})</span>
            </span>
            {canManage && (
              <button
                className="text-stop disabled:opacity-40"
                disabled={deletingId === d.id}
                onClick={async () => {
                  if (!confirm(`Delete "${d.title}"?`)) return;
                  setDeletingId(d.id);
                  setError(null);
                  try {
                    await deleteKnowledgeDoc(d.id, campaignId);
                    toast("Doc deleted.");
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Couldn't delete that doc.");
                  } finally {
                    setDeletingId(null);
                  }
                }}
              >
                {deletingId === d.id ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        ))}
      </Panel>
      {error && <p className="text-sm text-stop">{error}</p>}
      {canManage && (
        <Panel>
          <h2 className="text-[17px] font-medium mb-3">Paste text</h2>
          <p className="text-xs text-muted mb-2">File upload with extraction arrives in Phase 2 — paste text for now.</p>
          <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mb-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mb-3 min-h-[140px]" value={text} onChange={(e) => setText(e.target.value)} />
          <Btn
            variant="primary"
            disabled={!title || !text}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await addKnowledgeDocPaste(campaignId, title, text);
                setTitle("");
                setText("");
                toast("Doc added.");
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't add that doc.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Add doc"}
          </Btn>
        </Panel>
      )}
    </div>
  );
}

function LogTab({
  campaignId,
  notes,
  canManage,
}: {
  campaignId: string;
  notes: { id: string; body: string; kind: CampaignNoteKind; authorName: string | null; createdAt: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      {canManage && (
        <Panel className="mb-4">
          <textarea className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mb-2" placeholder="Add a note" value={body} onChange={(e) => setBody(e.target.value)} />
          {error && <p className="text-sm text-stop mb-2">{error}</p>}
          <Btn
            variant="primary"
            size="sm"
            disabled={!body}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await addCampaignNote(campaignId, body);
                setBody("");
                toast("Note added.");
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't add that note.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Adding…" : "Add note"}
          </Btn>
        </Panel>
      )}
      <div>
        {notes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} className="border-b border-rule py-3 text-sm">
            <div className="flex justify-between text-xs text-muted mb-1">
              <span>{n.authorName ?? "System"}</span>
              <span>{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            {n.body}
          </div>
        ))}
      </div>
    </div>
  );
}
