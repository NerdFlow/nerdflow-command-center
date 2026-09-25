"use server";

import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
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
  markComplete?: boolean;
}) {
  const user = await requireUser();
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
      channelsWorked: input.channelsWorked,
      ...(input.markComplete && !user.profileCompletedAt ? { profileCompletedAt: new Date() } : {}),
    },
  });
}
