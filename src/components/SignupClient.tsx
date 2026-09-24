"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { Btn } from "@/components/ui";
import { signUp } from "@/server/actions/auth";

export function SignupClient({ allowedDomain }: { allowedDomain: string }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const res = await signUp({ fullName, email, password });
    if (!res.ok) {
      setSubmitting(false);
      setError(res.error);
      return;
    }
    const signInRes = await signIn("credentials", { email, password, callbackUrl: "/today", redirect: false });
    if (signInRes?.error) {
      setSubmitting(false);
      setError("Account created — go to the sign-in page and log in.");
      return;
    }
    window.location.href = signInRes?.url || "/today";
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="block text-sm">
          Full name
          <input className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block text-sm">
          Email
          <input
            type="email"
            className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
            placeholder={`you@${allowedDomain}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Password
          <input type="password" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm">
          Confirm password
          <input
            type="password"
            className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>
      </div>

      {error && <p className="text-sm text-stop">{error}</p>}

      <Btn
        variant="primary"
        className="w-full justify-center"
        disabled={!fullName || !email || !password || !confirmPassword || submitting}
        onClick={submit}
      >
        {submitting ? "Creating account…" : "Create account"}
      </Btn>

      <p className="text-sm text-muted text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-accent font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
