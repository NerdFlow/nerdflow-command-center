"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { getActiveTargets, getOrCreateTodayStats } from "@/server/targets";

function ruleBasedSummary(perMetric: { label: string; count: number; target: number; pct: number }[], overallPct: number) {
  if (perMetric.length === 0) return "No targets set — nothing to summarize yet.";
  const weakest = [...perMetric].sort((a, b) => a.pct - b.pct)[0]!;
  if (overallPct >= 100) return `Hit every target today (${perMetric.map((m) => `${m.label} ${m.count}/${m.target}`).join(", ")}).`;
  return `${overallPct}% of target today. Biggest gap: ${weakest.label} at ${weakest.count}/${weakest.target}.`;
}

export async function closeOutDay(input: { blocker?: string; learning?: string }) {
  const user = await requireUser();
  const targets = await getActiveTargets(user.id);
  const stat = await getOrCreateTodayStats(user.id, user.organizationId);
  const counts = (stat.counts as Record<string, number>) ?? {};

  const perMetric = targets.map((t) => {
    const count = counts[t.metric] ?? 0;
    const pct = t.dailyValue > 0 ? Math.min(100, Math.round((count / t.dailyValue) * 100)) : 0;
    return { label: t.metric, count, target: t.dailyValue, pct };
  });
  const overallPct = perMetric.length ? Math.round(perMetric.reduce((s, m) => s + m.pct, 0) / perMetric.length) : 0;

  const yesterday = new Date(stat.date);
  yesterday.setDate(yesterday.getDate() - 1);
  const priorStat = await prisma.dailyStat.findUnique({ where: { userId_date: { userId: user.id, date: yesterday } } });
  const priorStreak = priorStat?.closedOutAt ? (priorStat.streakAfter ?? 0) : 0;
  const streakAfter = overallPct >= 80 ? priorStreak + 1 : 0;

  const aiSummary = ruleBasedSummary(perMetric, overallPct);

  await prisma.dailyStat.update({
    where: { id: stat.id },
    data: {
      targetPct: overallPct,
      blocker: input.blocker || null,
      learning: input.learning || null,
      closedOutAt: new Date(),
      streakAfter,
      aiSummary,
    },
  });

  revalidatePath("/close-out");
  revalidatePath("/today");
  revalidatePath("/scoreboard");

  return { overallPct, streakAfter, aiSummary };
}
