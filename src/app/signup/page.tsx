import { getOrgSettings } from "@/server/settings";
import { SignupClient } from "@/components/SignupClient";

export default async function SignupPage() {
  const settings = await getOrgSettings().catch(() => null);
  const allowedDomain = settings?.allowedEmailDomain ?? "nerdflow.tech";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-ink border border-rule mx-auto mb-4 flex items-center justify-center text-accent font-bold text-2xl">
            F
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Create your account</h1>
          <p className="text-muted text-sm">Only @{allowedDomain} email addresses can sign up.</p>
        </div>
        <SignupClient allowedDomain={allowedDomain} />
      </div>
    </div>
  );
}
