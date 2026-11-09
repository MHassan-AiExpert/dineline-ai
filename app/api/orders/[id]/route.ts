import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { orderStatusText, sendCustomerText } from "@/lib/notify";
import type { OrderStatus } from "@/lib/types";

const STATUSES: OrderStatus[] = ["new", "preparing", "ready", "out_for_delivery", "completed", "cancelled"];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getStore().getOrder(id);
  return order ? NextResponse.json({ order }) : NextResponse.json({ error: "Order not found." }, { status: 404 });
}

/** Kitchen board moves a ticket; customers get a text on ready / out for delivery / cancelled. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: OrderStatus };
  if (!body.status || !STATUSES.includes(body.status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  const store = getStore();
  const order = await store.updateOrder(id, { status: body.status });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const text = orderStatusText(order, await store.getSettings());
  const notification = text ? await sendCustomerText({ kind: "order_status", to: order.customerPhone, body: text, relatedId: order.id, payload: { status: order.status, orderNumber: order.orderNumber } }) : null;
  return NextResponse.json({ order, notification });
}
