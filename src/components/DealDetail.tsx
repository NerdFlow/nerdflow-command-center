"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, Btn, Chip, Panel, Tabs } from "@/components/ui";
import { STAGE_CHECKLIST, STAGE_LABEL, STAGE_ORDER, type DealFlag } from "@/server/deals";
import { setChecklistItem, setNextStep, setStage, setDealValue, addDealPerson, togglePersonFlag } from "@/server/actions/deals";
import type { DealStage, LostReason } from "@prisma/client";

const LOST_REASONS: LostReason[] = ["price", "timing", "no_decision", "competitor", "not_fit", "went_silent", "other"];

type DealData = {
  id: string;
  businessName: string;
  productName: string;
  ownerName: string;
  stage: DealStage;
  checklist: Record<string, boolean>;
  nextStepText: string | null;
  nextStepAt: string | null;
  valueMonthlyUsd: number | null;
  signals: { intent?: string; urgency?: string; mood?: string; note?: string };
  nextBestAction: string | null;
  people: { id: string; name: string; role: string | null; isDecisionMaker: boolean; met: boolean }[];
};

type TimelineItem = {
  id: string;
  kind: "touch" | "conversation";
  title: string;
  occurredAt: string;
  body: string | null;
  review: { score: number; verdict: string; wentWell: string[]; missed: string[] } | null;
};

