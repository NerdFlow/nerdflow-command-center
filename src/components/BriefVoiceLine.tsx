"use client";

import { useState } from "react";
import { VoiceLine } from "@/components/ui";
import { getSharperBrief } from "@/server/actions/brief";

export function BriefVoiceLine({
  assistantName,
  greeting,
  firstName,
  initialLines,
}: {
  assistantName: string;
  greeting: string;
  firstName: string;
  initialLines: string[];
}) {
  const [lines, setLines] = useState(initialLines);
  const [loading, setLoading] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);

  async function sharpen() {
    setLoading(true);
    const res = await getSharperBrief();
    setLines(res.lines);
    setAiUsed(res.usedAi);
    setLoading(false);
  }

  const body = lines.join(" ");

  return (
    <div className="mb-1">
      <p className="section-label mb-3">
        {greeting}, {firstName}
      </p>
      <VoiceLine name={assistantName} thinking={loading}>
        {body}
      </VoiceLine>
      <div className="flex items-center gap-3 mt-3 mb-1 pl-[3.75rem]">
        <button type="button" onClick={sharpen} disabled={loading} className="quiet-link disabled:opacity-55">
          {loading ? "Thinking…" : "Sharpen this brief"}
        </button>
        {aiUsed && <span className="text-[11px] text-dim">Same numbers, clearer wording.</span>}
      </div>
    </div>
  );
}
