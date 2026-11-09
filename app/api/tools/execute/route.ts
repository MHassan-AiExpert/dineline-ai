import { NextResponse } from "next/server";
import { authorized, readJson, unauthorized } from "@/lib/http";
import { handleGatewayTool } from "@/lib/vapi";
import { TOOL_NAMES } from "@/lib/tools";

export const dynamic = "force-dynamic";

/**
 * Tool gateway for n8n workflows 01–03.
 * Body: { "name": "place_order", "args": {...}, "callerPhone": "+1...", "callId": "..." }
 */
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();
  const body = await readJson<{ name?: string }>(req);
  if (!body?.name || !TOOL_NAMES.includes(body.name)) return NextResponse.json({ ok: false, error: `Unknown tool. Use one of: ${TOOL_NAMES.join(", ")}` }, { status: 400 });
  return NextResponse.json(await handleGatewayTool(body));
}

export async function GET() {
  return NextResponse.json({ tools: TOOL_NAMES });
}
