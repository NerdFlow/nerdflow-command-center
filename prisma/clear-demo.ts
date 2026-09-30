import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

/**
 * Removes is_demo seed data. A campaign/product flagged is_demo can end up
 * genuinely real over time (e.g. a seeded campaign gets real leads added to
 * it through actual use) - in that case the flag is just stale, and this
 * un-flags it instead of deleting it. A campaign/product only gets deleted
 * outright if it turns out to still be fully isolated (no real leads, no
 * other real campaign depending on it). Individual is_demo leads are always
 * safe to delete regardless of their campaign's state.
 */
async function main() {
  const demoCampaigns = await prisma.campaign.findMany({ where: { isDemo: true } });
  const demoProducts = await prisma.product.findMany({ where: { isDemo: true } });

  const campaignsToUnflag: typeof demoCampaigns = [];
  const campaignIdsToDelete: string[] = [];
  for (const c of demoCampaigns) {
    const realLeadCount = await prisma.lead.count({ where: { campaignId: c.id, isDemo: false } });
    if (realLeadCount > 0) campaignsToUnflag.push(c);
    else campaignIdsToDelete.push(c.id);
  }

  const productsToUnflag: typeof demoProducts = [];
  const productIdsToDelete: string[] = [];
  for (const p of demoProducts) {
    const realCampaignCount = await prisma.campaign.count({ where: { productId: p.id, isDemo: false } });
    // A product used by a campaign we're about to unflag also counts as "real now".
    const willBeRealCampaignCount = await prisma.campaign.count({
      where: { productId: p.id, id: { in: campaignsToUnflag.map((c) => c.id) } },
    });
    if (realCampaignCount > 0 || willBeRealCampaignCount > 0) productsToUnflag.push(p);
    else productIdsToDelete.push(p.id);
  }

  const demoLeads = await prisma.lead.findMany({ where: { isDemo: true } });
  const leadIds = demoLeads.map((l) => l.id);
  const demoDeals = await prisma.deal.findMany({ where: { OR: [{ isDemo: true }, { leadId: { in: leadIds } }] } });
  const dealIds = demoDeals.map((d) => d.id);
  const demoTouches = await prisma.touch.findMany({ where: { OR: [{ leadId: { in: leadIds } }, { dealId: { in: dealIds } }] } });
  const demoConversations = await prisma.conversation.findMany({ where: { OR: [{ leadId: { in: leadIds } }, { dealId: { in: dealIds } }] } });

  // Row-level snapshot before deleting anything (targeted delete, not a
  // schema migration, so this is the appropriate backup for this operation).
  const outDir = path.join(process.cwd(), "backups");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `demo-data-snapshot-${Date.now()}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        campaignsDeleted: demoCampaigns.filter((c) => campaignIdsToDelete.includes(c.id)),
        campaignsUnflagged: campaignsToUnflag,
        productsDeleted: demoProducts.filter((p) => productIdsToDelete.includes(p.id)),
        productsUnflagged: productsToUnflag,
        leads: demoLeads,
        deals: demoDeals,
        touches: demoTouches,
        conversations: demoConversations,
      },
      null,
      2,
    ),
  );
  console.log(`Snapshot written to ${outFile}`);

  await prisma.touch.deleteMany({ where: { id: { in: demoTouches.map((t) => t.id) } } });
  await prisma.conversation.deleteMany({ where: { id: { in: demoConversations.map((c) => c.id) } } });
  await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });

  if (campaignIdsToDelete.length > 0) {
    await prisma.campaignNote.deleteMany({ where: { campaignId: { in: campaignIdsToDelete } } });
    await prisma.leadSourceRun.deleteMany({ where: { campaignId: { in: campaignIdsToDelete } } });
    await prisma.knowledgeDoc.deleteMany({ where: { campaignId: { in: campaignIdsToDelete } } });
    await prisma.campaign.deleteMany({ where: { id: { in: campaignIdsToDelete } } });
  }
  for (const c of campaignsToUnflag) {
    await prisma.campaign.update({ where: { id: c.id }, data: { isDemo: false } });
  }
  await prisma.product.deleteMany({ where: { id: { in: productIdsToDelete } } });
  for (const p of productsToUnflag) {
    await prisma.product.update({ where: { id: p.id }, data: { isDemo: false } });
  }

  console.log(
    `Deleted: ${leadIds.length} leads, ${dealIds.length} deals, ${demoTouches.length} touches, ${demoConversations.length} conversations, ${campaignIdsToDelete.length} campaigns, ${productIdsToDelete.length} products.`,
  );
  if (campaignsToUnflag.length > 0) {
    console.log(`Un-flagged as real (had real data attached): ${campaignsToUnflag.map((c) => c.name).join(", ")}`);
  }
  if (productsToUnflag.length > 0) {
    console.log(`Un-flagged as real (still referenced by a real campaign): ${productsToUnflag.map((p) => p.name).join(", ")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