export function DealDetail({
  deal,
  health,
  flags,
  canEdit,
  timeline,
}: {
  deal: DealData;
  health: number;
  flags: DealFlag[];
  canEdit: boolean;
  timeline: TimelineItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState("timeline");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  const stageIdx = STAGE_ORDER.indexOf(deal.stage as (typeof STAGE_ORDER)[number]);
  const visibleStages =
    stageIdx === -1 ? [] : STAGE_ORDER.slice(0, stageIdx + 1);

  function refresh() {
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-0.5">{deal.businessName}</h1>
      <p className="text-muted mb-6">
        {deal.productName} · {deal.ownerName}
      </p>

      <div className="grid gap-4 md:[grid-template-columns:320px_1fr] items-start">
        <aside className="space-y-3">
          <Panel>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-2xl font-bold">{health}</span>
              <span className="text-xs text-muted">health</span>
            </div>
            <Bar pct={health} tone={health >= 70 ? "go" : "accent"} />
            {flags.map((f) => (
              <Chip key={f.key} tone="stop">
                {f.label}
              </Chip>
            ))}
          </Panel>

          {(deal.signals.intent || deal.signals.urgency || deal.signals.mood) && (
            <Panel>
              <h3 className="text-sm font-medium mb-2">Buying signals</h3>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <strong className="block text-xs text-muted">Intent</strong>
                  {deal.signals.intent ?? "Unclear"}
                </div>
                <div>
                  <strong className="block text-xs text-muted">Urgency</strong>
                  {deal.signals.urgency ?? "Unclear"}
                </div>
                <div>
                  <strong className="block text-xs text-muted">Mood</strong>
                  {deal.signals.mood ?? "Unclear"}
                </div>
              </div>
              {deal.signals.note && <p className="text-sm text-muted mt-2">{deal.signals.note}</p>}
            </Panel>
          )}

          {deal.nextBestAction && (
            <Panel>
              <h3 className="text-sm font-medium mb-1">Flow&apos;s call</h3>
              <p className="text-sm m-0">{deal.nextBestAction}</p>
            </Panel>
          )}

          <NextStepPanel deal={deal} canEdit={canEdit} onSaved={refresh} />

          <Panel>
            <h3 className="text-sm font-medium mb-2">What good looks like</h3>
            {checklistError && <p className="text-sm text-stop mb-2">{checklistError}</p>}
            {visibleStages.map((stage) => (
              <div key={stage} className="mb-3">
                <p className="text-xs text-muted font-semibold mb-1">{STAGE_LABEL[stage]}</p>
                {STAGE_CHECKLIST[stage].map((item) => (
                  <label key={item.key} className="flex gap-2 items-start text-sm mb-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 accent-accent"
                      checked={Boolean(deal.checklist[item.key])}
                      disabled={!canEdit || busyKey === item.key}
                      onChange={async (e) => {
                        setBusyKey(item.key);
                        try {
                          await setChecklistItem(deal.id, item.key, e.target.checked);
                          refresh();
                        } catch (err) {
                          setChecklistError(err instanceof Error ? err.message : "Couldn't save that.");
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            ))}
          </Panel>

          <PeoplePanel deal={deal} canEdit={canEdit} onSaved={refresh} />

          <ValuePanel deal={deal} canEdit={canEdit} onSaved={refresh} />

          <StagePanel deal={deal} canEdit={canEdit} onSaved={refresh} />
        </aside>

        <div>
          <Tabs
            tabs={[
              { key: "timeline", label: "Timeline" },
              { key: "debrief", label: "Debrief" },
              { key: "prepare", label: "Prepare" },
              { key: "draft", label: "Review a draft" },
              { key: "practice", label: "Practice" },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === "timeline" && (
            <div>
              {timeline.length === 0 && (
                <Panel>
                  <p className="text-muted">Nothing logged yet.</p>
                </Panel>
              )}
              {timeline.map((item) => (
                <div key={item.id} className="border-b border-rule py-3">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <Chip>{item.kind === "touch" ? "Touch" : "Conversation"}</Chip>
                    <span>{new Date(item.occurredAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm font-medium m-0">{item.title}</p>
                  {item.body && (
                    <details className="mt-1">
                      <summary className="text-sm text-accent cursor-pointer">Show text</summary>
                      <p className="text-sm whitespace-pre-wrap mt-1">{item.body}</p>
                    </details>
                  )}
                  {item.review && (
                    <div className="bg-panel2 rounded-lg px-3 py-2 mt-2 text-sm">
                      <p className="font-semibold">
                        Score {item.review.score}/10 — {item.review.verdict}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab !== "timeline" && (
            <Panel>
              <p className="text-muted">This lands in Phase 3 (deal coaching): reviews, prep playbooks, draft scoring and roleplay.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function NextStepPanel({ deal, canEdit, onSaved }: { deal: DealData; canEdit: boolean; onSaved: () => void }) {
  const [text, setText] = useState(deal.nextStepText ?? "");
  const [at, setAt] = useState(deal.nextStepAt ? deal.nextStepAt.slice(0, 16) : "");
  const [saving, setSaving] = useState(false);

  return (
    <Panel>
      <h3 className="text-sm font-medium mb-2">Next step</h3>
      <input
        className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mb-2 text-sm"
        placeholder="What's next"
        value={text}
        disabled={!canEdit}
        onChange={(e) => setText(e.target.value)}
      />
      <input
        type="datetime-local"
        className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mb-2 text-sm"
        value={at}
        disabled={!canEdit}
        onChange={(e) => setAt(e.target.value)}
      />
      {canEdit && (
        <Btn
          size="sm"
          variant="primary"
          disabled={!text || !at || saving}
          onClick={async () => {
            setSaving(true);
            await setNextStep(deal.id, text, new Date(at).toISOString());
            setSaving(false);
            onSaved();
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Btn>
      )}
    </Panel>
  );
}

function PeoplePanel({ deal, canEdit, onSaved }: { deal: DealData; canEdit: boolean; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [adding, setAdding] = useState(false);

  return (
    <Panel>
      <h3 className="text-sm font-medium mb-2">People</h3>
      {deal.people.map((p) => (
        <div key={p.id} className="text-sm mb-2 border-b border-rule pb-2 last:border-0">
          <div className="font-medium">
            {p.name} {p.role && <span className="text-muted font-normal">— {p.role}</span>}
          </div>
          <div className="flex gap-3 mt-1">
            <label className="flex gap-1.5 items-center text-xs">
              <input
                type="checkbox"
                className="accent-accent"
                checked={p.isDecisionMaker}
                disabled={!canEdit}
                onChange={async (e) => {
                  await togglePersonFlag(deal.id, p.id, "isDecisionMaker", e.target.checked);
                  onSaved();
                }}
              />
              Decision-maker
            </label>
            <label className="flex gap-1.5 items-center text-xs">
              <input
                type="checkbox"
                className="accent-accent"
                checked={p.met}
                disabled={!canEdit}
                onChange={async (e) => {
                  await togglePersonFlag(deal.id, p.id, "met", e.target.checked);
                  onSaved();
                }}
              />
              Met
            </label>
          </div>
        </div>
      ))}
      {canEdit && (
        <div className="flex gap-1.5 mt-2">
          <input className="flex-1 border border-rule rounded-lg px-2 py-1.5 bg-bg text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="flex-1 border border-rule rounded-lg px-2 py-1.5 bg-bg text-sm" placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
          <Btn
            size="sm"
            disabled={!name || adding}
            onClick={async () => {
              setAdding(true);
              await addDealPerson(deal.id, { name, role: role || undefined });
              setName("");
              setRole("");
              setAdding(false);
              onSaved();
            }}
          >
            Add
          </Btn>
        </div>
      )}
    </Panel>
  );
}

function ValuePanel({ deal, canEdit, onSaved }: { deal: DealData; canEdit: boolean; onSaved: () => void }) {
  const [value, setValue] = useState(deal.valueMonthlyUsd?.toString() ?? "");
  return (
    <Panel>
      <h3 className="text-sm font-medium mb-2">Value (monthly USD)</h3>
      <div className="flex gap-2">
        <input
          type="number"
          className="flex-1 border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm"
          value={value}
          disabled={!canEdit}
          onChange={(e) => setValue(e.target.value)}
        />
        {canEdit && (
          <Btn
            size="sm"
            onClick={async () => {
              await setDealValue(deal.id, value ? Number(value) : null);
              onSaved();
            }}
          >
            Save
          </Btn>
        )}
      </div>
    </Panel>
  );
}

function StagePanel({ deal, canEdit, onSaved }: { deal: DealData; canEdit: boolean; onSaved: () => void }) {
  const [stage, setStageValue] = useState<DealStage>(deal.stage);
  const [lostReason, setLostReason] = useState<LostReason>("price");
  const [saving, setSaving] = useState(false);

  return (
    <Panel>
      <h3 className="text-sm font-medium mb-2">Stage</h3>
      <select
        className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mb-2 text-sm"
        value={stage}
        disabled={!canEdit}
        onChange={(e) => setStageValue(e.target.value as DealStage)}
      >
        {[...STAGE_ORDER, "won", "lost"].map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s as DealStage]}
          </option>
        ))}
      </select>
      {stage === "lost" && (
        <select className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg mb-2 text-sm" value={lostReason} onChange={(e) => setLostReason(e.target.value as LostReason)}>
          {LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
      )}
      {canEdit && stage !== deal.stage && (
        <Btn
          size="sm"
          variant="primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await setStage(deal.id, stage, stage === "lost" ? lostReason : undefined);
            setSaving(false);
            onSaved();
          }}
        >
          {saving ? "Saving…" : "Update stage"}
        </Btn>
      )}
    </Panel>
  );
}
