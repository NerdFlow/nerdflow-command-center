import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { getActiveTargets } from "@/server/targets";
import { METRIC_LABEL } from "@/server/targets";
import { ProfileClient } from "@/components/ProfileClient";

export default async function ProfilePage({ searchParams }: { searchParams: { setup?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isSetup = searchParams.setup === "1" && !user.profileCompletedAt;
  const targets = await getActiveTargets(user.id);
  const channelAccounts = (user.channelAccounts as Record<string, string>) ?? {};
  const channelsWorked = (user.channelsWorked as string[]) ?? ["call", "email"];
  const workingHours = user.workingHours as { start: string; end: string; days: number[] };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {isSetup && (
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-ink border border-rule mx-auto mb-4 flex items-center justify-center text-accent font-bold text-2xl">
              F
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Two minutes, then Today</h1>
            <p className="text-muted text-sm">This is what Focus mode and Replies use to work for you.</p>
          </div>
        )}
        <ProfileClient
          isSetup={isSetup}
          fullName={user.fullName}
          timezone={user.timezone}
          start={workingHours?.start ?? "09:00"}
          end={workingHours?.end ?? "17:30"}
          gmail={channelAccounts.gmail ?? user.email}
          instagram={channelAccounts.instagram ?? ""}
          linkedin={channelAccounts.linkedin ?? ""}
          channelsWorked={channelsWorked}
          targets={targets.map((t) => ({ label: METRIC_LABEL[t.metric], value: t.dailyValue }))}
        />
      </div>
    </div>
  );
}
