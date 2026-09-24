import { requireUser } from "@/server/auth";
import { ChangePasswordClient } from "@/components/ChangePasswordClient";
import { Panel } from "@/components/ui";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div>
      <h1 className="text-[28px] tracking-tight mb-1.5">Your account</h1>
      <p className="text-muted mb-6">{user.email}</p>
      <Panel className="max-w-sm">
        <h2 className="text-[17px] font-medium mb-3">Change password</h2>
        <ChangePasswordClient />
      </Panel>
    </div>
  );
}
