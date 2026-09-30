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
    <div className="min-h-screen flex items-center justify-center app-atmosphere px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-wordmark-dark.png" alt="NerdFlow" className="brand-logo-dark h-10 w-auto" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-wordmark-light.png" alt="NerdFlow" className="brand-logo-light h-10 w-auto" />
          </div>
          <p className="text-muted text-sm m-0">Your sales cockpit. Sign in to start the day.</p>
        </div>

        {errorMessage && (
          <div className="border border-stop/40 bg-stop-soft text-stop rounded-xl px-3.5 py-2.5 text-sm mb-4">{errorMessage}</div>
        )}

        <div className="rounded-card border border-rule bg-panel p-5 shadow-soft">
          <LoginClient callbackUrl={searchParams.callbackUrl || "/today"} allowedDomain={settings?.allowedEmailDomain ?? "nerdflow.tech"} />
        </div>
      </div>
    </div>
  );
}
