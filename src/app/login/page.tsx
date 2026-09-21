import { prisma } from "@/server/db";
import { getOrgSettings } from "@/server/settings";
import { LoginClient } from "@/components/LoginClient";

const devLoginEnabled = process.env.ALLOW_DEV_LOGIN === "true";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const settings = await getOrgSettings().catch(() => null);
  const devUsers = devLoginEnabled
    ? await prisma.user.findMany({
        where: { status: { in: ["invited", "active"] } },
        orderBy: { role: "asc" },
        select: { email: true, fullName: true, role: true, status: true },
      })
    : [];

  const errorMessage =
    params.error === "domain" || params.error === "notinvited" || params.error === "AccessDenied"
      ? "This account isn't part of NerdFlow. Ask Muqeet for an invite."
      : params.error
        ? "Sign-in failed. Try again."
        : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-ink border border-rule mx-auto mb-4 flex items-center justify-center text-accent font-bold text-2xl">
            F
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">NerdFlow Sales Command Center</h1>
          <p className="text-muted text-sm">Sign in with your {settings?.allowedEmailDomain ?? "nerdflow"} account</p>
        </div>

        {errorMessage && (
          <div className="border border-stop bg-stop-soft text-stop rounded-lg px-3.5 py-2.5 text-sm mb-4">
            {errorMessage}
          </div>
        )}

        <LoginClient
          devLoginEnabled={devLoginEnabled}
          devUsers={devUsers}
          domain={settings?.allowedEmailDomain ?? "nerdflow.com"}
          callbackUrl={params.callbackUrl || "/today"}
        />
      </div>
    </div>
  );
}
