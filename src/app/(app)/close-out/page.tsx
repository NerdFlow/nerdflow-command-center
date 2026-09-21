import { requireUser } from "@/server/auth";
import { getPacing } from "@/server/targets";
import { getTodayStats } from "@/server/targets";
import { CloseOutClient } from "@/components/CloseOutClient";

export default async function CloseOutPage() {
  const user = await requireUser();
  const pacing = await getPacing(user);
  const stats = await getTodayStats(user.id);

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Close out</h1>
      <p className="text-muted mb-6">Two minutes, every day — even a slow one.</p>
      <CloseOutClient
        perMetric={pacing.perMetric}
        overallPct={pacing.overallPct}
        alreadyClosedOut={Boolean(stats?.closedOutAt)}
        existingSummary={stats?.aiSummary ?? null}
        existingBlocker={stats?.blocker ?? ""}
        existingLearning={stats?.learning ?? ""}
      />
    </div>
  );
}
