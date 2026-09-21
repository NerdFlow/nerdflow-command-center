import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const demoCampaigns = await prisma.campaign.findMany({ where: { isDemo: true }, select: { id: true } });
  const campaignIds = demoCampaigns.map((c) => c.id);

  const demoLeads = await prisma.lead.findMany({ where: { OR: [{ isDemo: true }, { campaignId: { in: campaignIds } }] }, select: { id: true } });
  const leadIds = demoLeads.map((l) => l.id);

  const demoDeals = await prisma.deal.findMany({ where: { OR: [{ isDemo: true }, { leadId: { in: leadIds } }] }, select: { id: true } });
  const dealIds = demoDeals.map((d) => d.id);

  await prisma.touch.deleteMany({ where: { OR: [{ leadId: { in: leadIds } }, { dealId: { in: dealIds } }] } });
  await prisma.conversation.deleteMany({ where: { OR: [{ leadId: { in: leadIds } }, { dealId: { in: dealIds } }] } });
  await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.campaignNote.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.leadSourceRun.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.knowledgeDoc.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  await prisma.product.deleteMany({ where: { isDemo: true } });

  console.log(`Cleared ${campaignIds.length} demo campaigns, ${leadIds.length} leads, ${dealIds.length} deals.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
