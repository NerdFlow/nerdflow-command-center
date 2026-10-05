import { requireUser } from "@/server/auth";
import { getOrgSettings } from "@/server/settings";
import { loadFocusBoard } from "@/server/todayBoard";
import { loadOutreachForFocus } from "@/server/kb/load";
import { FocusClient } from "@/components/FocusClient";
import type { Channel } from "@prisma/client";

const CHANNELS: Channel[] = ["call", "email", "instagram", "linkedin"];

export default async function FocusPage({ searchParams }: { searchParams: { channel?: string } }) {
  const user = await requireUser();
  const [board, settings, outreach] = await Promise.all([
    loadFocusBoard(user.id, user.organizationId, {
      channels: ((user.channelsWorked as string[] | null) ?? ["call", "email", "instagram", "linkedin"]) as Channel[],
      ownerName: user.fullName,
    }),
    getOrgSettings(),
    loadOutreachForFocus(user.organizationId, user.id),
  ]);
  const draftStamp = Object.entries(outreach.drafts)
    .map(([key, draft]) => `${key}:${draft.regenerateCount}:${draft.body.length}:${draft.subject.length}`)
    .sort()
    .join("|");
  const allowedChannels = ((user.channelsWorked as string[] | null) ?? ["call", "email", "instagram", "linkedin"]) as Channel[];
  const raw = searchParams.channel;
  const initialChannel: Channel | "all" | undefined =
    raw === "all" ? "all" : raw && CHANNELS.includes(raw as Channel) ? (raw as Channel) : undefined;
  const assistantName = settings.assistantName === "Sales Pipeline" ? "Flow" : settings.assistantName || "Flow";

  return (
    <FocusClient
      key={board.sync?.lastSyncAt ?? "focus"}
      initialCards={board.cards}
      coachLeads={board.coachLeads}
      assistantName={assistantName}
      me={user.fullName}
      repTimezone={user.timezone}
      allowedChannels={allowedChannels}
      initialChannel={initialChannel}
      sync={board.sync}
      repEmail={user.email}
      outreach={{
        catalog: outreach.catalog,
        signatures: outreach.signatures,
        postalAddress: outreach.postalAddress,
        optOutLine: outreach.optOutLine,
        killSwitch: outreach.killSwitch,
        dailyCap: outreach.dailyCap,
        usedToday: outreach.usage.draftsToday,
        drafts: outreach.drafts,
        draftStamp,
      }}
    />
  );
}
