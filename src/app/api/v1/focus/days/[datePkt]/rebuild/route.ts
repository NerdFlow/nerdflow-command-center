import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { preflightRebuild } from "@/lib/focusIngest";
import { describeFocusIngestFailure } from "@/lib/focusIngestTx";
import { applyFocusIngestRebuild } from "@/server/focusIngest";
import { FocusIngestError } from "@/server/pipelineTodayOutcome";

/**
 * Replace one day's open Focus cards and route each card by channel.
 * Bearer FOCUS_INGEST_SECRET. Owner is an optional hint. Same-day Done stays
 * unless force=true. Repeating the same body is safe. Nothing is sent.
 *
 *   curl -sS -X PUT "https://sales.nerdflow.cloud/api/v1/focus/days/2026-10-02/rebuild" \
 *     -H "Authorization: Bearer $FOCUS_INGEST_SECRET" \
 *     -H "Content-Type: application/json" \
 *     --data @today.json
 */
async function rebuild(req: NextRequest, datePkt: string) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Validation failed", issues: [{ path: "", message: "Body must be JSON" }] },
      { status: 422 },
    );
  }

  const pre = preflightRebuild({
    authorization: req.headers.get("authorization"),
    secret: process.env.FOCUS_INGEST_SECRET,
    pathDate: datePkt,
    queryForce: req.nextUrl.searchParams.get("force"),
    body: payload,
  });
  if (!pre.ok) return NextResponse.json(pre.body, { status: pre.status });

  try {
    const result = await applyFocusIngestRebuild(pre);
    revalidatePath("/focus");
    revalidatePath("/today");
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FocusIngestError) {
      return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
    }
    const failure = describeFocusIngestFailure(err, "Couldn't save the Today queue");
    // Code, name, and message only. Invocation args are omitted so card bodies stay out of the log.
    console.error("[focus-ingest] rebuild failed", failure.log);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

export async function PUT(req: NextRequest, context: { params: { datePkt: string } }) {
  return rebuild(req, context.params.datePkt);
}

export async function POST(req: NextRequest, context: { params: { datePkt: string } }) {
  return rebuild(req, context.params.datePkt);
}
