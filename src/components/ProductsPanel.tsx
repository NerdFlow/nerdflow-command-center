"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Chip, Panel } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { updateProduct, setProductStatus, createProductInSettings } from "@/server/actions/products";
import type { ProductType, ProductStatus } from "@prisma/client";

type ProductRow = { id: string; name: string; type: ProductType; summary: string; website: string | null; status: ProductStatus };

export function ProductsPanel({ products: initialProducts }: { products: ProductRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [products, setProducts] = useState(initialProducts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "product" as ProductType, summary: "", website: "" });

  function startEdit(p: ProductRow) {
    setEditingId(p.id);
    setForm({ name: p.name, type: p.type, summary: p.summary, website: p.website ?? "" });
  }

  async function save(id: string) {
    setBusy(id);
    setError(null);
    try {
      await updateProduct(id, form);
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...form } : p)));
      setEditingId(null);
      toast("Product saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(p: ProductRow) {
    const next: ProductStatus = p.status === "active" ? "archived" : "active";
    setBusy(p.id);
    try {
      await setProductStatus(p.id, next);
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: next } : x)));
      toast(next === "active" ? "Product activated." : "Product archived.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update status.");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setBusy("new");
    setError(null);
    try {
      const created = await createProductInSettings(form);
      setProducts((prev) => [...prev, { ...created, website: created.website ?? null }]);
      setAdding(false);
      setForm({ name: "", type: "product", summary: "", website: "" });
      toast("Product created.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create product.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-[17px] font-medium m-0">Products</h2>
        <Btn size="sm" onClick={() => { setAdding((a) => !a); setEditingId(null); }}>
          {adding ? "Cancel" : "+ Add product"}
        </Btn>
      </div>

      {error && <p className="text-sm text-stop mb-2">{error}</p>}

      {adding && (
        <div className="border border-rule rounded-lg p-3 mb-3 space-y-2">
          <input className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <select className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ProductType }))}>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
          <textarea className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" placeholder="Summary" value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
          <input className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" placeholder="Website (optional)" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          <Btn size="sm" variant="primary" disabled={!form.name || !form.summary} loading={busy === "new"} onClick={create}>
            {busy === "new" ? "Creating…" : "Create"}
          </Btn>
        </div>
      )}

      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className="border border-rule rounded-lg p-3">
            {editingId === p.id ? (
              <div className="space-y-2">
                <input className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                <select className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ProductType }))}>
                  <option value="product">Product</option>
                  <option value="service">Service</option>
                </select>
                <textarea className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
                <input className="w-full border border-rule rounded-lg px-2.5 py-1.5 bg-bg text-sm" placeholder="Website" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
                <div className="flex gap-2">
                  <Btn size="sm" variant="primary" loading={busy === p.id} onClick={() => save(p.id)}>
                    {busy === p.id ? "Saving…" : "Save"}
                  </Btn>
                  <Btn size="sm" variant="ghost" disabled={busy === p.id} onClick={() => setEditingId(null)}>
                    Cancel
                  </Btn>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="text-sm font-medium m-0">
                    {p.name} <Chip tone={p.status === "active" ? "go" : "default"}>{p.status}</Chip>
                  </p>
                  <p className="text-xs text-muted m-0">{p.type}</p>
                  <p className="text-sm m-0 mt-1">{p.summary}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="text-xs text-accent" onClick={() => startEdit(p)}>
                    Edit
                  </button>
                  <button className="text-xs text-muted disabled:opacity-40" disabled={busy === p.id} onClick={() => toggleStatus(p)}>
                    {busy === p.id ? "…" : p.status === "active" ? "Archive" : "Reactivate"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {products.length === 0 && <p className="text-sm text-muted">No products yet.</p>}
      </div>
    </Panel>
  );
}
