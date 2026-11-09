import type { NotificationRecord, Order, Reservation, Settings } from "./types";
import { getStore } from "./store";
import { prettyDate, to12h } from "./time";

type Kind = NotificationRecord["kind"];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function readyTime(order: Order, settings: Settings) {
  return new Date(order.readyAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: settings.timezone,
  });
}

export function orderConfirmationText(order: Order, settings: Settings) {
  const items = order.items.map((i) => `${i.quantity}x ${i.name}${i.size ? ` (${i.size})` : ""}`).join(", ");
  const how = order.type === "delivery" ? `Delivery to ${order.address}` : "Pickup";
  return `${settings.restaurantName}: order #${order.orderNumber} confirmed. ${items}. Total $${order.total.toFixed(2)}. ${how}, ready around ${readyTime(order, settings)}. Reply STOP to opt out.`;
}

export function orderStatusText(order: Order, settings: Settings): string | null {
  switch (order.status) {
    case "ready":
      return `${settings.restaurantName}: order #${order.orderNumber} is ready for pickup at ${settings.address.split(",")[0]}. See you soon!`;
    case "out_for_delivery":
      return `${settings.restaurantName}: order #${order.orderNumber} is on its way. It should arrive in 15-25 minutes.`;
    case "cancelled":
      return `${settings.restaurantName}: order #${order.orderNumber} was cancelled. Call ${settings.phone} with any questions.`;
    default:
      return null;
  }
}

export function reservationText(r: Reservation, settings: Settings, kind: Kind) {
  const when = `${prettyDate(r.date)} at ${to12h(r.time)}`;
  if (kind === "reservation_reminder")
    return `${settings.restaurantName}: see you today at ${to12h(r.time)} for ${r.partySize}. Need to change it? Call ${settings.phone}. Code ${r.code}.`;
  if (kind === "reservation_cancelled")
    return `${settings.restaurantName}: your booking for ${r.partySize} on ${when} is cancelled. Code ${r.code}.`;
  if (r.status === "waitlist")
    return `${settings.restaurantName}: you're on the waitlist for ${r.partySize} on ${when}. We'll text you if a table opens. Ref ${r.code}.`;
  return `${settings.restaurantName}: table for ${r.partySize} booked for ${when}. Confirmation code ${r.code}. ${settings.address}.`;
}

/**
 * Sends a customer text. Order of preference:
 *  1. n8n workflow 04 (N8N_NOTIFY_WEBHOOK_URL) — n8n sends via Twilio SMS/WhatsApp
 *  2. Twilio directly (TWILIO_* vars)
 *  3. Demo mode — recorded and shown in the dashboard outbox only
 */
export async function sendCustomerText(input: {
  kind: Kind;
  to: string;
  body: string;
  relatedId: string | null;
  payload?: Record<string, unknown>;
}): Promise<NotificationRecord> {
  const store = getStore();
  const channel = process.env.TWILIO_CHANNEL === "whatsapp" ? "whatsapp" : "sms";
  const record: NotificationRecord = {
    id: uid("n"),
    kind: input.kind,
    channel,
    to: input.to,
    body: input.body,
    status: "simulated",
    provider: "demo",
    relatedId: input.relatedId,
    createdAt: new Date().toISOString(),
  };

  const n8nUrl = process.env.N8N_NOTIFY_WEBHOOK_URL;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  try {
    if (n8nUrl) {
      const res = await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dineline-secret": process.env.DINELINE_WEBHOOK_SECRET ?? "" },
        body: JSON.stringify({ event: input.kind, channel, to: input.to, body: input.body, relatedId: input.relatedId, ...input.payload }),
        signal: AbortSignal.timeout(8000),
      });
      record.provider = "n8n";
      record.status = res.ok ? "queued" : "failed";
    } else if (sid && token && (process.env.TWILIO_FROM_NUMBER || channel === "whatsapp")) {
      const from =
        channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886" : process.env.TWILIO_FROM_NUMBER!;
      const to = channel === "whatsapp" ? `whatsapp:${input.to}` : input.to;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: from, To: to, Body: input.body }),
        signal: AbortSignal.timeout(8000),
      });
      record.provider = "twilio";
      record.status = res.ok ? "sent" : "failed";
    }
  } catch {
    record.status = "failed";
  }

  await store.createNotification(record);
  return record;
}
