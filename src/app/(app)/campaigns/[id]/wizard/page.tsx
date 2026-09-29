import { getWizardState } from "@/server/actions/campaignWizard";
import { CampaignWizardClient } from "@/components/CampaignWizardClient";

export default async function CampaignWizardPage({ params }: { params: { id: string } }) {
  const state = await getWizardState(params.id);
  return (
    <CampaignWizardClient
      campaignId={params.id}
      campaignName={state.campaign.name}
      research={
        state.research
          ? {
              marketSnapshot: state.research.marketSnapshot,
              buyers: state.research.buyers as { type: string; why: string }[],
              painPoints: state.research.painPoints as string[],
              competitors: state.research.competitors as { name: string; gap: string }[],
              channels: state.research.channels as { channel: string; why: string }[],
              angles: state.research.angles as string[],
              sources: state.research.sources as { title: string; url: string }[],
              approved: Boolean(state.research.approvedAt),
            }
          : null
      }
      icp={
        state.icp
          ? {
              name: state.icp.name,
              businessTypes: state.icp.businessTypes as string[],
              keywords: state.icp.keywords as string[],
              sizeSignals: state.icp.sizeSignals,
              mustHave: state.icp.mustHave as string[],
              niceToHave: state.icp.niceToHave as string[],
              disqualifiers: state.icp.disqualifiers as string[],
              decisionMakerTitles: state.icp.decisionMakerTitles as string[],
            }
          : null
      }
    />
  );
}
