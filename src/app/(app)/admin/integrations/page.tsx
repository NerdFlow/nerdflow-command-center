import { requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel, Chip } from "@/components/ui";
import type { IntegrationProvider } from "@prisma/client";

const PLANNED: { provider: IntegrationProvider; label: string }[] = [
  { provider: "google", label: "Google sign-in" },
  { provider: "gmail", label: "Gmail read-only sync (Phase 4)" },
  { provider: "calling_app", label: "Calling app (Phase 4)" },
  { provider: "slack", label: "Slack notifications (Phase 5)" },
  { provider: "openclaw", label: "OpenClaw lead ingest (Phase 4)" },
];

export default async function AdminIntegrationsPage() {
  const user = await requireRole(["admin"]);
  const integrations = await prisma.integration.findMany({ where: { organizationId: user.organizationId } });
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <Panel>
      <h2 className="text-[17px] font-medium mb-3">Integration status</h2>
      <div className="space-y-2">
        {PLANNED.map((p) => {
          const record = byProvider.get(p.provider);
          const connected = p.provider === "google" ? googleConfigured : Boolean(record && record.status === "connected");
          return (
            <div key={p.provider} className="flex justify-between items-center border-b border-rule py-2 text-sm">
              <span>{p.label}</span>
              <Chip tone={connected ? "go" : "default"}>{connected ? "Connected" : "Not connected"}</Chip>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
