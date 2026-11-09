import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { reservationText, sendCustomerText } from "@/lib/notify";
import type { ReservationStatus } from "@/lib/types";
import { findFreeTable } from "@/lib/tools";

const STATUSES: ReservationStatus[] = ["booked", "seated", "completed", "cancelled", "no_show", "waitlist"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: ReservationStatus; tableId?: string };
  if (body.status && !STATUSES.includes(body.status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  const store = getStore();
  const before = await store.getReservation(id);
  if (!before) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const patch: Record<string, unknown> = {};
  if (body.status) patch.status = body.status;
  if (body.tableId) patch.tableId = body.tableId;
  if (before.status === "waitlist" && body.status === "booked" && !body.tableId) {
    const table = await findFreeTable(before.date, before.time, before.partySize, before.id);
    if (!table) return NextResponse.json({ error: "No table is free at that time yet." }, { status: 409 });
    patch.tableId = table.id;
    patch.seating = table.area;
  }
  const reservation = await store.updateReservation(before.id, patch);
  if (reservation && body.status === "cancelled" && before.status !== "cancelled") {
    await sendCustomerText({ kind: "reservation_cancelled", to: reservation.customerPhone, body: reservationText(reservation, await store.getSettings(), "reservation_cancelled"), relatedId: reservation.id });
  }
  if (reservation && before.status === "waitlist" && body.status === "booked") {
    await sendCustomerText({ kind: "reservation_confirmation", to: reservation.customerPhone, body: reservationText(reservation, await store.getSettings(), "reservation_confirmation"), relatedId: reservation.id });
  }
  return NextResponse.json({ reservation });
}
