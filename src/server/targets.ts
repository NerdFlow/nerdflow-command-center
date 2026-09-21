import { prisma } from "@/server/db";
import type { TargetMetric, User } from "@prisma/client";

export const METRIC_LABEL: Record<TargetMetric, string> = {
  leads_verified: "Leads verified",
  emails: "Emails sent",
  calls: "Calls made",
  instagram_dms: "Instagram DMs",
  linkedin_messages: "LinkedIn messages",
};

export async function getActiveTargets(userId: string) {
  const targets = await prisma.target.findMany({
    where: { userId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
  });
  const latestByMetric = new Map<TargetMetric, (typeof targets)[number]>();
  for (const t of targets) {
    if (!latestByMetric.has(t.metric)) latestByMetric.set(t.metric, t);
  }
  return Array.from(latestByMetric.values());
}

export async function getTodayStats(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: today } } });
}

export async function getOrCreateTodayStats(userId: string, organizationId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.dailyStat.upsert({
    where: { userId_date: { userId, date: today } },
    update: {},
    create: { userId, organizationId, date: today, counts: {} },
  });
}

export async function getPacing(user: User) {
  const [targets, stats] = await Promise.all([getActiveTargets(user.id), getTodayStats(user.id)]);
  const counts = (stats?.counts as Record<string, number>) ?? {};

  const perMetric = targets.map((t) => {
    const count = counts[t.metric] ?? 0;
    const pct = t.dailyValue > 0 ? Math.min(100, Math.round((count / t.dailyValue) * 100)) : 0;
    return { metric: t.metric, label: METRIC_LABEL[t.metric], count, target: t.dailyValue, pct };
  });

  const overallPct = perMetric.length
    ? Math.round(perMetric.reduce((sum, m) => sum + m.pct, 0) / perMetric.length)
    : 0;

  const lastClosedOut = await prisma.dailyStat.findFirst({
    where: { userId: user.id, closedOutAt: { not: null } },
    orderBy: { date: "desc" },
  });

  return { perMetric, overallPct, streak: lastClosedOut?.streakAfter ?? 0 };
}

const COUNT_KEY_BY_CHANNEL: Record<string, string> = {
  call: "calls",
  email: "emails",
  instagram: "instagram_dms",
  linkedin: "linkedin_messages",
};

export async function incrementMetricCount(userId: string, organizationId: string, metricKey: string) {
  const stat = await getOrCreateTodayStats(userId, organizationId);
  const counts = { ...((stat.counts as Record<string, number>) ?? {}) };
  counts[metricKey] = (counts[metricKey] ?? 0) + 1;
  await prisma.dailyStat.update({ where: { id: stat.id }, data: { counts } });
}

export async function incrementDailyCount(userId: string, organizationId: string, channel: string) {
  const key = COUNT_KEY_BY_CHANNEL[channel];
  if (!key) return;
  await incrementMetricCount(userId, organizationId, key);
}
