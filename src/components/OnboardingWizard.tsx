"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Btn, Chip, Panel } from "@/components/ui";
import { METRIC_LABEL } from "@/server/targets";
import { markOnboardingStep, saveProfileStep, saveAssistantName, completeOnboarding } from "@/server/actions/onboarding";
import type { TargetMetric } from "@prisma/client";

type Props = {
  user: {
    fullName: string;
    email: string;
    role: "rep" | "manager" | "admin";
    timezone: string;
    workingHours: { start: string; end: string; days: number[] };
  };
  assistantName: string;
  welcomeMessage: string;
  targets: { metric: TargetMetric; dailyValue: number }[];
  progress: Record<string, boolean>;
  alreadyCompleted: boolean;
};

const CORE_STEPS = ["welcome", "profile", "meet_assistant"] as const;
const TOUR_STEPS = ["tour_today", "tour_focus", "tour_leads", "tour_campaigns", "tour_deals"] as const;
const CLOSING_STEPS = ["how_ai_works", "grading", "connect", "first_day"] as const;

function stepsForRole(role: string): string[] {
  return [
    ...CORE_STEPS,
    ...TOUR_STEPS,
    ...(role !== "rep" ? ["tour_scoreboard"] : []),
    ...(role === "admin" ? ["tour_admin"] : []),
    ...CLOSING_STEPS,
  ];
}

/** Shared shell for the feature-tour and AI-explainer steps: heading, bullets, Continue. */
function TourStep({
  eyebrow,
  title,
  intro,
  points,
  onContinue,
  disabled,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  points: { label: string; detail: ReactNode }[];
  onContinue: () => void;
  disabled: boolean;
}) {
  return (
    <div>
      <Chip tone="acc">{eyebrow}</Chip>
      <h1 className="text-xl font-semibold mb-3 mt-2">{title}</h1>
      {intro && <p className="text-muted mb-3">{intro}</p>}
      <ul className="space-y-3 mb-5">
        {points.map((p) => (
          <li key={p.label} className="text-sm">
            <span className="font-medium block">{p.label}</span>
            <span className="text-muted">{p.detail}</span>
          </li>
        ))}
      </ul>
      <Btn variant="primary" disabled={disabled} onClick={onContinue}>
        Continue
      </Btn>
    </div>
  );
}

