import Link from "next/link";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel } from "@/components/ui";
import { BulkImportWizard } from "@/components/BulkImportWizard";
import { campaignStrategySchema } from "@/server/strategy";

export default async function LeadGenerationPage() {
  const user = await requireUser();
  const [runs, campaigns, reps] = await Promise.all([
    prisma.leadSourceRun.findMany({
      where: { organizationId: user.organizationId },
      include: { campaign: true },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    prisma.campaign.findMany({
      where: { organizationId: user.organizationId, status: { in: ["active", "draft"] } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, status: { not: "deactivated" }, role: "rep" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Lead Generation</h1>
      <p className="text-muted mb-6">Import a list to start working today, or run AI discovery per campaign.</p>

      <BulkImportWizard
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, hasIcp: campaignStrategySchema.safeParse(c.strategy).success }))}
        reps={reps}
      />

      <Panel className="mb-6 mt-6">
        <p className="text-sm text-muted">
          For AI-discovered leads (not a list you already have), open a campaign&apos;s <b className="text-ink">ICP and lead
          gen</b> tab and hit <b className="text-ink">Run now</b> — it searches Google, visits each website, scores fit
          against the campaign&apos;s ICP, dedupes, and lands new ones in the Lead Inbox.{" "}
          <Link href="/campaigns" className="text-accent underline">Go to Campaigns</Link>
        </p>
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Run history</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No runs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium py-1">Campaign</th>
                <th className="text-left font-medium py-1">Source</th>
                <th className="text-left font-medium py-1">Found</th>
                <th className="text-left font-medium py-1">New</th>
                <th className="text-left font-medium py-1">Cost</th>
                <th className="text-left font-medium py-1">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-rule">
                  <td className="py-1.5">{r.campaign.name}</td>
                  <td className="py-1.5">{r.source === "csv" && r.narration?.startsWith("Import:") ? r.narration : r.source}</td>
                  <td className="py-1.5">{r.found}</td>
                  <td className="py-1.5">{r.new}</td>
                  <td className="py-1.5">{Number(r.costUsd) > 0 ? `$${Number(r.costUsd).toFixed(3)}` : "—"}</td>
                  <td className="py-1.5 text-muted">{r.startedAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
