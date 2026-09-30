import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel, Chip } from "@/components/ui";
import { getCallScripts, type CampaignStrategy } from "@/server/strategy";
import type { ObjectionResponseStatus, Channel } from "@prisma/client";

const STATUS_TONE: Record<ObjectionResponseStatus, "go" | "acc" | "default" | "stop"> = {
  proven: "go",
  testing: "acc",
  new: "default",
  retired: "stop",
};
const CHANNEL_LABEL: Record<Channel, string> = { call: "Call", email: "Email", instagram: "Instagram", linkedin: "LinkedIn" };

type ScriptBucket = {
  used: number;
  up: number;
  down: number;
  notes: { text: string; at: Date; businessName: string }[];
};

function emptyBucket(): ScriptBucket {
  return { used: 0, up: 0, down: 0, notes: [] };
}

export default async function WhatsWorkingPage() {
  const user = await requireUser();
  const isRep = user.role === "rep";
  const touchScope = {
    organizationId: user.organizationId,
    ...(isRep ? { userId: user.id } : {}),
  };

  const [objections, touches, scriptTouches, campaigns] = await Promise.all([
    prisma.objectionResponse.findMany({
      where: { organizationId: user.organizationId, uses: { gt: 0 } },
      include: { campaign: { select: { name: true } } },
      orderBy: { uses: "desc" },
    }),
    prisma.touch.groupBy({
      by: ["channel", "outcome"],
      where: touchScope,
      _count: true,
    }),
    prisma.touch.findMany({
      where: {
        ...touchScope,
        channel: "call",
        scriptUsed: { in: ["a", "b"] },
      },
      select: {
        scriptUsed: true,
        scriptRating: true,
        callerNote: true,
        occurredAt: true,
        lead: {
          select: {
            businessName: true,
            campaignId: true,
            campaign: { select: { id: true, name: true, strategy: true } },
          },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 300,
    }),
    prisma.campaign.findMany({
      where: { organizationId: user.organizationId, status: { not: "archived" } },
      select: { id: true, name: true, strategy: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const channelStats = (["call", "email", "instagram", "linkedin"] as Channel[])
    .map((channel) => {
      const rows = touches.filter((t) => t.channel === channel);
      const replied = rows
        .filter((r) => r.outcome === "replied" || r.outcome === "interested" || r.outcome === "meeting_booked")
        .reduce((s, r) => s + r._count, 0);
      const total = rows.reduce((s, r) => s + r._count, 0);
      return { channel, total, replied, replyRate: total > 0 ? Math.round((replied / total) * 100) : 0 };
    })
    .filter((c) => c.total > 0);

  type CampaignScriptStats = {
    campaignId: string;
    campaignName: string;
    scriptAText: string;
    scriptBText: string;
    a: ScriptBucket;
    b: ScriptBucket;
  };

  const byCampaign = new Map<string, CampaignScriptStats>();

  function ensureCampaign(id: string, name: string, strategy: unknown): CampaignScriptStats {
    let row = byCampaign.get(id);
    if (!row) {
      const [a, b] = getCallScripts(strategy as CampaignStrategy);
      row = { campaignId: id, campaignName: name, scriptAText: a, scriptBText: b, a: emptyBucket(), b: emptyBucket() };
      byCampaign.set(id, row);
    }
    return row;
  }

  // Prefer live campaign names/scripts from the campaign list, even before any feedback.
  for (const c of campaigns) {
    const scripts = getCallScripts(c.strategy as CampaignStrategy);
    if (scripts[0].trim() || scripts[1].trim()) {
      ensureCampaign(c.id, c.name, c.strategy);
    }
  }

  for (const t of scriptTouches) {
    const row = ensureCampaign(t.lead.campaignId, t.lead.campaign.name, t.lead.campaign.strategy);
    const bucket = t.scriptUsed === "b" ? row.b : row.a;
    bucket.used += 1;
    if (t.scriptRating === "up") bucket.up += 1;
    if (t.scriptRating === "down") bucket.down += 1;
    if (t.callerNote?.trim() && bucket.notes.length < 8) {
      bucket.notes.push({ text: t.callerNote.trim(), at: t.occurredAt, businessName: t.lead.businessName });
    }
  }

  const scriptStats = Array.from(byCampaign.values()).filter((c) => c.a.used + c.b.used > 0 || c.scriptAText || c.scriptBText);

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">What&apos;s Working</h1>
      <p className="text-muted mb-6">
        Raw counts from Focus — script thumbs and what callers said. No AI summary yet; after a week or two of real
        calls, this is the list that decides what to build next.
      </p>

      <Panel className="mb-6">
        <h2 className="text-[17px] font-medium mb-3">Call scripts{isRep ? " (yours)" : ""}</h2>
        {scriptStats.length === 0 ? (
          <p className="text-sm text-muted m-0">
            No script feedback yet. Add Script A and B on a campaign&apos;s Playbook tab, then pick one in Focus and
            thumbs up or down when you log the call.
          </p>
        ) : (
          <div className="space-y-6">
            {scriptStats.map((c) => (
              <div key={c.campaignId} className="border-b border-rule pb-5 last:border-0 last:pb-0">
                <p className="text-sm font-medium m-0 mb-3">{c.campaignName}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {(
                    [
                      { key: "A", text: c.scriptAText, bucket: c.a },
                      { key: "B", text: c.scriptBText, bucket: c.b },
                    ] as const
                  ).map(({ key, text, bucket }) => (
                    <div key={key} className="rounded-xl border border-rule bg-panel2 p-3.5">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <p className="text-xs font-semibold text-muted m-0">Script {key}</p>
                        <p className="text-xs text-muted m-0">
                          Used {bucket.used} · ↑ {bucket.up} · ↓ {bucket.down}
                        </p>
                      </div>
                      <p className={"text-sm m-0 mb-3 " + (text ? "text-ink" : "text-dim italic")}>
                        {text || "No text saved on the campaign yet."}
                      </p>
                      {bucket.notes.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">What callers said</p>
                          <ul className="list-none m-0 p-0 space-y-2">
                            {bucket.notes.map((n, i) => (
                              <li key={i} className="text-xs text-muted">
                                <span className="text-ink">{n.businessName}</span>
                                {" — "}
                                {n.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

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
          <p className="text-sm text-muted">
            No objection responses used yet — feedback from Focus mode&apos;s &quot;If they push back&quot; panel shows
            up here.
          </p>
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
