import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getDefaultOrgId } from "@/server/org";
import { getOrgSettings } from "@/server/settings";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const hash = promisify(scrypt);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const domain = (await getOrgSettings()).allowedEmailDomain.toLowerCase();

  if (!email || !fullName || password.length < 8 || email.split("@")[1] !== domain) {
    return NextResponse.json({ error: `Use a valid ${domain} email and a password with at least 8 characters.` }, { status: 400 });
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${(await hash(password, salt, 64) as Buffer).toString("hex")}`;
  const organizationId = await getDefaultOrgId();
  await prisma.user.create({ data: { email, fullName, passwordHash, organizationId, status: "active" } });
  return NextResponse.json({ ok: true });
}
