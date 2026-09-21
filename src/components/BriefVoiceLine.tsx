"use client";

import { useState } from "react";
import { VoiceLine } from "@/components/ui";
import { getSharperBrief } from "@/server/actions/brief";

export function BriefVoiceLine({ assistantName, initialLines }: { assistantName: string; initialLines: string[] }) {
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

  return (
    <div className="mb-2">
      <VoiceLine name={assistantName} thinking={loading}>
        {lines.join("\n")}
      </VoiceLine>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={sharpen}
          disabled={loading}
          className="text-sm text-accent font-medium hover:text-accent-hover disabled:opacity-55"
        >
          {loading ? "Thinking…" : "Get a sharper brief"}
        </button>
        {aiUsed && <span className="text-xs text-muted">Rewritten by AI from the same data.</span>}
      </div>
    </div>
  );
}
