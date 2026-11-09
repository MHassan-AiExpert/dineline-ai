import { NextResponse } from "next/server";
import { authorized, readJson, unauthorized } from "@/lib/http";
import { handleVapiToolCalls } from "@/lib/vapi";

export const dynamic = "force-dynamic";

/** Vapi function tools point their server URL here (or at n8n workflows 01–03, which forward to /api/tools/execute). */
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();
  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  return NextResponse.json(await handleVapiToolCalls(body));
}
