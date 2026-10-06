"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Panel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  KB_KIND_LABEL,
  KB_LAYERS,
  KB_LAYER_LABEL,
  KB_SCOPES,
  KB_SIMPLE_STATUSES,
  KB_STATUS_LABEL,
  kbKindLabel,
  knowledgePayloadOnSave,
  type KbLayerName,
  type KbScopeName,
  type KbStatusName,
} from "@/lib/outreachKb";
import { archiveOutreachKbEntry, createOutreachKbEntry, updateOutreachKbEntry } from "@/server/actions/outreachKb";

export type KnowledgeEditorRow = {
  id?: string;
  key: string;
  layer: KbLayerName;
  kind: string;
  icp: string | null;
  scope: KbScopeName;
  status: KbStatusName;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  locked: boolean;
  sourcePath: string | null;
  updatedLabel: string | null;
  updatedByName: string | null;
  version?: number;
};

const inputClass = "w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1";

const CLAIM_LABEL: Record<string, string> = {
  yes: "We can say this",
  roadmap: "Not yet. Don't say this",
  commercial: "The price and the offer",
};

export function KnowledgeEditor({ row, canEdit }: { row: KnowledgeEditorRow; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const creating = !row.id;
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  const [status, setStatus] = useState<KbStatusName>(creating ? "draft" : row.status);
  const [layer, setLayer] = useState<KbLayerName>(row.layer);
  const [kind, setKind] = useState(row.kind);
  const [scope, setScope] = useState<KbScopeName>(row.scope);
  const [icp, setIcp] = useState(row.icp ?? "");
  const [key, setKey] = useState(row.key);
  const [claim, setClaim] = useState(typeof row.payload.claim === "string" ? row.payload.claim : null);
  const [safeToQuote, setSafeToQuote] = useState(typeof row.payload.safeToQuote === "boolean" ? row.payload.safeToQuote : null);
  const [doNotQuote, setDoNotQuote] = useState(typeof row.payload.doNotQuote === "boolean" ? row.payload.doNotQuote : null);
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(row.payload, null, 2));
  const [advancedEdited, setAdvancedEdited] = useState(false);
  const [confirmLocked, setConfirmLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const statusChoices = status === "pending" ? (["draft", "pending", "approved", "retired"] as const) : KB_SIMPLE_STATUSES;

  useEffect(() => {
    if (advancedEdited) return;
    const next = knowledgePayloadOnSave(row.payload, { claim, safeToQuote, doNotQuote }, null);
    if (next.ok) setPayloadText(JSON.stringify(next.payload, null, 2));
  }, [advancedEdited, claim, doNotQuote, row.payload, safeToQuote]);

  const advancedPayload = advancedEdited ? knowledgePayloadOnSave(row.payload, {}, payloadText) : null;
  const needsLockConfirm = row.locked || (advancedPayload?.ok === true && advancedPayload.payload.locked === true);

  async function save() {
    if (advancedPayload && !advancedPayload.ok) {
      setError(advancedPayload.error);
      return;
    }
    if (!creating && row.version == null) {
      setError("Reload this row before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    const plain = {
      title,
      body,
      status: creating ? ("draft" as const) : status,
      layer,
      kind,
      scope,
      icp: scope === "icp" ? icp : null,
      confirmLocked,
      ...(typeof claim === "string" ? { claim } : {}),
      ...(typeof safeToQuote === "boolean" ? { safeToQuote } : {}),
      ...(typeof doNotQuote === "boolean" ? { doNotQuote } : {}),
      ...(advancedPayload?.ok ? { payload: advancedPayload.payload } : {}),
    };
    try {
      if (creating) {
        const saved = await createOutreachKbEntry({ ...plain, key: key.trim() || keyFromTitle(kind, title), status: "draft" });
        toast("Row added.");
        router.push(`/knowledge/${saved.id}`);
        router.refresh();
      } else {
        await updateOutreachKbEntry({ ...plain, id: row.id!, version: row.version! });
        toast("Saved.");
        setConfirmLocked(false);
        setAdvancedEdited(false);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that row.");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!row.id) return;
    setSaving(true);
    setError(null);
    try {
      await archiveOutreachKbEntry({ id: row.id, confirmLocked });
      toast("Archived. Outreach will not use it.");
      setStatus("retired");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't archive that row.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {needsLockConfirm && (
        <Panel className="border-warm/40 bg-warm-soft">
          <p className="text-sm font-medium m-0">Locked product truth</p>
          <p className="text-sm text-muted mt-1 mb-0">Cold emails use this wording. Tick the box before you save.</p>
        </Panel>
      )}

      <Panel className="space-y-4">
        <p className="text-sm m-0">
          {status === "approved" ? (
            <span className="text-go">Outreach can use this.</span>
          ) : (
            <span className="text-muted">Outreach will not use this until it is Approved.</span>
          )}
        </p>

        {creating && (
          <label className="block text-sm">
            Type
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KB_KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm">
          Title
          <input className={inputClass} value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block text-sm">
          Body
          <textarea className={`${inputClass} min-h-40`} value={body} disabled={!canEdit} onChange={(e) => setBody(e.target.value)} />
        </label>

        {creating ? (
          <p className="text-sm m-0">
            Status
            <span className="block mt-1 rounded-lg border border-rule bg-panel2 px-3 py-2 text-ink">Draft. Approve it after you save.</span>
          </p>
        ) : (
          <label className="block text-sm">
            Status
            <select className={inputClass} value={status} disabled={!canEdit} onChange={(e) => setStatus(e.target.value as KbStatusName)}>
              {statusChoices.map((item) => (
                <option key={item} value={item}>
                  {KB_STATUS_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
        )}

        {claim !== null && (
          <label className="block text-sm">
            What we can claim
            <select className={inputClass} value={claim} disabled={!canEdit} onChange={(e) => setClaim(e.target.value)}>
              {Object.entries(CLAIM_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {!CLAIM_LABEL[claim] && <option value={claim}>{claim}</option>}
            </select>
          </label>
        )}
        {safeToQuote !== null && (
          <label className="block text-sm">
            Safe to quote: yes/no
            <select
              className={inputClass}
              value={safeToQuote ? "yes" : "no"}
              disabled={!canEdit}
              onChange={(e) => setSafeToQuote(e.target.value === "yes")}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        )}
        {doNotQuote !== null && (
          <label className="block text-sm">
            Do not quote: yes/no
            <select
              className={inputClass}
              value={doNotQuote ? "yes" : "no"}
              disabled={!canEdit}
              onChange={(e) => setDoNotQuote(e.target.value === "yes")}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        )}

        <p className="text-sm text-muted m-0">
          {row.updatedByName ? `Last edited by ${row.updatedByName}` : "Not edited since import"}
          {row.updatedLabel ? ` · ${row.updatedLabel}` : ""}
        </p>

        {canEdit && needsLockConfirm && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={confirmLocked} onChange={(e) => setConfirmLocked(e.target.checked)} />
            <span>I mean to change this locked product truth. Cold copy will follow the new wording.</span>
          </label>
        )}

        {error && <p className="text-sm text-stop m-0">{error}</p>}

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" loading={saving} disabled={needsLockConfirm && !confirmLocked} onClick={() => void save()}>
              {creating ? "Add row" : "Save"}
            </Btn>
            {!creating && status !== "retired" && (
              <Btn variant="stop" loading={saving} disabled={needsLockConfirm && !confirmLocked} onClick={() => void archive()}>
                Archive
              </Btn>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted m-0">You can read this. Managers edit it.</p>
        )}
      </Panel>

      {canEdit && (
        <details className="border border-rule rounded-card bg-panel px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Advanced — Technical fields (used by the AI, rarely needs editing)</summary>
          <div className="space-y-3 mt-3">
            <label className="block text-sm">
              Key
              <input className={inputClass} value={key} disabled={!creating} onChange={(e) => setKey(e.target.value)} placeholder="Filled in from the title if you leave this blank" />
            </label>
            {!creating && (
              <label className="block text-sm">
                Type
                <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
                  {!KB_KIND_LABEL[kind] && <option value={kind}>{kbKindLabel(kind)}</option>}
                  {Object.entries(KB_KIND_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                Layer
                <select className={inputClass} value={layer} onChange={(e) => setLayer(e.target.value as KbLayerName)}>
                  {KB_LAYERS.map((item) => (
                    <option key={item} value={item}>
                      {KB_LAYER_LABEL[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Scope
                <select className={inputClass} value={scope} onChange={(e) => setScope(e.target.value as KbScopeName)}>
                  {KB_SCOPES.map((item) => (
                    <option key={item} value={item}>
                      {item === "universal" ? "Everyone" : "One type of buyer"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              Buyer type
              <input className={inputClass} value={icp} disabled={scope !== "icp"} placeholder={scope === "icp" ? "contractors" : "Used only for one type of buyer"} onChange={(e) => setIcp(e.target.value)} />
            </label>
            {row.sourcePath && <p className="text-sm text-muted m-0">Source: {row.sourcePath}</p>}
            <label className="block text-sm">
              Stored fields
              <textarea
                className={`${inputClass} min-h-36 font-mono text-xs`}
                value={payloadText}
                onChange={(e) => {
                  setPayloadText(e.target.value);
                  setAdvancedEdited(true);
                }}
              />
            </label>
          </div>
        </details>
      )}
    </div>
  );
}

function keyFromTitle(kind: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const prefix = kind.replace(/[^a-z0-9]+/g, "_") || "note";
  return `${prefix}:${slug || "note"}`.slice(0, 119);
}