export function OnboardingWizard({
  user,
  assistantName: initialAssistantName,
  welcomeMessage,
  targets,
  progress,
  alreadyCompleted,
}: Props) {
  const router = useRouter();
  const stepKeys = useMemo(() => stepsForRole(user.role), [user.role]);

  const firstUnfinished = useMemo(() => {
    if (alreadyCompleted) return 0;
    const idx = stepKeys.findIndex((k) => !progress[k]);
    return idx === -1 ? stepKeys.length - 1 : idx;
  }, [progress, stepKeys, alreadyCompleted]);

  const [stepIndex, setStepIndex] = useState(firstUnfinished);
  const [fullName, setFullName] = useState(user.fullName);
  const [timezone, setTimezone] = useState(user.timezone);
  const [start, setStart] = useState(user.workingHours?.start ?? "09:00");
  const [end, setEnd] = useState(user.workingHours?.end ?? "17:30");
  const [assistantName, setAssistantName] = useState(initialAssistantName);
  const [saving, setSaving] = useState(false);

  const step = stepKeys[stepIndex];
  const assistant = assistantName || "Flow";

  async function next(markKey?: string) {
    setSaving(true);
    if (markKey) await markOnboardingStep(markKey);
    setSaving(false);
    if (stepIndex === stepKeys.length - 1) {
      await completeOnboarding();
      router.push("/today");
      router.refresh();
      return;
    }
    setStepIndex((i) => i + 1);
  }

  return (
    <Panel>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-muted">
          Step {stepIndex + 1} of {stepKeys.length}
        </span>
        {alreadyCompleted && <span className="text-xs text-muted">Replaying the tour</span>}
      </div>
      <div className="flex gap-1.5 mb-6">
        {stepKeys.map((k, i) => (
          <div key={k} className={"h-1 flex-1 rounded-full " + (i <= stepIndex ? "bg-accent" : "bg-panel2")} />
        ))}
      </div>

      {step === "welcome" && (
        <div>
          <h1 className="text-xl font-semibold mb-3">Welcome, {user.fullName.split(" ")[0]}</h1>
          <p className="text-muted mb-3 whitespace-pre-line">
            {welcomeMessage ||
              "A note from Muqeet: past attempts at a sales process stalled for three reasons — no shared record of who was contacted, no coaching on what to say next, and no way to tell effort from luck. This platform fixes all three. It won't sell for you. It makes sure nothing falls through the cracks, and that you get better every week."}
          </p>
          <p className="text-sm text-muted mb-4">
            Next up: a quick tour of every screen, and an honest look at what the AI in here actually does (and doesn&apos;t do).
          </p>
          <Btn variant="primary" onClick={() => next("welcome")} disabled={saving}>
            Continue
          </Btn>
        </div>
      )}

      {step === "profile" && (
        <div>
          <h1 className="text-xl font-semibold mb-3">Your profile</h1>
          <div className="space-y-3 mb-4">
            <label className="block text-sm">
              Name
              <input className="in w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label className="block text-sm">
              Timezone
              <input className="in w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                Working hours start
                <input type="time" className="in w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="block text-sm">
                Working hours end
                <input type="time" className="in w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
          </div>
          <p className="text-xs text-muted mb-4">
            Focus mode schedules every follow-up inside these hours, in this timezone — this is what makes the cadence
            actually respect your day.
          </p>
          <Btn
            variant="primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await saveProfileStep({ fullName, timezone, start, end });
              await next("profile");
            }}
          >
            Save and continue
          </Btn>
        </div>
      )}

      {step === "meet_assistant" && (
        <div>
          <h1 className="text-xl font-semibold mb-3">Meet {assistant}</h1>
          <p className="text-muted mb-3">
            {assistant} coaches, drafts and prepares you. It never sends a message on your behalf, and it never
            judges your pay — that&apos;s between you and your manager. Every claim it makes about a prospect comes from
            data stored in this system, never invented.
          </p>
          <p className="text-sm text-muted mb-4">
            The next few screens show you what {assistant} actually looks like on each part of the app — then a
            dedicated step on how the AI underneath it works.
          </p>
          {user.role !== "rep" && (
            <label className="block text-sm mb-4">
              Assistant name (visible to the whole team)
              <input
                className="in w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
              />
            </label>
          )}
          <Btn
            variant="primary"
            disabled={saving}
            onClick={async () => {
              if (user.role !== "rep") await saveAssistantName(assistantName);
              await next("meet_assistant");
            }}
          >
            Continue
          </Btn>
        </div>
      )}

      {step === "tour_today" && (
        <TourStep
          eyebrow="Feature tour · 1 of 5"
          title="Today: where your day starts"
          intro="Every morning this is the first thing you see — built from your own data, not a template."
          points={[
            { label: `The ${assistant} brief`, detail: "Plain-language lines built from your queue, your hottest lead, deals that need attention, and your pace against target. “Get a sharper brief” asks the AI to rewrite the same facts more sharply — it never adds new ones." },
            { label: "Targets panel", detail: "One bar per metric (leads verified, emails, calls, DMs, LinkedIn messages). Fills in automatically as you log outcomes in Focus mode." },
            { label: "Up next", detail: "Your first six queue items — hot leads first, then follow-ups due today, then new ones. Click through to Focus mode to actually work them." },
            { label: "Deals needing attention", detail: "Any open deal with a risk flag — gone quiet, no next step booked, a decision-maker never met." },
          ]}
          onContinue={() => next("tour_today")}
          disabled={saving}
        />
      )}

      {step === "tour_focus" && (
        <TourStep
          eyebrow="Feature tour · 2 of 5"
          title="Focus mode: one lead at a time"
          intro="This is where the actual outreach work happens — no spreadsheet, no guessing what to say."
          points={[
            { label: "Reach them by ___, because ___", detail: "The channel and the reason are both computed from the campaign's cadence and the lead's real signals (e.g. “Instagram active 14d, reviews mention missed calls”) — never invented." },
            { label: "Draft message, ready to copy", detail: "Pre-filled from the campaign's playbook with the lead's name, business and city. Nothing sends automatically — you copy it into email, Instagram, LinkedIn or your phone yourself." },
            { label: "Log the real outcome", detail: "Sent, No answer, Talked not now, Interested, They replied, Not a fit. Each one updates your targets and schedules the next cadence step inside your working hours automatically." },
            { label: "Keyboard shortcuts", detail: "1–4 for outcomes, S to skip a lead for now, C to copy the draft — for once you're moving fast." },
          ]}
          onContinue={() => next("tour_focus")}
          disabled={saving}
        />
      )}

      {step === "tour_leads" && (
        <TourStep
          eyebrow="Feature tour · 3 of 5"
          title="Lead Inbox: nothing reaches your queue unapproved"
          intro="Every lead — whether you imported it or the automatic lead engine found it — stops here first."
          points={[
            { label: "Fit score and why", detail: "A 0–100 score with the signals behind it, so you can judge it yourself instead of trusting a black box." },
            { label: "Approve or Reject", detail: "Approve queues it for Focus mode immediately. Reject asks for a reason (wrong location, no decision-maker, etc.) — that reason feeds future scoring." },
            { label: "Bulk actions", detail: "Approve everything at 70+ fit score, or reject everything with no phone, email, Instagram or LinkedIn in one click." },
            { label: "CSV import", detail: "Today's way to get leads in: upload a file, map its columns, review a duplicate check, then import." },
          ]}
          onContinue={() => next("tour_leads")}
          disabled={saving}
        />
      )}

      {step === "tour_campaigns" && (
        <TourStep
          eyebrow="Feature tour · 4 of 5"
          title="Campaigns: the playbook behind every message"
          intro="A campaign is a product plus a plan: who you're targeting, how, and what to say."
          points={[
            { label: "Playbook", detail: "Ideal customer profile, which channels to use and why, the cadence (day-by-day steps), message templates per channel, objection responses, and the kill rule that auto-pauses a campaign that isn't working." },
            { label: "Starter playbook, always editable", detail: "Creating a campaign generates a first draft from a template automatically — every field is yours to rewrite on the Playbook tab afterward." },
            { label: "Approval flow", detail: "Reps' campaigns go to a manager for approval before they go live. Managers and admins launch immediately." },
            { label: "Knowledge and Log tabs", detail: "Paste reference material the playbook should reflect, and see a running log of every change and note." },
          ]}
          onContinue={() => next("tour_campaigns")}
          disabled={saving}
        />
      )}

      {step === "tour_deals" && (
        <TourStep
          eyebrow="Feature tour · 5 of 5"
          title="Deals: once someone says yes"
          intro="Marking a lead Interested in Focus mode creates a deal here automatically — nothing else to set up."
          points={[
            { label: "Health score", detail: "How much of the current stage's checklist is done, minus 12 points per risk flag (gone quiet 7+ days, no next step, decision-maker never met, and more). Clamped between 5 and 100." },
            { label: "Stages", detail: "Interested → Discovery → Demo → Proposal → Closing → Won or Lost. Moving to Lost requires picking why, so patterns show up later." },
            { label: "Checklist, next step, people, value", detail: "What “good” looks like at this stage, the next dated action, who's involved and whether they're a decision-maker, and the deal's monthly value if you have one." },
            { label: "Timeline", detail: "Every touch and conversation on this deal, newest first." },
          ]}
          onContinue={() => next("tour_deals")}
          disabled={saving}
        />
      )}

      {step === "tour_scoreboard" && (
        <TourStep
          eyebrow="For managers and admins"
          title="Scoreboard: how the team is actually doing"
          intro="A week-by-week view across everyone, not just yourself."
          points={[
            { label: "Per-rep numbers", detail: "Target %, sends by channel, replies and reply rate, meetings booked, deals created and won, and current streak." },
            { label: "Week selector", detail: "Step back through prior weeks to spot trends before they become a problem." },
            { label: "Coming later", detail: "Review counts, average review score and each rep's top recurring mistake tag — once Phase 3's deal-coaching reviews are live." },
          ]}
          onContinue={() => next("tour_scoreboard")}
          disabled={saving}
        />
      )}

      {step === "tour_admin" && (
        <TourStep
          eyebrow="For admins"
          title="Admin: the org-wide view"
          intro="Everything for running the platform itself lives under Admin."
          points={[
            { label: "Overview and Team", detail: "Who's active today, target % per person, and full user management — invite, change role, deactivate, force sign-out, set targets with history." },
            { label: "Audit log", detail: "Every sign-in, role change, target change, campaign approval and lead reassignment, filterable and exportable to CSV." },
            { label: "AI usage", detail: "Cost and call count by feature this month against your budget, with a hard stop once the budget's hit — see the next step for how that fits together." },
            { label: "Settings", detail: "Allowed email domain, welcome message, campaign limits, and the assistant's name." },
          ]}
          onContinue={() => next("tour_admin")}
          disabled={saving}
        />
      )}

      {step === "how_ai_works" && (
        <TourStep
          eyebrow="Worth understanding"
          title={`How ${assistant} actually works`}
          intro="Short version: rules first, AI on top when it's connected, and the same three limits everywhere."
          points={[
            {
              label: "Right now, without any AI key configured",
              detail: "The morning brief, lead scoring, cadence scheduling and close-out summaries all run on plain rules against your own stored data. Nothing here requires AI to work — it's the fallback for everything, not a degraded mode.",
            },
            {
              label: "Once an AI key is connected",
              detail: `${assistant} adds a sharper rewrite of the same brief, AI-assisted campaign playbooks, message rewriting, reply classification, and (coming in Phase 3) a coaching review after every call — still grounded only in what's stored, never invented.`,
            },
            {
              label: "The lead engine (coming in Phase 4)",
              detail: "Nightly, it will search Google Places and public sources for businesses matching a campaign's ICP, enrich contacts with Apollo, verify emails, and score fit — combining plain rules with an AI check. Every result still lands in the Lead Inbox for a human to approve or reject first.",
            },
            {
              label: "Three rules that never change",
              detail: "It never sends anything to a prospect — every draft has a Copy button and nothing else. Every claim it makes must trace back to data actually stored here. And no lead reaches anyone's queue without a human clicking Approve in the Lead Inbox.",
            },
          ]}
          onContinue={() => next("how_ai_works")}
          disabled={saving}
        />
      )}

      {step === "grading" && (
        <div>
          <h1 className="text-xl font-semibold mb-3">How you&apos;re graded</h1>
          <p className="text-muted mb-3">
            You&apos;re graded on effort you control — sends, calls, follow-ups — not on luck. A quiet day where you hit
            every target and logged every outcome counts as a good day, even with zero replies.
          </p>
          <div className="bg-panel2 rounded-card p-4 mb-4">
            {targets.length === 0 && <p className="text-sm text-muted">Your manager hasn&apos;t set targets yet.</p>}
            {targets.map((t) => (
              <div key={t.metric} className="flex justify-between text-sm py-1">
                <span>{METRIC_LABEL[t.metric]}</span>
                <span className="font-medium">{t.dailyValue} / day</span>
              </div>
            ))}
          </div>
          <Btn variant="primary" disabled={saving} onClick={() => next("grading")}>
            I understand
          </Btn>
        </div>
      )}

      {step === "connect" && (
        <div>
          <h1 className="text-xl font-semibold mb-3">Connect your tools</h1>
          <p className="text-muted mb-4">
            Gmail read-only sync, calling app integration and Slack notifications land in a later phase. Nothing to
            do here yet.
          </p>
          <Btn variant="primary" disabled={saving} onClick={() => next("connect")}>
            Skip for now
          </Btn>
        </div>
      )}

      {step === "first_day" && (
        <div>
          <h1 className="text-xl font-semibold mb-3">Your first real day</h1>
          <p className="text-muted mb-3">First-week habits that matter most:</p>
          <ul className="text-sm space-y-1.5 mb-4 list-disc pl-5">
            <li>Close out every day, even a slow one</li>
            <li>Debrief every real conversation so it turns into a review</li>
            <li>Reply to interest within the hour</li>
          </ul>
          <Btn variant="primary" disabled={saving} onClick={() => next("first_day")}>
            Take me to Today
          </Btn>
        </div>
      )}
    </Panel>
  );
}
