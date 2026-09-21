"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Btn } from "@/components/ui";

type DevUser = { email: string; fullName: string; role: string; status: string };

export function LoginClient({
  googleConfigured,
  devLoginEnabled,
  devUsers,
  callbackUrl,
}: {
  googleConfigured: boolean;
  devLoginEnabled: boolean;
  devUsers: DevUser[];
  callbackUrl: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {googleConfigured && (
        <Btn
          variant="primary"
          className="w-full justify-center flex items-center gap-2"
          onClick={() => {
            setLoading("google");
            signIn("google", { callbackUrl });
          }}
          disabled={loading !== null}
        >
          {loading === "google" ? "Redirecting…" : "Continue with Google"}
        </Btn>
      )}

      {!googleConfigured && !devLoginEnabled && (
        <p className="text-sm text-muted text-center">
          No sign-in method is configured yet. Set GOOGLE_CLIENT_ID/SECRET or ALLOW_DEV_LOGIN in .env.local.
        </p>
      )}

      {devLoginEnabled && (
        <div className="border border-rule rounded-card p-4 bg-panel">
          <p className="text-xs text-muted mb-3">
            Dev login — stands in for Google sign-in until real OAuth is wired up. Pick a seeded user:
          </p>
          <div className="space-y-2">
            {devUsers.length === 0 && (
              <p className="text-sm text-muted">No users seeded yet. Run `npm run seed`.</p>
            )}
            {devUsers.map((u) => (
              <button
                key={u.email}
                disabled={loading !== null}
                onClick={() => {
                  setLoading(u.email);
                  signIn("dev-login", { email: u.email, callbackUrl });
                }}
                className="w-full text-left border border-rule rounded-lg px-3 py-2 hover:border-accent bg-bg disabled:opacity-55"
              >
                <div className="font-medium text-sm">{u.fullName}</div>
                <div className="text-xs text-muted">
                  {u.email} · {u.role}
                  {u.status === "invited" ? " · not yet signed in" : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
