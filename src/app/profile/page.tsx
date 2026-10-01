import { redirect } from "next/navigation";
import { getCurrentUser, getSessionActor } from "@/server/auth";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { getActiveTargets } from "@/server/targets";
import { METRIC_LABEL } from "@/server/targets";
import { ProfileClient } from "@/components/ProfileClient";

export default async function ProfilePage({ searchParams }: { searchParams: { setup?: string } }) {
  const [user, actor] = await Promise.all([getCurrentUser(), getSessionActor()]);
  if (!user) redirect("/login");
  const impersonating = !!actor && actor.id !== user.id;

  const isSetup = searchParams.setup === "1" && !user.profileCompletedAt;
  const targets = await getActiveTargets(user.id);
  const channelAccounts = (user.channelAccounts as Record<string, string>) ?? {};
  const channelsWorked = (user.channelsWorked as string[]) ?? ["call", "email"];
  const workingHours = user.workingHours as { start: string; end: string; days: number[] };

  return (
    <div className="min-h-screen app-atmosphere flex flex-col">
      {impersonating && <ImpersonationBanner name={user.fullName} />}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg animate-fade-up">
        {isSetup && (
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-accent-soft border border-accent/30 mx-auto mb-4 flex items-center justify-center" aria-hidden>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <circle cx="7" cy="14" r="4" stroke="var(--accent)" strokeWidth="1.5" />
                <circle cx="17" cy="14" r="4" stroke="var(--accent)" strokeWidth="1.5" />
                <path d="M3 14C3 10 5 7 7 6M21 14C21 10 19 7 17 6M11 14h2" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Two minutes, then Today</h1>
            <p className="text-muted text-sm">So Focus and Replies know how to work for you.</p>
          </div>
        )}
        {!isSetup && (
          <div className="mb-5">
            <h1 className="page-title m-0">Profile</h1>
            <p className="text-sm text-muted m-0 mt-1">Your hours, channels, and inboxes.</p>
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
    </div>
  );
}
