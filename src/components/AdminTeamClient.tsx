"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Chip, Panel } from "@/components/ui";
import { inviteUser, changeUserRole, setUserStatus, forceSignOut, setTarget } from "@/server/actions/admin";
import { METRIC_LABEL } from "@/server/targets";
import type { Role, TargetMetric, UserStatus } from "@prisma/client";

const ROLES: Role[] = ["rep", "manager", "admin"];
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

export function AdminTeamClient({ users }: { users: TeamUser[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", fullName: "", role: "rep" as Role });
  const [busy, setBusy] = useState(false);

  function refresh() {
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[17px] font-medium m-0">Users</h2>
        <Btn variant="primary" size="sm" onClick={() => setInviteOpen((o) => !o)}>
          {inviteOpen ? "Cancel" : "Invite user"}
        </Btn>
      </div>

      {inviteOpen && (
        <Panel className="mb-4">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <input
              className="border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm"
              placeholder="Full name"
              value={invite.fullName}
              onChange={(e) => setInvite((i) => ({ ...i, fullName: e.target.value }))}
            />
            <input
              className="border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm"
              placeholder="Email"
              value={invite.email}
              onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
            />
            <select
              className="border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm"
              value={invite.role}
              onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value as Role }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Btn
            size="sm"
            variant="primary"
            disabled={!invite.email || !invite.fullName || busy}
            onClick={async () => {
              setBusy(true);
              await inviteUser(invite);
              setInvite({ email: "", fullName: "", role: "rep" });
              setInviteOpen(false);
              setBusy(false);
              refresh();
            }}
          >
            Send invite
          </Btn>
        </Panel>
      )}

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
                      onChange={async (e) => {
                        await changeUserRole(u.id, e.target.value as Role);
                        refresh();
                      }}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <Chip tone={u.status === "active" ? "go" : u.status === "invited" ? "acc" : "stop"}>{u.status}</Chip>
                  </td>
                  <td className="py-2 text-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-accent"
                        onClick={async () => {
                          await forceSignOut(u.id);
                          refresh();
                        }}
                      >
                        Force sign-out
                      </button>
                      <button
                        className="text-xs text-stop"
                        onClick={async () => {
                          await setUserStatus(u.id, u.status === "deactivated" ? "active" : "deactivated");
                          refresh();
                        }}
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
      <Btn
        size="sm"
        variant="primary"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          for (const m of METRICS) {
            const val = Number(values[m]);
            if (val > 0 && val !== latestByMetric.get(m)) {
              await setTarget(userId, m, val);
            }
          }
          setSaving(false);
          onSaved();
        }}
      >
        {saving ? "Saving…" : "Save targets"}
      </Btn>
      {targets.length > 0 && (
        <div className="mt-3 text-xs text-muted">
          History: {targets.slice(0, 8).map((t) => `${METRIC_LABEL[t.metric]} ${t.dailyValue} (from ${new Date(t.effectiveFrom).toLocaleDateString()})`).join(" · ")}
        </div>
      )}
    </div>
  );
}
