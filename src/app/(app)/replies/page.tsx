import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { RepliesClient } from "@/components/RepliesClient";

export default async function RepliesPage() {
  const user = await requireUser();
  const replies = await prisma.reply.findMany({
    where: { status: "open", lead: { ownerId: user.role === "rep" ? user.id : undefined, organizationId: user.organizationId } },
    include: { lead: true },
    orderBy: { receivedAt: "desc" },
  });

  return (
    <RepliesClient
      replies={replies.map((r) => ({
        id: r.id,
        businessName: r.lead.businessName,
        channel: r.channel,
        label: r.label,
        text: r.text,
        receivedAt: r.receivedAt.toISOString(),
      }))}
    />
  );
}
