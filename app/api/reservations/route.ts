import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { addDays, localParts } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const store = getStore();
  const settings = await store.getSettings();
  const today = localParts(settings.timezone).date;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? addDays(today, -1);
  const to = url.searchParams.get("to") ?? addDays(today, 7);
  const [reservations, tables] = await Promise.all([store.listReservations({ from, to }), store.listTables()]);
  return NextResponse.json({ today, reservations, tables });
}
