"use client";

import { useState } from "react";
import { Btn } from "@/components/ui";
import { changePassword } from "@/server/actions/auth";

export function ChangePasswordClient() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    const res = await changePassword({ currentPassword, newPassword });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Current password
        <input type="password" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </label>
      <label className="block text-sm">
        New password
        <input type="password" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </label>
      <label className="block text-sm">
        Confirm new password
        <input type="password" className="w-full border border-rule rounded-lg px-3 py-2 bg-bg mt-1" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
      </label>
      {error && <p className="text-sm text-stop">{error}</p>}
      {done && <p className="text-sm text-go">Password updated.</p>}
      <Btn variant="primary" disabled={!currentPassword || !newPassword || !confirmPassword || submitting} onClick={submit}>
        {submitting ? "Saving…" : "Update password"}
      </Btn>
    </div>
  );
}
