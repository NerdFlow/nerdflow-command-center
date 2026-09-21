import { NextResponse, type NextRequest } from "next/server";

/**
 * Phase 4 stub. OpenClaw will POST discovered leads here with a bearer
 * token (OPENCLAW_INGEST_TOKEN) — see docs/SPEC.md 5.8 and
 * docs/AI_ENGINEER_BRIEF.md. Until the lead engine ships, this only
 * validates the token shape so the integration can be wired up early.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = process.env.OPENCLAW_INGEST_TOKEN;

  if (!expected) {
    return NextResponse.json({ error: "Lead ingest isn't configured yet (Phase 4)." }, { status: 501 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: "Lead ingest processing isn't implemented yet (Phase 4)." }, { status: 501 });
}
