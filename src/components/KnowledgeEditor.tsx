"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Panel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { KB_LAYERS, KB_LAYER_LABEL, KB_SCOPES, KB_STATUSES, KB_STATUS_LABEL, type KbLayerName, type KbScopeName, type KbStatusName } from "@/lib/outreachKb";
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
};

const inputClass = "w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1";

export function KnowledgeEditor({ row, canEdit }: { row: KnowledgeEditorRow; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const creating = !row.id;
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  const [status, setStatus] = useState<KbStatusName>(row.status);
  const [layer, setLayer] = useState<KbLayerName>(row.layer);
  const [kind, setKind] = useState(row.kind);
  const [scope, setScope] = useState<KbScopeName>(row.scope);
  const [icp, setIcp] = useState(row.icp ?? "");
  const [key, setKey] = useState(row.key);
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(row.payload, null, 2));
  const [confirmLocked, setConfirmLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parsePayload(payloadText), [payloadText]);
  const locked = row.locked || (parsed.ok && parsed.value.locked === true);
  const tasks = parsed.ok && Array.isArray(parsed.value.tasks) ? parsed.value.tasks.filter((item): item is string => typeof item === "string").join(", ") : null;
  const sources = parsed.ok && Array.isArray(parsed.value.sources) ? parsed.value.sources.filter((item): item is string => typeof item === "string").join(", ") : null;
  const claim = parsed.ok && typeof parsed.value.claim === "string" ? parsed.value.claim : null;
  const safeToQuote = parsed.ok && typeof parsed.value.safeToQuote === "boolean" ? parsed.value.safeToQuote : null;
  const doNotQuote = parsed.ok && typeof parsed.value.doNotQuote === "boolean" ? parsed.value.doNotQuote : null;

  function patchPayload(patch: Record<string, unknown>) {
    if (!parsed.ok) return;
    setPayloadText(JSON.stringify({ ...parsed.value, ...patch }, null, 2));
  }

  async function save() {
    if (!parsed.ok) {
      setError("Payload is not valid JSON.");
      return;
    }
    setSaving(true);
    setError(null);
    const common = {
      title,
      body,
      payload: parsed.value,
      status,
      layer,
      kind,
      scope,
      icp: scope === "icp" ? icp : null,
      confirmLocked,
    };
    try {
      if (creating) {
        const saved = await createOutreachKbEntry({ ...common, key, status: "draft" });
        toast("Row added.");
        router.push(`/knowledge/${saved.id}`);
        router.refresh();
      } else {
        await updateOutreachKbEntry({ ...common, id: row.id! });
        toast("Saved.");
        setConfirmLocked(false);
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
      toast("Archived. Generate will ignore it.");
      setStatus("retired");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't archive that row.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {locked && (
        <Panel className="border-warm/40 bg-warm-soft">
          <p className="text-sm font-medium m-0">Locked Product Truth</p>
          <p className="text-sm text-muted mt-1 mb-0">Cold copy depends on this row. Saving needs an explicit confirm.</p>
        </Panel>
      )}

      <Panel className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusPill status={status} />
          {status === "approved" ? (
            <span className="text-go">Generate can use this row.</span>
          ) : (
            <span className="text-muted">Generate ignores this row until it is Approved.</span>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Key
            {creating ? (
              <input className={inputClass} value={key} disabled={!canEdit} onChange={(e) => setKey(e.target.value)} />
            ) : (
              <input className={inputClass} value={row.key} disabled />
            )}
          </label>
          <label className="text-sm">
            Kind
            <input className={inputClass} value={kind} disabled={!canEdit} onChange={(e) => setKind(e.target.value)} />
          </label>
          <label className="text-sm">
            Layer
            <select className={inputClass} value={layer} disabled={!canEdit} onChange={(e) => setLayer(e.target.value as KbLayerName)}>
              {KB_LAYERS.map((item) => (
                <option key={item} value={item}>
                  {KB_LAYER_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          {creating ? (
            <p className="text-sm m-0">
              Status
              <span className="block mt-1 rounded-lg border border-rule bg-panel2 px-3 py-2 text-ink">Draft. Approve it after you save.</span>
            </p>
          ) : (
            <label className="text-sm">
              Status
              <select className={inputClass} value={status} disabled={!canEdit} onChange={(e) => setStatus(e.target.value as KbStatusName)}>
                {KB_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {KB_STATUS_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            Scope
            <select className={inputClass} value={scope} disabled={!canEdit} onChange={(e) => setScope(e.target.value as KbScopeName)}>
              {KB_SCOPES.map((item) => (
                <option key={item} value={item}>
                  {item === "universal" ? "Universal" : "One ICP"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            ICP
            <input className={inputClass} value={icp} disabled={!canEdit || scope !== "icp"} placeholder={scope === "icp" ? "contractors" : "Universal rows have no ICP"} onChange={(e) => setIcp(e.target.value)} />
          </label>
        </div>

        <label className="block text-sm">
          Title
          <input className={inputClass} value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block text-sm">
          Body
          <textarea className={`${inputClass} min-h-40`} value={body} disabled={!canEdit} onChange={(e) => setBody(e.target.value)} />
        </label>

        {parsed.ok && (claim !== null || tasks !== null || sources !== null || safeToQuote !== null || doNotQuote !== null) && (
          <div className="grid sm:grid-cols-2 gap-3">
            {claim !== null && (
              <label className="text-sm">
                Claim
                <select className={inputClass} value={claim} disabled={!canEdit} onChange={(e) => patchPayload({ claim: e.target.value })}>
                  <option value="yes">Yes, we can say this</option>
                  <option value="roadmap">Roadmap, never claim</option>
                  <option value="commercial">Commercial</option>
                </select>
              </label>
            )}
            {tasks !== null && (
              <label className="text-sm">
                Tasks
                <input className={inputClass} value={tasks} disabled={!canEdit} onChange={(e) => patchPayload({ tasks: splitList(e.target.value) })} />
              </label>
            )}
            {sources !== null && (
              <label className="text-sm sm:col-span-2">
                Sources
                <input className={inputClass} value={sources} disabled={!canEdit} onChange={(e) => patchPayload({ sources: splitList(e.target.value) })} />
              </label>
            )}
            {safeToQuote !== null && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={safeToQuote} disabled={!canEdit} onChange={(e) => patchPayload({ safeToQuote: e.target.checked })} />
                Safe to quote
              </label>
            )}
            {doNotQuote !== null && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={doNotQuote} disabled={!canEdit} onChange={(e) => patchPayload({ doNotQuote: e.target.checked })} />
                Do not quote
              </label>
            )}
          </div>
        )}

        <label className="block text-sm">
          Payload JSON
          <textarea className={`${inputClass} min-h-36 font-mono text-xs`} value={payloadText} disabled={!canEdit} onChange={(e) => setPayloadText(e.target.value)} />
        </label>
        {!parsed.ok && <p className="text-sm text-stop m-0">{parsed.error}</p>}

        <p className="text-sm text-muted m-0">
          {row.updatedByName ? `Last edited by ${row.updatedByName}` : "Not edited since import"}
          {row.updatedLabel ? ` · ${row.updatedLabel} Asia/Karachi` : ""}
          {row.sourcePath ? ` · ${row.sourcePath}` : ""}
        </p>

        {canEdit && locked && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={confirmLocked} onChange={(e) => setConfirmLocked(e.target.checked)} />
            <span>I mean to change this locked Product Truth. Cold copy will follow the new wording.</span>
          </label>
        )}

        {error && <p className="text-sm text-stop m-0">{error}</p>}

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Btn variant="primary" loading={saving} disabled={locked && !confirmLocked} onClick={() => void save()}>
              {creating ? "Add row" : "Save"}
            </Btn>
            {!creating && status !== "retired" && (
              <Btn variant="stop" loading={saving} disabled={locked && !confirmLocked} onClick={() => void archive()}>
                Archive
              </Btn>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted m-0">You can read this. Managers edit it.</p>
        )}
      </Panel>
    </div>
  );
}

function StatusPill({ status }: { status: KbStatusName }) {
  const tone = status === "approved" ? "bg-go-soft text-go" : status === "retired" ? "bg-stop-soft text-stop" : status === "pending" ? "bg-warm-soft text-warm" : "bg-panel2 text-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 font-medium ${tone}`}>{KB_STATUS_LABEL[status]}</span>;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePayload(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Payload must be a JSON object." };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Payload is not valid JSON." };
  }
}
