import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel, Chip } from "@/components/ui";
import type { ObjectionResponseStatus, Channel } from "@prisma/client";

const STATUS_TONE: Record<ObjectionResponseStatus, "go" | "acc" | "default" | "stop"> = {
  proven: "go",
  testing: "acc",
  new: "default",
  retired: "stop",
};
const CHANNEL_LABEL: Record<Channel, string> = { call: "Call", email: "Email", instagram: "Instagram", linkedin: "LinkedIn" };

export default async function WhatsWorkingPage() {
  const user = await requireUser();
  const isRep = user.role === "rep";

  const [objections, touches] = await Promise.all([
    prisma.objectionResponse.findMany({
      where: { organizationId: user.organizationId, uses: { gt: 0 } },
      include: { campaign: { select: { name: true } } },
      orderBy: { uses: "desc" },
    }),
    prisma.touch.groupBy({
      by: ["channel", "outcome"],
      where: { organizationId: user.organizationId, ...(isRep ? { userId: user.id } : {}) },
      _count: true,
    }),
  ]);

  const channelStats = (["call", "email", "instagram", "linkedin"] as Channel[]).map((channel) => {
    const rows = touches.filter((t) => t.channel === channel);
    const sent = rows.filter((r) => r.outcome === "sent" || r.outcome === "no_answer" || r.outcome === "talked_not_now").reduce((s, r) => s + r._count, 0);
    const replied = rows.filter((r) => r.outcome === "replied" || r.outcome === "interested" || r.outcome === "meeting_booked").reduce((s, r) => s + r._count, 0);
    const total = rows.reduce((s, r) => s + r._count, 0);
    return { channel, total, replied, replyRate: total > 0 ? Math.round((replied / total) * 100) : 0 };
  }).filter((c) => c.total > 0);

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">What&apos;s Working</h1>
      <p className="text-muted mb-6">
        Objection track records and channel performance from real logged touches — no AI summary yet, just the numbers.
      </p>

      <Panel className="mb-6">
        <h2 className="text-[17px] font-medium mb-3">Channel performance{isRep ? " (yours)" : " (whole team)"}</h2>
        {channelStats.length === 0 ? (
          <p className="text-sm text-muted">No touches logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="text-left font-medium py-1">Channel</th>
                <th className="text-left font-medium py-1">Touches</th>
                <th className="text-left font-medium py-1">Replied/Interested</th>
                <th className="text-left font-medium py-1">Rate</th>
              </tr>
            </thead>
            <tbody>
              {channelStats.map((c) => (
                <tr key={c.channel} className="border-t border-rule">
                  <td className="py-1.5">{CHANNEL_LABEL[c.channel]}</td>
                  <td className="py-1.5">{c.total}</td>
                  <td className="py-1.5">{c.replied}</td>
                  <td className="py-1.5">{c.replyRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel>
        <h2 className="text-[17px] font-medium mb-3">Objection track record</h2>
        {objections.length === 0 ? (
          <p className="text-sm text-muted">No objection responses used yet — feedback from Focus mode&apos;s &quot;If they push back&quot; panel shows up here.</p>
        ) : (
          <div className="space-y-3">
            {objections.map((o) => {
              const rate = o.uses > 0 ? Math.round((o.keptTalkingCount / o.uses) * 100) : 0;
              return (
                <div key={o.id} className="border-b border-rule pb-3 last:border-0">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-sm font-medium m-0">{o.objection}</p>
                      <p className="text-xs text-muted m-0">{o.campaign.name}</p>
                    </div>
                    <Chip tone={STATUS_TONE[o.status]}>{o.status}</Chip>
                  </div>
                  <p className="text-sm text-muted mt-1 mb-0">{o.responseText}</p>
                  <p className="text-xs text-muted mt-1">
                    Used {o.uses}x · kept talking {rate}% ({o.keptTalkingCount}/{o.uses})
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
