import { NextResponse } from "next/server";
import { authorized, readJson, unauthorized } from "@/lib/http";
import { handleEndOfCallReport, handleVapiToolCalls } from "@/lib/vapi";

export const dynamic = "force-dynamic";

/**
 * Vapi server URL for call events (directly, or forwarded by n8n workflow 06).
 * Stores end-of-call reports; also answers tool-calls if they are sent here.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();
  const body = await readJson<{ message?: { type?: string } }>(req);
  const type = body?.message?.type;
  if (type === "tool-calls") return NextResponse.json(await handleVapiToolCalls(body));
  if (type === "end-of-call-report") {
    const record = await handleEndOfCallReport(body);
    return NextResponse.json({ ok: true, callId: record.id, outcome: record.outcome });
  }
  // status-update, transcript, hang, speech-update… acknowledged and ignored
  return NextResponse.json({ ok: true, ignored: type ?? "unknown" });
}
