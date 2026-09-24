import { getOrgSettings } from "@/server/settings";
import { LoginClient } from "@/components/LoginClient";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; callbackUrl?: string };
}) {
  const settings = await getOrgSettings().catch(() => null);

  const errorMessage =
    searchParams.error === "domain" || searchParams.error === "notinvited" || searchParams.error === "AccessDenied"
      ? "This account isn't part of NerdFlow. Ask Muqeet for an invite, or sign up with your @nerdflow.tech email."
      : searchParams.error === "CredentialsSignin"
        ? "Wrong email or password."
        : searchParams.error
          ? "Sign-in failed. Try again."
          : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-ink border border-rule mx-auto mb-4 flex items-center justify-center text-accent font-bold text-2xl">
            F
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">NerdFlow Sales Command Center v1</h1>
          <p className="text-muted text-sm">Sign in with your {settings?.allowedEmailDomain ?? "nerdflow"} account</p>
        </div>

        {errorMessage && (
          <div className="border border-stop bg-stop-soft text-stop rounded-lg px-3.5 py-2.5 text-sm mb-4">
            {errorMessage}
          </div>
        )}

        <LoginClient callbackUrl={searchParams.callbackUrl || "/today"} allowedDomain={settings?.allowedEmailDomain ?? "nerdflow.tech"} />
      </div>
    </div>
  );
}
