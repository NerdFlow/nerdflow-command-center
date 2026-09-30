import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";
import { ShellExtrasClient } from "@/components/ShellExtrasClient";

/**
 * Badge counts and the assistant name. Kept out of the app layout so a tab
 * click can paint the shell and the page skeleton without waiting on these.
 */
export async function ShellExtras({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const [dueNowCount, openReplies, oldestOpenReply, settings, latestStat] = await Promise.all([
    prisma.lead.count({
      where: {
        ownerId: userId,
        organizationId,
        OR: [{ status: "queued" }, { status: "in_cadence", nextTouchAt: { lte: new Date() } }],
      },
    }),
    prisma.reply.count({
      where: { status: "open", lead: { ownerId: userId, organizationId } },
    }),
    prisma.reply.findFirst({
      where: { status: "open", lead: { ownerId: userId, organizationId } },
      orderBy: { receivedAt: "asc" },
      select: { receivedAt: true },
    }),
    getOrgSettings(),
    prisma.dailyStat.findFirst({
      where: { userId, closedOutAt: { not: null } },
      orderBy: { date: "desc" },
    }),
  ]);

  const replyAgeHours = oldestOpenReply
    ? (Date.now() - new Date(oldestOpenReply.receivedAt).getTime()) / (1000 * 60 * 60)
    : 0;

  return (
    <ShellExtrasClient
      dueNowCount={dueNowCount}
      openReplies={openReplies}
      repliesUrgent={openReplies > 0 && replyAgeHours >= 24}
      streak={latestStat?.streakAfter ?? 0}
      assistantName={settings.assistantName}
    />
  );
}
