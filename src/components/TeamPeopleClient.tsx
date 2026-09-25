"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Chip, Panel } from "@/components/ui";
import { addPerson, changeUserRole, setUserStatus, setTarget } from "@/server/actions/admin";
import { METRIC_LABEL } from "@/server/targets";
import type { Role, TargetMetric, UserStatus } from "@prisma/client";

const ROLES: Role[] = ["rep", "lead"];
const METRICS: TargetMetric[] = ["leads_verified", "emails", "calls", "instagram_dms", "linkedin_messages"];

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  targets: { id: string; metric: TargetMetric; dailyValue: number; effectiveFrom: string }[];
};

export function TeamPeopleClient({ users }: { users: TeamUser[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ email: "", fullName: "", role: "rep" as Role });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function runRow(id: string, fn: () => Promise<unknown>) {
    setRowBusyId(id);
    setRowError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRowBusyId(null);
    }
  }

  function refresh() {
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[17px] font-medium m-0">People</h2>
        <Btn variant="primary" size="sm" onClick={() => setAddOpen((o) => !o)}>
          {addOpen ? "Cancel" : "Add person"}
        </Btn>
      </div>

      {addOpen && (
        <Panel className="mb-4">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <input
              className="border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm"
              placeholder="Full name"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
            <input
              className="border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <select
              className="border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-stop mb-2">{error}</p>}
          <Btn
            size="sm"
            variant="primary"
            disabled={!form.email || !form.fullName || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const { tempPassword: pw } = await addPerson(form);
                setTempPassword({ email: form.email, password: pw });
                setForm({ email: "", fullName: "", role: "rep" });
                setAddOpen(false);
                refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't add that person.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Add person
          </Btn>
        </Panel>
      )}

      {tempPassword && (
        <Panel className="mb-4 bg-accent-soft">
          <p className="text-sm">
            Account created for <b>{tempPassword.email}</b>. Temporary password (shown once):
          </p>
          <p className="font-mono text-sm mt-1 mb-2">{tempPassword.password}</p>
          <button className="text-xs text-muted hover:text-ink" onClick={() => setTempPassword(null)}>
            Dismiss
          </button>
        </Panel>
      )}

      {rowError && <p className="text-sm text-stop mb-2">{rowError}</p>}

      <Panel>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted">
              <th className="text-left font-medium py-1.5">Name</th>
              <th className="text-left font-medium py-1.5">Role</th>
              <th className="text-left font-medium py-1.5">Status</th>
              <th className="text-left font-medium py-1.5">Last login</th>
              <th className="text-left font-medium py-1.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Fragment key={u.id}>
                <tr className="border-t border-rule">
                  <td className="py-2">
                    <button className="font-medium hover:text-accent" onClick={() => setExpanded(expanded === u.id ? null : u.id)}>
                      {u.fullName}
                    </button>
                    <div className="text-xs text-muted">{u.email}</div>
                  </td>
                  <td className="py-2">
                    <select
                      className="border border-rule rounded px-1.5 py-1 bg-panel text-xs"
                      value={u.role}
                      disabled={rowBusyId === u.id}
                      onChange={(e) => runRow(u.id, () => changeUserRole(u.id, e.target.value as Role))}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <Chip tone={u.status === "active" ? "go" : u.status === "invited" ? "acc" : "stop"}>
                      {rowBusyId === u.id ? "saving…" : u.status}
                    </Chip>
                  </td>
                  <td className="py-2 text-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-US") : "Never"}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-stop disabled:opacity-40"
                        disabled={rowBusyId === u.id}
                        onClick={() => runRow(u.id, () => setUserStatus(u.id, u.status === "deactivated" ? "active" : "deactivated"))}
                      >
                        {u.status === "deactivated" ? "Reactivate" : "Deactivate"}
                      </button>
                      <button className="text-xs text-muted" onClick={() => setExpanded(expanded === u.id ? null : u.id)}>
                        Targets
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded === u.id && (
                  <tr className="border-t border-rule bg-panel2">
                    <td colSpan={5} className="py-3 px-2">
                      <TargetEditor userId={u.id} targets={u.targets} onSaved={refresh} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function TargetEditor({
  userId,
  targets,
  onSaved,
}: {
  userId: string;
  targets: { id: string; metric: TargetMetric; dailyValue: number; effectiveFrom: string }[];
  onSaved: () => void;
}) {
  const latestByMetric = new Map<TargetMetric, number>();
  for (const t of targets) if (!latestByMetric.has(t.metric)) latestByMetric.set(t.metric, t.dailyValue);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(METRICS.map((m) => [m, (latestByMetric.get(m) ?? "").toString()])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div className="grid grid-cols-5 gap-3 mb-3">
        {METRICS.map((m) => (
          <label key={m} className="text-xs">
            {METRIC_LABEL[m]}
            <input
              type="number"
              className="w-full border border-rule rounded px-2 py-1 bg-bg mt-1 text-sm"
              value={values[m]}
              onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-stop mb-2">{error}</p>}
      <Btn
        size="sm"
        variant="primary"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            for (const m of METRICS) {
              const val = Number(values[m]);
              if (val > 0 && val !== latestByMetric.get(m)) {
                await setTarget(userId, m, val);
              }
            }
            onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't save targets.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving…" : "Save targets"}
      </Btn>
    </div>
  );
}
