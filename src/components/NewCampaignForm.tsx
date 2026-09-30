"use client";

import { useState } from "react";
import Link from "next/link";
import { Btn, Chip, SectionLabel } from "@/components/ui";
import { createProduct, launchCampaign, type LaunchCampaignResult } from "@/server/actions/campaigns";

const CHANNEL_OPTIONS = [
  { id: "call" as const, label: "Call" },
  { id: "email" as const, label: "Email" },
  { id: "instagram" as const, label: "Instagram" },
  { id: "linkedin" as const, label: "LinkedIn" },
];

type Phase = "form" | "working" | "done";

const fieldClass =
  "w-full border border-rule rounded-xl px-3.5 py-2.5 bg-panel2 text-sm text-ink placeholder:text-dim focus:outline-none focus:border-accent/50 transition-colors";

function segmentBtn(on: boolean) {
  return (
    "text-sm px-3.5 py-2 rounded-xl border transition-colors " +
    (on ? "border-accent bg-accent-soft text-accent font-semibold" : "border-rule text-muted hover:text-ink hover:border-rule")
  );
}

export function NewCampaignForm({
  products,
  reps,
  isLead,
  assistantName = "Flow",
}: {
  products: { id: string; name: string; type: "product" | "service"; summary: string }[];
  reps: { id: string; fullName: string }[];
  isLead: boolean;
  assistantName?: string;
}) {
  const [creatingProduct, setCreatingProduct] = useState(products.length === 0);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [newProduct, setNewProduct] = useState({ name: "", type: "product" as "product" | "service", summary: "" });
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [buyerGuess, setBuyerGuess] = useState("");
  const [channels, setChannels] = useState<Array<"call" | "email" | "instagram" | "linkedin">>(["call", "email"]);
  const [researchMarket, setResearchMarket] = useState(true);
  const [ownerId, setOwnerId] = useState(reps[0]?.id ?? "");
  const [phase, setPhase] = useState<Phase>("form");
  const [workingStep, setWorkingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchCampaignResult | null>(null);

  function toggleChannel(id: (typeof CHANNEL_OPTIONS)[number]["id"]) {
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function submit() {
    if (!location.trim() || !buyerGuess.trim()) {
      setError("Add who you’re going after and a geography so we know where to look.");
      return;
    }
    if (channels.length === 0) {
      setError("Pick at least one channel.");
      return;
    }

    setPhase("working");
    setError(null);
    setWorkingStep("Saving campaign…");

    try {
      let pid = productId;
      if (creatingProduct) {
        const product = await createProduct(newProduct);
        pid = product.id;
      }

      setWorkingStep(
        researchMarket
          ? `${assistantName} is researching the market…`
          : "Saving playbook and starting lead search…",
      );

      const res = await launchCampaign({
        productId: pid,
        name: name || `${newProduct.name || products.find((p) => p.id === pid)?.name}: ${buyerGuess.slice(0, 40)}`,
        ownerId: isLead ? ownerId : undefined,
        location: location.trim(),
        buyerGuess: buyerGuess.trim(),
        channels,
        researchMarket,
        maxLeads: 15,
      });

      setResult(res);
      setPhase("done");
    } catch (e) {
      setPhase("form");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  if (phase === "working") {
    return (
      <div className="max-w-cockpit py-10 space-y-4">
        <SectionLabel>Working</SectionLabel>
        <p className="next-action m-0">{workingStep}</p>
        <p className="text-sm text-muted m-0 max-w-md">
          {researchMarket
            ? `${assistantName} looks up the market, figures out who to target, then starts finding leads. Stay on this page.`
            : "Finding leads from your description. Stay on this page."}
        </p>
        <div className="h-1.5 rounded-full bg-panel2 overflow-hidden max-w-xs">
          <div className="h-full w-1/2 bg-accent animate-pulse rounded-full" />
        </div>
      </div>
    );
  }

  if (phase === "done" && result) {
    const researchSkipped = result.research.ran && !result.research.ok;
    const placesIssue = !result.scraping.ok;

    return (
      <div className="max-w-cockpit animate-fade-up space-y-8 py-2">
        <div>
          <SectionLabel className="mb-3">Campaign live</SectionLabel>
          <h2 className="next-action m-0 mb-2">{result.campaignName} is live</h2>
          <p className="text-sm text-muted m-0">
            New leads go straight into your Focus queue — no inbox approval step.
          </p>
        </div>

        {result.scraping.ok ? (
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="stat-number text-accent m-0">{result.scraping.created}</p>
              <p className="text-xs text-dim mt-1.5 mb-0">new in Focus</p>
            </div>
            <div>
              <p className="stat-number m-0">{result.scraping.duplicates}</p>
              <p className="text-xs text-dim mt-1.5 mb-0">duplicates skipped</p>
            </div>
            {result.scraping.found > 0 && (
              <div>
                <p className="stat-number m-0">{result.scraping.found}</p>
                <p className="text-xs text-dim mt-1.5 mb-0">found</p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-card border border-rule bg-panel px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-semibold m-0">Lead search</p>
              <Chip tone="stop">{result.scraping.attempted ? "Failed" : "Didn’t start"}</Chip>
            </div>
            <p className="text-sm text-muted m-0">{result.scraping.reason ?? "Scraping did not run."}</p>
            {placesIssue && (
              <p className="text-xs text-dim mt-2 mb-0">
                Campaign still saved. Add Places (or import a list) when you’re ready for leads.
              </p>
            )}
          </div>
        )}

        {result.research.ran && (
          <div className="rounded-card border border-rule bg-panel px-5 py-4 space-y-2">
            <div className="flex justify-between items-center gap-2">
              <p className="text-sm font-semibold m-0">Market research</p>
              <Chip tone={result.research.ok ? "go" : "warm"}>{result.research.ok ? "Done" : "Skipped"}</Chip>
            </div>
            {result.research.ok ? (
              <>
                {result.research.snapshot && <p className="text-sm m-0 leading-relaxed">{result.research.snapshot}</p>}
                {result.research.whoToTarget && (
                  <p className="text-sm m-0">
                    <span className="text-muted">Who to target: </span>
                    {result.research.whoToTarget}
                  </p>
                )}
                {result.research.sourceCount > 0 && (
                  <p className="text-xs text-dim mt-1 mb-0">{result.research.sourceCount} sources cited</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted m-0">
                {researchSkipped && result.research.reason
                  ? result.research.reason.length > 160
                    ? `${result.research.reason.slice(0, 160)}…`
                    : result.research.reason
                  : "Research was skipped."}
              </p>
            )}
          </div>
        )}

        {result.notices.length > 0 && (
          <ul className="text-sm text-muted m-0 pl-4 space-y-1">
            {result.notices.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          <Link
            href="/focus"
            className="inline-flex items-center justify-center bg-accent text-on-accent font-semibold px-5 py-3.5 rounded-xl text-[15px] hover:bg-accent-hover transition-colors"
          >
            Open Focus
          </Link>
          <div>
            <Link href={`/campaigns/${result.campaignId}`} className="quiet-link">
              View campaign →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-cockpit">
      <div>
        <SectionLabel className="mb-3">Product</SectionLabel>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setCreatingProduct(false)}
            disabled={products.length === 0}
            className={segmentBtn(!creatingProduct)}
          >
            Existing product
          </button>
          <button type="button" onClick={() => setCreatingProduct(true)} className={segmentBtn(creatingProduct)}>
            New product
          </button>
        </div>

        {creatingProduct ? (
          <div className="space-y-3">
            <input
              className={fieldClass}
              placeholder="Product or service name"
              value={newProduct.name}
              onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
            />
            <select
              className={fieldClass}
              value={newProduct.type}
              onChange={(e) => setNewProduct((p) => ({ ...p, type: e.target.value as "product" | "service" }))}
            >
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
            <textarea
              className={fieldClass + " min-h-[88px] resize-y"}
              placeholder="Plain-language description"
              value={newProduct.summary}
              onChange={(e) => setNewProduct((p) => ({ ...p, summary: e.target.value }))}
            />
          </div>
        ) : (
          <select className={fieldClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <label className="block">
        <span className="section-label mb-2 block">Campaign name</span>
        <input
          className={fieldClass}
          placeholder="e.g. Missed-call clinics in Islamabad"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="section-label mb-2 block">Who you’re going after</span>
        <textarea
          className={fieldClass + " resize-y"}
          placeholder="e.g. Dental clinics that miss patient calls after hours"
          value={buyerGuess}
          onChange={(e) => setBuyerGuess(e.target.value)}
          rows={2}
        />
      </label>

      <label className="block">
        <span className="section-label mb-2 block">Geography</span>
        <input
          className={fieldClass}
          placeholder="City or region"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>

      <div>
        <SectionLabel className="mb-2.5">Channels</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {CHANNEL_OPTIONS.map((c) => {
            const on = channels.includes(c.id);
            return (
              <button key={c.id} type="button" onClick={() => toggleChannel(c.id)} className={segmentBtn(on)}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setResearchMarket((v) => !v)}
        className={
          "w-full text-left flex gap-3.5 items-start rounded-card border px-4 py-4 transition-colors " +
          (researchMarket
            ? "border-accent/40 bg-accent-soft/40"
            : "border-rule bg-panel hover:border-rule")
        }
      >
        <span
          className={
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors " +
            (researchMarket ? "border-accent bg-accent text-on-accent" : "border-rule bg-panel2")
          }
          aria-hidden
        >
          {researchMarket && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span>
          <span className="text-[15px] font-semibold block text-ink">Research the market first</span>
          <span className="text-sm text-muted mt-1 block leading-relaxed">
            {assistantName} looks up this market and builds a clear picture of who to target before finding leads. Turn
            off to search from your description only.
          </span>
        </span>
      </button>

      {isLead && reps.length > 0 && (
        <label className="block">
          <span className="section-label mb-2 block">Owner</span>
          <select className={fieldClass} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="text-sm text-stop m-0">{error}</p>}

      <p className="text-xs text-dim m-0 leading-relaxed">
        One sitting: save → {researchMarket ? "research → who to target → " : ""}find leads. Nothing is sent to
        prospects. If Places or AI isn’t configured, the campaign still saves and you’ll see exactly what skipped.
      </p>

      <Btn variant="primary" size="lg" disabled={creatingProduct && !newProduct.name} onClick={submit}>
        Create campaign
      </Btn>
    </div>
  );
}
