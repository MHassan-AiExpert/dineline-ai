import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const calls = await getStore().listCalls(150);
  // list view doesn't need full transcripts
  return NextResponse.json({ calls: calls.map((c) => ({ ...c, transcript: c.transcript.slice(0, 2), lines: c.transcript.length })) });
}
