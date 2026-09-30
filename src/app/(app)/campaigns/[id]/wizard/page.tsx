import { redirect } from "next/navigation";

/** Multi-step research/ICP/playbook wizard retired — create flow handles research as one toggle. */
export default function CampaignWizardRedirect({ params }: { params: { id: string } }) {
  redirect(`/campaigns/${params.id}`);
}
