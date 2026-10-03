"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { rerouteOpenFocusCards } from "@/server/focusRouting";
import { parseChannelCaps, parseChannelsWorked } from "@/lib/focusRouting";
import type { Channel } from "@prisma/client";

export async function saveProfile(input: {
  fullName: string;
  timezone: string;
  start: string;
  end: string;
  gmail?: string;
  instagram?: string;
  linkedin?: string;
  channelsWorked: Channel[];
  channelDailyCaps?: Partial<Record<"email" | "linkedin" | "call", number>>;
  markComplete?: boolean;
}) {
  const user = await requireUser();
  const before = await prisma.user.findUnique({
    where: { id: user.id },
    select: { channelsWorked: true, channelDailyCaps: true },
  });
  const channelsWorked = [...parseChannelsWorked(input.channelsWorked), ...input.channelsWorked.filter((channel) => channel === "instagram")];
  const channelDailyCaps = parseChannelCaps(input.channelDailyCaps ?? {});
  await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName: input.fullName,
      timezone: input.timezone,
      workingHours: { start: input.start, end: input.end, days: [1, 2, 3, 4, 5] },
      channelAccounts: {
        ...(input.gmail ? { gmail: input.gmail } : {}),
        ...(input.instagram ? { instagram: input.instagram } : {}),
        ...(input.linkedin ? { linkedin: input.linkedin } : {}),
      },
      channelsWorked,
      channelDailyCaps,
      ...(input.markComplete && !user.profileCompletedAt ? { profileCompletedAt: new Date() } : {}),
    },
  });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "user_channels_updated",
    entityType: "user",
    entityId: user.id,
    before: { channelsWorked: before?.channelsWorked ?? null, channelDailyCaps: before?.channelDailyCaps ?? null },
    after: { channelsWorked, channelDailyCaps },
  });
  await rerouteOpenFocusCards(user.organizationId, user.id);
  revalidatePath("/focus");
  revalidatePath("/today");
  revalidatePath("/profile");
}
