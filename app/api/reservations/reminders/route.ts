import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { localParts, zonedToDate } from "@/lib/time";
import { reservationText, sendCustomerText } from "@/lib/notify";
import { authorized, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

const WINDOW_MINUTES = 120;

async function dueReminders() {
  const store = getStore();
  const settings = await store.getSettings();
  const today = localParts(settings.timezone).date;
  const list = await store.listReservations({ from: today, to: today });
  const now = Date.now();
  return {
    settings,
    due: list.filter((r) => {
      if (r.status !== "booked" || r.reminderSent) return false;
      const at = zonedToDate(r.date, r.time, settings.timezone).getTime();
      return at > now && at - now <= WINDOW_MINUTES * 60000;
    }),
  };
}

/** n8n workflow 05 (option A): fetch due reminders with ready-to-send text, then POST {ids} to mark them sent. */
export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();
  const { settings, due } = await dueReminders();
  return NextResponse.json({
    reminders: due.map((r) => ({ id: r.id, code: r.code, to: r.customerPhone, name: r.customerName, time: r.time, partySize: r.partySize, body: reservationText(r, settings, "reservation_reminder") })),
  });
}

/**
 * POST {"ids": [...]}          → mark those reminders as sent (n8n already texted them)
 * POST {"action": "send"}      → the app sends all due reminders itself and marks them
 */
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { ids?: string[]; action?: string };
  const store = getStore();
  if (Array.isArray(body.ids)) {
    for (const id of body.ids) await store.updateReservation(id, { reminderSent: true });
    return NextResponse.json({ marked: body.ids.length });
  }
  if (body.action === "send") {
    const { settings, due } = await dueReminders();
    for (const r of due) {
      await sendCustomerText({ kind: "reservation_reminder", to: r.customerPhone, body: reservationText(r, settings, "reservation_reminder"), relatedId: r.id });
      await store.updateReservation(r.id, { reminderSent: true });
    }
    return NextResponse.json({ sent: due.length });
  }
  return NextResponse.json({ error: "Send {ids: [...]} or {action: \"send\"}." }, { status: 400 });
}
