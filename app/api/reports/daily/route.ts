import { NextResponse } from "next/server";
import { computeAnalytics, dailyReportText } from "@/lib/analytics";
import { getStore } from "@/lib/store";
import { authorized, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Used by n8n workflow 07: returns the day's numbers and a ready-to-send message. */
export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();
  const [analytics, settings] = await Promise.all([computeAnalytics(1), getStore().getSettings()]);
  return NextResponse.json({ text: dailyReportText(analytics, settings), today: analytics.today, topItems: analytics.topItems });
}
