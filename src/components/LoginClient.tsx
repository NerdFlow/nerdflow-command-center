"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Btn } from "@/components/ui";

type DevUser = { email: string; fullName: string; role: string; status: string };

export function LoginClient({ devLoginEnabled, devUsers, callbackUrl, domain }: { devLoginEnabled: boolean; devUsers: DevUser[]; callbackUrl: string; domain: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", fullName: "", password: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    if (mode === "signup") {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not create account."); setLoading(false); return; }
    }
    const result = await signIn("password", { email: form.email, password: form.password, callbackUrl, redirect: false });
    if (result?.error) { setError("Email or password is incorrect."); setLoading(false); return; }
    window.location.href = callbackUrl;
  }

  return <div className="space-y-4">
    {error && <p className="border border-stop bg-stop-soft text-stop rounded-lg px-3 py-2 text-sm">{error}</p>}
    <form onSubmit={submit} className="space-y-3">
      {mode === "signup" && <input required className="w-full border border-rule rounded-lg px-3 py-2.5 bg-bg" placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />}
      <input required type="email" className="w-full border border-rule rounded-lg px-3 py-2.5 bg-bg" placeholder={`you@${domain}`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input required minLength={8} type="password" className="w-full border border-rule rounded-lg px-3 py-2.5 bg-bg" placeholder="Password (8+ characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <Btn variant="primary" className="w-full justify-center" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</Btn>
    </form>
    <button className="w-full text-sm text-accent font-medium" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
      {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
    </button>
    {devLoginEnabled && <div className="border border-rule rounded-card p-4 bg-panel"><p className="text-xs text-muted mb-3">Developer access</p>{devUsers.map((u) => <button key={u.email} onClick={() => { setLoading(true); signIn("dev-login", { email: u.email, callbackUrl }); }} className="w-full text-left border border-rule rounded-lg px-3 py-2 hover:border-accent bg-bg"><div className="font-medium text-sm">{u.fullName}</div><div className="text-xs text-muted">{u.email} · {u.role}</div></button>)}</div>}
  </div>;
}
