"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Chip, Panel, Tabs } from "@/components/ui";
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
  const [tab, setTab] = useState("overview");
  const [strategy, setStrategy] = useState(campaign.strategy);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rethinking, setRethinking] = useState(false);
  const [rethinkNotice, setRethinkNotice] = useState<string | null>(null);

  function update(mutator: (s: CampaignStrategy) => CampaignStrategy) {
    setStrategy((s) => mutator(structuredClone(s)));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    await updateCampaignStrategy(campaign.id, strategy);
    setSaving(false);
    setDirty(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-1.5">
        <div>
          <h1 className="text-[28px] tracking-tight mb-0.5">{campaign.name}</h1>
          <p className="text-muted m-0">
            {campaign.productName} · owned by {campaign.ownerName}
          </p>
        </div>
        <div className="flex gap-2">
          <Chip tone={campaign.status === "active" ? "go" : campaign.status === "paused" ? "stop" : "default"}>
            {campaign.status.replace("_", " ")}
          </Chip>
        </div>
      </div>

      <CampaignActions campaign={campaign} canManage={canManage} />

      <Tabs
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "icp", label: "ICP and lead gen" },
          { key: "playbook", label: "Playbook" },
          { key: "knowledge", label: "Knowledge" },
          { key: "log", label: "Log" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
        <div className="space-y-4">
          <Panel>
            <h2 className="text-[17px] font-medium mb-2">Plan</h2>
            <p className="text-sm text-muted mb-3">{strategy.summary}</p>
            <p className="text-sm">
              <b>Goal:</b> {campaign.goal || "Not set"}
            </p>
            <p className="text-sm">
              <b>Kill rule:</b> {strategy.kill_rule}
            </p>
          </Panel>
          <Panel>
            <h2 className="text-[17px] font-medium mb-2">Leads by status</h2>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(campaign.leadCountByStatus).map(([status, count]) => (
                <Chip key={status}>
                  {status}: {count}
                </Chip>
              ))}
              {Object.keys(campaign.leadCountByStatus).length === 0 && <p className="text-sm text-muted">No leads yet.</p>}
            </div>
          </Panel>
          <Panel>
            <h2 className="text-[17px] font-medium mb-2">Results by channel</h2>
            {touchStats.length === 0 ? (
              <p className="text-sm text-muted">No touches logged yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left font-medium py-1">Channel</th>
                    <th className="text-left font-medium py-1">Outcome</th>
                    <th className="text-left font-medium py-1">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {touchStats.map((t, i) => (
                    <tr key={i} className="border-t border-rule">
                      <td className="py-1.5">{CHANNEL_LABEL[t.channel]}</td>
                      <td className="py-1.5">{t.outcome.replace("_", " ")}</td>
                      <td className="py-1.5">{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Panel>
            <h2 className="text-[17px] font-medium mb-2">Lead engine status</h2>
            <p className="text-sm text-muted">
              Manual runs are live on the ICP and lead gen tab — searches Google for real businesses and lands
              them in the Lead Inbox. Nightly automatic runs need a background worker, which isn&apos;t built yet;
              CSV import on the Lead Inbox page still works in the meantime.
            </p>
          </Panel>
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

          {canManage && (
            <Btn variant="primary" disabled={!dirty || saving} onClick={save}>
              {saving ? "Saving…" : "Save changes"}
            </Btn>
          )}
        </div>
      )}

      {tab === "playbook" && (
        <PlaybookEditor
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
            } finally {
              setRethinking(false);
            }
          }}
          onSave={save}
          dirty={dirty}
          saving={saving}
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
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [showPause, setShowPause] = useState(false);

  if (!canManage) return null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
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
          <Btn size="sm" variant="stop" disabled={!reason || busy} onClick={() => run(() => pauseCampaign(campaign.id, reason))}>
            Confirm pause
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => setShowPause(false)}>
            Cancel
          </Btn>
        </div>
      )}
      {campaign.status === "paused" && (
        <Btn size="sm" variant="go" disabled={busy} onClick={() => run(() => resumeCampaign(campaign.id))}>
          Resume
        </Btn>
      )}
      {campaign.status !== "archived" && (
        <Btn size="sm" variant="ghost" disabled={busy} onClick={() => run(() => archiveCampaign(campaign.id))}>
          Archive
        </Btn>
      )}
    </div>
  );
}

function PlaybookEditor({
  strategy,
  canManage,
  onChange,
  onRethink,
  onSave,
  dirty,
  saving,
  rethinking,
  rethinkNotice,
  version,
}: {
  strategy: CampaignStrategy;
  canManage: boolean;
  onChange: (mutator: (s: CampaignStrategy) => CampaignStrategy) => void;
  onRethink: (changeRequest: string) => void;
  onSave: () => void;
  dirty: boolean;
  saving: boolean;
  rethinking: boolean;
  rethinkNotice: string | null;
  version: number;
}) {
  const [changeRequest, setChangeRequest] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted">Version {version}</p>
        {canManage && (
          <Btn size="sm" variant="primary" disabled={!dirty || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save"}
          </Btn>
        )}
      </div>

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
            <Btn size="sm" variant="ghost" disabled={rethinking} onClick={() => onRethink(changeRequest)}>
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
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

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
                className="text-stop"
                onClick={async () => {
                  if (!confirm(`Delete "${d.title}"?`)) return;
                  await deleteKnowledgeDoc(d.id, campaignId);
                  router.refresh();
                }}
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </Panel>
      {canManage && (
        <Panel>
          <h2 className="text-[17px] font-medium mb-3">Paste text</h2>
          <p className="text-xs text-muted mb-2">File upload with extraction arrives in Phase 2 — paste text for now.</p>
          <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mb-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mb-3 min-h-[140px]" value={text} onChange={(e) => setText(e.target.value)} />
          <Btn
            variant="primary"
            disabled={!title || !text || busy}
            onClick={async () => {
              setBusy(true);
              await addKnowledgeDocPaste(campaignId, title, text);
              setTitle("");
              setText("");
              setBusy(false);
              router.refresh();
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
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div>
      {canManage && (
        <Panel className="mb-4">
          <textarea className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mb-2" placeholder="Add a note" value={body} onChange={(e) => setBody(e.target.value)} />
          <Btn
            variant="primary"
            size="sm"
            disabled={!body || busy}
            onClick={async () => {
              setBusy(true);
              await addCampaignNote(campaignId, body);
              setBody("");
              setBusy(false);
              router.refresh();
            }}
          >
            Add note
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
