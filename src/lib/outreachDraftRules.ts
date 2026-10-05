import { MAX_REGENERATIONS } from "@/lib/outreachChecklist";

export function draftGenerationDecision(input: {
  mode: "generate" | "regenerate";
  hasDraft: boolean;
  regenerateCount: number;
  killSwitch: boolean;
  usedToday: number;
  dailyCap: number;
  dnc: boolean;
}): { ok: true; reuse: boolean } | { ok: false; reason: string } {
  if (input.dnc) return { ok: false, reason: "Do not contact. Generate is off and send is blocked." };
  if (input.killSwitch) return { ok: false, reason: "Draft generation is switched off." };
  if (input.mode === "generate" && input.hasDraft) return { ok: true, reuse: true };
  if (input.usedToday >= input.dailyCap) return { ok: false, reason: `Daily draft cap reached (${input.dailyCap}).` };
  if (input.mode === "regenerate" && !input.hasDraft) return { ok: false, reason: "Generate a draft first." };
  if (input.mode === "regenerate" && input.regenerateCount >= MAX_REGENERATIONS) {
    return { ok: false, reason: "This card has used its 3 regenerations." };
  }
  return { ok: true, reuse: false };
}
