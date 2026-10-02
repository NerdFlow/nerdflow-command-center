import { requireUser } from "@/server/auth";
import { getOrgSettings } from "@/server/settings";
import { loadFocusBoard } from "@/server/todayBoard";
import { FocusClient } from "@/components/FocusClient";
import type { Channel } from "@prisma/client";

const CHANNELS: Channel[] = ["call", "email", "instagram", "linkedin"];

export default async function FocusPage({ searchParams }: { searchParams: { channel?: string } }) {
  const user = await requireUser();
  const [board, settings] = await Promise.all([loadFocusBoard(user.id, user.organizationId), getOrgSettings()]);
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
      suppressCall={board.suppressCall}
      sync={board.sync}
    />
  );
}
