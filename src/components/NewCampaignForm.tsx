"use client";

import { useState } from "react";
import { Btn } from "@/components/ui";
import { createProduct, createCampaign } from "@/server/actions/campaigns";

export function NewCampaignForm({
  products,
  reps,
  isManager,
}: {
  products: { id: string; name: string }[];
  reps: { id: string; fullName: string }[];
  isManager: boolean;
}) {
  const [creatingProduct, setCreatingProduct] = useState(products.length === 0);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [newProduct, setNewProduct] = useState({ name: "", type: "product" as "product" | "service", summary: "" });
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [goal, setGoal] = useState("");
  const [buyerGuess, setBuyerGuess] = useState("");
  const [ownerId, setOwnerId] = useState(reps[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      let pid = productId;
      if (creatingProduct) {
        const product = await createProduct(newProduct);
        pid = product.id;
      }
      await createCampaign({
        productId: pid,
        name: name || `${newProduct.name || products.find((p) => p.id === pid)?.name}: campaign`,
        ownerId: isManager ? ownerId : undefined,
        location,
        goal,
        buyerGuess,
      });
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setCreatingProduct(false)}
            disabled={products.length === 0}
            className={"text-sm px-3 py-1.5 rounded-lg border " + (!creatingProduct ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted")}
          >
            Existing product
          </button>
          <button
            type="button"
            onClick={() => setCreatingProduct(true)}
            className={"text-sm px-3 py-1.5 rounded-lg border " + (creatingProduct ? "border-accent bg-accent-soft font-semibold" : "border-rule text-muted")}
          >
            New product
          </button>
        </div>

        {creatingProduct ? (
          <div className="space-y-2.5">
            <input
              className="w-full border border-rule rounded-lg px-3 py-2 bg-bg"
              placeholder="Product or service name"
              value={newProduct.name}
              onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
            />
            <select
              className="w-full border border-rule rounded-lg px-3 py-2 bg-bg"
              value={newProduct.type}
              onChange={(e) => setNewProduct((p) => ({ ...p, type: e.target.value as "product" | "service" }))}
            >
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
            <textarea
              className="w-full border border-rule rounded-lg px-3 py-2 bg-bg"
              placeholder="Plain-language description"
              value={newProduct.summary}
              onChange={(e) => setNewProduct((p) => ({ ...p, summary: e.target.value }))}
            />
          </div>
        ) : (
          <select className="w-full border border-rule rounded-lg px-3 py-2 bg-bg" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <label className="block text-sm">
        Campaign name
        <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" placeholder="e.g. Buyer in place: missed-call angle" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="block text-sm">
        Location
        <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" placeholder="City or region" value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>

      <label className="block text-sm">
        Buyer guess (optional)
        <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={buyerGuess} onChange={(e) => setBuyerGuess(e.target.value)} />
      </label>

      <label className="block text-sm">
        What counts as a win (optional)
        <textarea className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>

      {isManager && reps.length > 0 && (
        <label className="block text-sm">
          Owner
          <select className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="text-sm text-stop">{error}</p>}

      <p className="text-xs text-muted">
        A starter playbook is generated from a template — edit every part of it on the Playbook tab afterward. AI-assisted
        generation arrives in Phase 2.
      </p>

      <Btn variant="primary" disabled={submitting || (creatingProduct && !newProduct.name)} onClick={submit}>
        {submitting ? "Creating…" : "Create campaign"}
      </Btn>
    </div>
  );
}
