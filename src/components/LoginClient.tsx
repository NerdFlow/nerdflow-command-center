"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { Btn } from "@/components/ui";

export function LoginClient({ callbackUrl, allowedDomain }: { callbackUrl: string; allowedDomain: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await signIn("credentials", { email, password, callbackUrl, redirect: false });
    if (res?.error) {
      setSubmitting(false);
      setError("Wrong email or password.");
      return;
    }
    window.location.href = res?.url || callbackUrl;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="block text-sm">
          Email
          <input
            type="email"
            className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
            placeholder={`you@${allowedDomain}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
      </div>

      {error && <p className="text-sm text-stop">{error}</p>}

      <Btn variant="primary" className="w-full justify-center" disabled={!email || !password || submitting} onClick={submit}>
        {submitting ? "Signing in…" : "Sign in"}
      </Btn>

      <p className="text-sm text-muted text-center">
        New to NerdFlow?{" "}
        <Link href="/signup" className="text-accent font-medium">
          Create an account
        </Link>
      </p>
    </div>
  );
}
