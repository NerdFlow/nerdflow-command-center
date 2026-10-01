import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const IMPERSONATION_COOKIE = "nf_impersonate";

const MAX_AGE_SECONDS = 8 * 60 * 60;

function secret() {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is not set");
  return value;
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function readImpersonationCookie(value: string | undefined): { actorId: string; targetId: string } | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as { actorId?: unknown; targetId?: unknown };
    if (typeof parsed.actorId !== "string" || typeof parsed.targetId !== "string") return null;
    return { actorId: parsed.actorId, targetId: parsed.targetId };
  } catch {
    return null;
  }
}

export function setImpersonationCookie(actorId: string, targetId: string) {
  const body = Buffer.from(JSON.stringify({ actorId, targetId })).toString("base64url");
  cookies().set(IMPERSONATION_COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearImpersonationCookie() {
  cookies().delete(IMPERSONATION_COOKIE);
}
