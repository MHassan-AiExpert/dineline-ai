import { NextResponse } from "next/server";
import { computeAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  return NextResponse.json(await computeAnalytics(days));
}
