"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Panel, Chip } from "@/components/ui";
import { generateResearch, approveResearch, generateIcp, generatePlaybook, approvePlaybook } from "@/server/actions/campaignWizard";
import type { CampaignStrategy } from "@/server/strategy";

type Research = {
  marketSnapshot: string | null;
  buyers: { type: string; why: string }[];
  painPoints: string[];
  competitors: { name: string; gap: string }[];
  channels: { channel: string; why: string }[];
  angles: string[];
  sources: { title: string; url: string }[];
  approved: boolean;
};

type Icp = {
  name: string;
  businessTypes: string[];
  keywords: string[];
  sizeSignals: string | null;
  mustHave: string[];
  niceToHave: string[];
  disqualifiers: string[];
  decisionMakerTitles: string[];
};

export function CampaignWizardClient({
  campaignId,
  campaignName,
  research: initialResearch,
  icp: initialIcp,
}: {
  campaignId: string;
  campaignName: string;
  research: Research | null;
  icp: Icp | null;
}) {
  const router = useRouter();
  const [research, setResearch] = useState(initialResearch);
  const [icp, setIcp] = useState(initialIcp);
  const [icpApprovedLocally, setIcpApprovedLocally] = useState(Boolean(initialIcp));
  const [playbook, setPlaybook] = useState<{ strategy: CampaignStrategy; source: "ai" | "fallback"; reason?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-[22px] tracking-tight mb-0.5">Build {campaignName}</h1>
        <p className="text-sm text-muted m-0">Research → approve → ICP → approve → Playbook → approve. Each step builds on the last.</p>
      </div>

      {error && <p className="text-sm text-stop">{error}</p>}

      {/* Step 1: Research */}
      <Panel>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[17px] font-medium m-0">1. Market research</h2>
          {research?.approved && <Chip tone="go">Approved</Chip>}
        </div>

        {!research ? (
          <Btn variant="primary" disabled={busy !== null} loading={busy === "research"} onClick={() => run("research", async () => {
            const r = await generateResearch(campaignId);
            if (r.source === "ai") setResearch({ ...r.research, marketSnapshot: r.research.marketSnapshot, buyers: r.research.buyers as any, painPoints: r.research.painPoints as any, competitors: r.research.competitors as any, channels: r.research.channels as any, angles: r.research.angles as any, sources: r.research.sources as any, approved: false });
            else setError(`AI unavailable (${r.reason}) — market research needs GEMINI_API_KEY configured.`);
          })}>
            {busy === "research" ? "Researching…" : "Generate research"}
          </Btn>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">{research.marketSnapshot}</p>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-1">Buyers</p>
              {research.buyers.map((b, i) => (
                <p key={i} className="text-sm m-0">
                  <b>{b.type}</b> — {b.why}
                </p>
              ))}
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-1">Pain points</p>
              <ul className="text-sm m-0 pl-4">
                {research.painPoints.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-1">Competitors</p>
              {research.competitors.map((c, i) => (
                <p key={i} className="text-sm m-0">
                  <b>{c.name}</b> — gap: {c.gap}
                </p>
              ))}
            </div>
            <div>
              <p className="text-xs text-muted uppercase tracking-wide mb-1">Sources ({research.sources.length})</p>
              <ul className="text-xs m-0 pl-4 space-y-0.5">
                {research.sources.slice(0, 8).map((s, i) => (
                  <li key={i}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-accent underline">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <Btn size="sm" variant="ghost" disabled={busy !== null} loading={busy === "research"} onClick={() => run("research", async () => {
                const r = await generateResearch(campaignId);
                if (r.source === "ai") setResearch({ ...r.research, marketSnapshot: r.research.marketSnapshot, buyers: r.research.buyers as any, painPoints: r.research.painPoints as any, competitors: r.research.competitors as any, channels: r.research.channels as any, angles: r.research.angles as any, sources: r.research.sources as any, approved: false });
                else setError(`AI unavailable (${r.reason})`);
              })}>
                Regenerate
              </Btn>
              {!research.approved && (
                <Btn size="sm" variant="primary" disabled={busy !== null} loading={busy === "approveResearch"} onClick={() => run("approveResearch", async () => {
                  await approveResearch(campaignId);
                  setResearch((r) => (r ? { ...r, approved: true } : r));
                })}>
                  {busy === "approveResearch" ? "Approving…" : "Approve and continue"}
                </Btn>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* Step 2: ICP */}
      <Panel className={research?.approved ? "" : "opacity-50 pointer-events-none"}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[17px] font-medium m-0">2. Ideal customer profile</h2>
          {icpApprovedLocally && icp && <Chip tone="go">Set</Chip>}
        </div>

        {!icp ? (
          <Btn variant="primary" disabled={busy !== null || !research?.approved} loading={busy === "icp"} onClick={() => run("icp", async () => {
            const r = await generateIcp(campaignId);
            if (r.source === "ai") setIcp({ name: r.icp.name, businessTypes: r.icp.businessTypes as any, keywords: r.icp.keywords as any, sizeSignals: r.icp.sizeSignals, mustHave: r.icp.mustHave as any, niceToHave: r.icp.niceToHave as any, disqualifiers: r.icp.disqualifiers as any, decisionMakerTitles: r.icp.decisionMakerTitles as any });
            else setError(`AI unavailable (${r.reason})`);
          })}>
            {busy === "icp" ? "Defining…" : "Generate ICP"}
          </Btn>
        ) : (
          <div className="space-y-2">
            <p className="text-sm"><b>{icp.name}</b></p>
            <p className="text-sm m-0">Business types: {icp.businessTypes.join(", ")}</p>
            <p className="text-sm m-0">Size: {icp.sizeSignals}</p>
            <p className="text-sm m-0">Must have: {icp.mustHave.join(", ")}</p>
            <p className="text-sm m-0">Disqualifiers: {icp.disqualifiers.join(", ")}</p>
            <p className="text-sm m-0">Decision-makers: {icp.decisionMakerTitles.join(", ")}</p>
            <div className="flex gap-2 mt-2">
              <Btn size="sm" variant="ghost" disabled={busy !== null} loading={busy === "icp"} onClick={() => run("icp", async () => {
                const r = await generateIcp(campaignId);
                if (r.source === "ai") setIcp({ name: r.icp.name, businessTypes: r.icp.businessTypes as any, keywords: r.icp.keywords as any, sizeSignals: r.icp.sizeSignals, mustHave: r.icp.mustHave as any, niceToHave: r.icp.niceToHave as any, disqualifiers: r.icp.disqualifiers as any, decisionMakerTitles: r.icp.decisionMakerTitles as any });
              })}>
                Regenerate
              </Btn>
              {!icpApprovedLocally && (
                <Btn size="sm" variant="primary" onClick={() => setIcpApprovedLocally(true)}>
                  Approve and continue
                </Btn>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* Step 3: Playbook */}
      <Panel className={icpApprovedLocally ? "" : "opacity-50 pointer-events-none"}>
        <h2 className="text-[17px] font-medium mb-3">3. Playbook</h2>

        {!playbook ? (
          <Btn variant="primary" disabled={busy !== null || !icpApprovedLocally} loading={busy === "playbook"} onClick={() => run("playbook", async () => {
            const r = await generatePlaybook(campaignId);
            setPlaybook(r);
          })}>
            {busy === "playbook" ? "Writing…" : "Generate playbook"}
          </Btn>
        ) : (
          <div className="space-y-2">
            {playbook.source === "fallback" && <p className="text-xs text-stop">AI unavailable ({playbook.reason}) — this is the rule-based template.</p>}
            <p className="text-sm">{playbook.strategy.summary}</p>
            <p className="text-sm m-0">Channels: {playbook.strategy.channels.map((c) => c.channel).join(", ")}</p>
            <p className="text-sm m-0">Cadence: {playbook.strategy.cadence.length} touches</p>
            <Btn variant="primary" disabled={busy !== null} loading={busy === "approvePlaybook"} onClick={() => run("approvePlaybook", async () => {
              await approvePlaybook(campaignId, playbook.strategy);
              router.push(`/campaigns/${campaignId}`);
            })}>
              {busy === "approvePlaybook" ? "Activating…" : "Approve and activate campaign"}
            </Btn>
          </div>
        )}
      </Panel>
    </div>
  );
}
