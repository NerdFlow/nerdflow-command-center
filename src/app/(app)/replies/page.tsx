import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel, Chip } from "@/components/ui";

export default async function RepliesPage() {
  const user = await requireUser();
  const openReplies = await prisma.reply.findMany({
    where: { status: "open", lead: { ownerId: user.id, organizationId: user.organizationId } },
    include: { lead: true },
    orderBy: { receivedAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Replies</h1>
      <p className="text-muted mb-6">Every lead who replied, until you act on it.</p>

      <Panel className="mb-6">
        <p className="text-sm text-muted">
          <b className="text-ink">Not fully built yet.</b> The full version (AI reply classification, drafted responses,
          and the &quot;Did they reply?&quot; nudge for sends that haven&apos;t gotten a response) is Phase 3 work. Right now this
          just lists replies that have been logged — nothing classifies or drafts for you yet.
        </p>
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Waiting on you ({openReplies.length})</h2>
        {openReplies.length === 0 ? (
          <p className="text-sm text-muted">Nobody&apos;s waiting on you.</p>
        ) : (
          <ul className="list-none m-0 p-0 divide-y divide-rule">
            {openReplies.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm">{r.lead.businessName}</span>
                  <Chip>{r.channel}</Chip>
                </div>
                <p className="text-sm text-muted m-0 whitespace-pre-wrap">{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
