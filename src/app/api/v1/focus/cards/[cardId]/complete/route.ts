import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { preflightComplete } from "@/lib/focusIngest";
import { applyFocusIngestComplete } from "@/server/focusIngest";
import { FocusIngestError } from "@/server/pipelineTodayOutcome";

/**
 * Mark one ingested Focus card done, skipped, or needing follow-up.
 * Uses the same pipeline_today_rows write as Focus. Unknown card → 404.
 * The same outcome again is idempotent. A different outcome on a finished card is 409.
 */
export async function POST(req: NextRequest, context: { params: { cardId: string } }) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Validation failed", issues: [{ path: "", message: "Body must be JSON" }] },
      { status: 422 },
    );
  }

  const pre = preflightComplete({
    authorization: req.headers.get("authorization"),
    secret: process.env.FOCUS_INGEST_SECRET,
    body: payload,
  });
  if (!pre.ok) return NextResponse.json(pre.body, { status: pre.status });

  let cardId = context.params.cardId;
  try {
    cardId = decodeURIComponent(cardId);
  } catch {
    return NextResponse.json({ error: "Unknown card" }, { status: 404 });
  }

  try {
    const result = await applyFocusIngestComplete({
      cardId,
      outcome: pre.outcome,
      dueAt: pre.dueAt,
      note: pre.note,
      occurredAt: pre.occurredAt,
    });
    revalidatePath("/focus");
    revalidatePath("/today");
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FocusIngestError) {
      return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
    }
    console.error("[focus-ingest] complete failed");
    return NextResponse.json({ error: "Couldn't record that outcome" }, { status: 500 });
  }
}
