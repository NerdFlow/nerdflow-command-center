import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { Panel, Chip } from "@/components/ui";
import { getCallScripts, getEmailScripts, type CampaignStrategy } from "@/server/strategy";
import { isPositiveOutcome, perHundred, variantFromScriptId } from "@/server/focusMode";
import type { ObjectionResponseStatus, Channel } from "@prisma/client";

const STATUS_TONE: Record<ObjectionResponseStatus, "go" | "acc" | "default" | "stop"> = {
  proven: "go",
  testing: "acc",
  new: "default",
  retired: "stop",
};
const CHANNEL_LABEL: Record<Channel, string> = { call: "Call", email: "Email", instagram: "Instagram", linkedin: "LinkedIn" };

type VariantStats = {
  touches: number;
  positive: number;
  helpful: number;
  meh: number;
  bad: number;
};

function emptyVariant(): VariantStats {
  return { touches: 0, positive: 0, helpful: 0, meh: 0, bad: 0 };
}

export default async function WhatsWorkingPage() {
  const user = await requireUser();
  const isRep = user.role === "rep";
  const touchScope = {
    organizationId: user.organizationId,
    ...(isRep ? { userId: user.id } : {}),
  };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
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
        channel: { in: ["call", "email"] },
        occurredAt: { gte: weekAgo },
      },
      select: {
        scriptId: true,
        scriptUsed: true,
        scriptRating: true,
        channel: true,
        outcome: true,
        lead: {
          select: {
            campaignId: true,
            campaign: { select: { id: true, name: true, strategy: true } },
          },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: 1000,
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

  type ChannelPair = { a: VariantStats; b: VariantStats; aText: string; bText: string };
  type CampaignScriptStats = {
    campaignId: string;
    campaignName: string;
    call: ChannelPair;
    email: ChannelPair;
  };

  const byCampaign = new Map<string, CampaignScriptStats>();

  function pairFrom(strategy: unknown, channel: "call" | "email"): ChannelPair {
    const [aText, bText] = channel === "call" ? getCallScripts(strategy as CampaignStrategy) : getEmailScripts(strategy as CampaignStrategy);
    return { a: emptyVariant(), b: emptyVariant(), aText, bText };
  }

  function ensureCampaign(id: string, name: string, strategy: unknown): CampaignScriptStats {
    let row = byCampaign.get(id);
    if (!row) {
      row = {
        campaignId: id,
        campaignName: name,
        call: pairFrom(strategy, "call"),
        email: pairFrom(strategy, "email"),
      };
      byCampaign.set(id, row);
    }
    return row;
  }

  for (const c of campaigns) {
    const call = getCallScripts(c.strategy as CampaignStrategy);
    const email = getEmailScripts(c.strategy as CampaignStrategy);
    if (call.some((text) => text.trim()) || email.some((text) => text.trim())) {
      ensureCampaign(c.id, c.name, c.strategy);
    }
  }

  for (const t of scriptTouches) {
    if (t.channel !== "call" && t.channel !== "email") continue;
    const variant = variantFromScriptId(t.scriptId, t.scriptUsed);
    if (!variant) continue;
    const row = ensureCampaign(t.lead.campaignId, t.lead.campaign.name, t.lead.campaign.strategy);
    const bucket = row[t.channel][variant];
    bucket.touches += 1;
    if (isPositiveOutcome(t.outcome)) bucket.positive += 1;
    if (t.scriptRating === "helpful" || t.scriptRating === "up") bucket.helpful += 1;
    if (t.scriptRating === "meh") bucket.meh += 1;
    if (t.scriptRating === "bad" || t.scriptRating === "down") bucket.bad += 1;
  }

  const scriptStats = Array.from(byCampaign.values()).filter((c) => {
    const texts = [c.call.aText, c.call.bText, c.email.aText, c.email.bText];
    const touches = c.call.a.touches + c.call.b.touches + c.email.a.touches + c.email.b.touches;
    return touches > 0 || texts.some((text) => text.trim());
  });

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">What&apos;s Working</h1>
      <p className="text-muted mb-6">
        Last 7 days. Focus assigns script A or B, and this compares interested outcomes per 100 touches. Interested
        includes a meeting or a reply.
      </p>

      <Panel className="mb-6">
        <h2 className="text-[17px] font-medium mb-3">Scripts, A vs B{isRep ? " (yours)" : ""}</h2>
        {scriptStats.length === 0 ? (
          <p className="text-sm text-muted m-0">
            No scripts yet. Add call and email A/B on a campaign&apos;s Scripts tab. Focus assigns one on every touch.
          </p>
        ) : (
          <div className="space-y-6">
            {scriptStats.map((c) => (
              <div key={c.campaignId} className="border-b border-rule pb-5 last:border-0 last:pb-0">
                <p className="text-sm font-medium m-0 mb-3">{c.campaignName}</p>
                {(
                  [
                    { label: "Calls", pair: c.call },
                    { label: "Emails", pair: c.email },
                  ] as const
                ).map(({ label, pair }) => {
                  const hasText = pair.aText.trim() || pair.bText.trim();
                  const hasTouches = pair.a.touches + pair.b.touches > 0;
                  if (!hasText && !hasTouches) return null;
                  return (
                    <div key={label} className="mb-4 last:mb-0">
                      <p className="text-xs font-semibold text-muted m-0 mb-2">{label} · last 7 days</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        {(
                          [
                            { key: "A", text: pair.aText, bucket: pair.a },
                            { key: "B", text: pair.bText, bucket: pair.b },
                          ] as const
                        ).map(({ key, text, bucket }) => {
                          const rate = perHundred(bucket.positive, bucket.touches);
                          return (
                            <div key={key} className="rounded-xl border border-rule bg-panel2 p-3.5">
                              <div className="flex justify-between items-start gap-2 mb-2">
                                <p className="text-xs font-semibold text-muted m-0">Script {key}</p>
                                <p className="text-xs text-muted m-0 text-right">
                                  {bucket.touches === 0 || rate === null
                                    ? "No touches this week"
                                    : `${bucket.touches} touches · ${rate} interested per 100`}
                                </p>
                              </div>
                              <p className={"text-sm m-0 " + (text ? "text-ink" : "text-dim italic")}>
                                {text || "No text saved on the campaign yet."}
                              </p>
                              {bucket.helpful + bucket.meh + bucket.bad > 0 && (
                                <p className="text-xs text-muted mt-2 mb-0">
                                  Helpful {bucket.helpful} · Meh {bucket.meh} · Bad {bucket.bad}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
