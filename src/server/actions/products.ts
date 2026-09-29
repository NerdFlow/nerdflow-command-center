"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireRole } from "@/server/auth";
import { prisma } from "@/server/db";
import type { ProductType, ProductStatus } from "@prisma/client";

export async function listProducts() {
  const user = await requireUser();
  return prisma.product.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, summary: true, website: true, status: true },
  });
}

export async function updateProduct(id: string, patch: { name: string; type: ProductType; summary: string; website?: string }) {
  const user = await requireUser();
  await prisma.product.updateMany({
    where: { id, organizationId: user.organizationId },
    data: { name: patch.name, type: patch.type, summary: patch.summary, website: patch.website || null },
  });
  revalidatePath("/settings");
}

export async function setProductStatus(id: string, status: ProductStatus) {
  const user = await requireUser();
  await prisma.product.updateMany({ where: { id, organizationId: user.organizationId }, data: { status } });
  revalidatePath("/settings");
}

export async function createProductInSettings(input: { name: string; type: ProductType; summary: string; website?: string }) {
  await requireRole(["lead"]);
  const user = await requireUser();
  const product = await prisma.product.create({
    data: { organizationId: user.organizationId, name: input.name, type: input.type, summary: input.summary, website: input.website || null },
  });
  revalidatePath("/settings");
  return product;
}
