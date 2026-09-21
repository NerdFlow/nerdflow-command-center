import type { DealPerson, DealStage } from "@prisma/client";

export const STAGE_ORDER = ["interested", "discovery", "demo", "proposal", "closing"] as const satisfies readonly DealStage[];
type OpenStage = (typeof STAGE_ORDER)[number];

export const STAGE_LABEL: Record<DealStage, string> = {
  interested: "Interested",
  discovery: "Discovery",
  demo: "Demo",
  proposal: "Proposal",
  closing: "Closing",
  won: "Won",
  lost: "Lost",
};

export const STAGE_CHECKLIST: Record<OpenStage, { key: string; label: string }[]> = {
  interested: [
    { key: "replied", label: "They replied" },
    { key: "fit", label: "Confirmed fit" },
    { key: "meeting_booked", label: "Meeting booked" },
  ],
  discovery: [
    { key: "pain_confirmed", label: "Pain confirmed" },
    { key: "impact_quantified", label: "Impact quantified" },
    { key: "current_process_known", label: "Current process known" },
    { key: "decision_makers_identified", label: "Decision-makers identified" },
    { key: "next_meeting_booked", label: "Next meeting booked" },
  ],
  demo: [
    { key: "demo_tied_to_pain", label: "Demo tied to their pain" },
    { key: "decision_makers_attended", label: "Decision-makers attended" },
    { key: "objections_handled", label: "Objections handled" },
    { key: "next_step_booked", label: "Next step booked" },
  ],
  proposal: [
    { key: "proposal_recaps_pain", label: "Proposal recaps the pain" },
    { key: "price_discussed_live", label: "Price discussed live" },
    { key: "decision_date_agreed", label: "Decision date agreed" },
    { key: "signer_involved", label: "Signer involved" },
  ],
  closing: [
    { key: "terms_agreed", label: "Terms agreed" },
    { key: "start_date_set", label: "Start date set" },
    { key: "signed", label: "Signed" },
  ],
};

export type DealFlag = { key: string; label: string };

/** Weighted checklist completion up to the current stage, minus 12 per risk flag, clamped 5-100. */
export function computeHealth(
  stage: DealStage,
  checklist: Record<string, boolean>,
  flagCount: number,
): number {
  if (stage === "won") return 100;
  if (stage === "lost") return 0;

  const idx = STAGE_ORDER.indexOf(stage);
  if (idx === -1) return 60;

  let totalWeight = 0;
  let doneWeight = 0;
  STAGE_ORDER.slice(0, idx + 1).forEach((s, i) => {
    const weight = i === idx ? 1 : 1.5;
    for (const item of STAGE_CHECKLIST[s]) {
      totalWeight += weight;
      if (checklist[item.key]) doneWeight += weight;
    }
  });

  const pct = totalWeight ? (doneWeight / totalWeight) * 100 : 0;
  const score = pct - flagCount * 12;
  return Math.max(5, Math.min(100, Math.round(score)));
}

export function computeFlags(params: {
  stage: DealStage;
  lastActivityAt: Date | null;
  nextStepAt: Date | null;
  people: Pick<DealPerson, "isDecisionMaker" | "met">[];
  latestInboundAt?: Date | null;
  latestOutboundAt?: Date | null;
  now?: Date;
}): DealFlag[] {
  const { stage, lastActivityAt, nextStepAt, people } = params;
  const now = params.now ?? new Date();
  const flags: DealFlag[] = [];
  if (stage === "won" || stage === "lost") return flags;

  const daysSince = lastActivityAt
    ? (now.getTime() - lastActivityAt.getTime()) / 86_400_000
    : Infinity;
  if (daysSince >= 7) flags.push({ key: "gone_quiet", label: "Gone quiet 7+ days" });
  else if (daysSince >= 4) flags.push({ key: "quiet_warning", label: "4+ days since last touch" });

  const idx = STAGE_ORDER.indexOf(stage);
  const discoveryIdx = STAGE_ORDER.indexOf("discovery");
  const demoIdx = STAGE_ORDER.indexOf("demo");
  const proposalIdx = STAGE_ORDER.indexOf("proposal");

  if (idx >= discoveryIdx && !nextStepAt) {
    flags.push({ key: "no_next_step", label: "No next step" });
  }

  if (
    stage === "interested" &&
    params.latestInboundAt &&
    (!params.latestOutboundAt || params.latestOutboundAt < params.latestInboundAt) &&
    now.getTime() - params.latestInboundAt.getTime() > 60 * 60_000
  ) {
    flags.push({ key: "unanswered_reply", label: "Fresh reply unanswered 60+ min" });
  }

  if (idx >= demoIdx && !people.some((p) => p.isDecisionMaker && p.met)) {
    flags.push({ key: "dm_not_met", label: "Decision-maker not met" });
  }

  if (idx >= proposalIdx && !nextStepAt) {
    flags.push({ key: "no_decision_date", label: "No decision date" });
  }

  return flags;
}
