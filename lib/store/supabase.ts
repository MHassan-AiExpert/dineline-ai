import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CallRecord,
  Customer,
  DiningTable,
  MenuItem,
  NotificationRecord,
  Order,
  Reservation,
  Settings,
} from "../types";
import { DEFAULT_SETTINGS } from "../seed";
import type { OrderQuery, ReservationQuery, Store } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const digits = (p: string) => p.replace(/\D/g, "").slice(-10);

// ── row mappers ────────────────────────────────────────────────────────
const menuFrom = (r: Row): MenuItem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  description: r.description,
  price: num(r.price),
  sizes: r.sizes ?? [],
  addOns: r.add_ons ?? [],
  allergens: r.allergens ?? [],
  dietary: r.dietary ?? [],
  spicy: r.spicy ?? 0,
  isAvailable: r.is_available,
  isUpsell: r.is_upsell,
  popular: r.popular,
});
const menuTo = (m: Partial<MenuItem>): Row => {
  const r: Row = {};
  if (m.name !== undefined) r.name = m.name;
  if (m.category !== undefined) r.category = m.category;
  if (m.description !== undefined) r.description = m.description;
  if (m.price !== undefined) r.price = m.price;
  if (m.sizes !== undefined) r.sizes = m.sizes;
  if (m.addOns !== undefined) r.add_ons = m.addOns;
  if (m.allergens !== undefined) r.allergens = m.allergens;
  if (m.dietary !== undefined) r.dietary = m.dietary;
  if (m.spicy !== undefined) r.spicy = m.spicy;
  if (m.isAvailable !== undefined) r.is_available = m.isAvailable;
  if (m.isUpsell !== undefined) r.is_upsell = m.isUpsell;
  if (m.popular !== undefined) r.popular = m.popular;
  return r;
};

const customerFrom = (r: Row): Customer => ({
  id: r.id,
  phone: r.phone,
  name: r.name,
  totalOrders: r.total_orders,
  lastOrderId: r.last_order_id,
  notes: r.notes,
  createdAt: r.created_at,
});

const orderFrom = (r: Row): Order => ({
  id: r.id,
  orderNumber: r.order_number,
  customerId: r.customer_id,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  type: r.type,
  address: r.address,
  items: r.items ?? [],
  subtotal: num(r.subtotal),
  tax: num(r.tax),
  deliveryFee: num(r.delivery_fee),
  total: num(r.total),
  status: r.status,
  channel: r.channel,
  upsellAccepted: r.upsell_accepted,
  readyAt: r.ready_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export const orderTo = (o: Partial<Order>): Row => {
  const r: Row = {};
  const map: [keyof Order, string][] = [
    ["id", "id"], ["orderNumber", "order_number"], ["customerId", "customer_id"], ["customerName", "customer_name"],
    ["customerPhone", "customer_phone"], ["type", "type"], ["address", "address"], ["items", "items"],
    ["subtotal", "subtotal"], ["tax", "tax"], ["deliveryFee", "delivery_fee"], ["total", "total"],
    ["status", "status"], ["channel", "channel"], ["upsellAccepted", "upsell_accepted"], ["readyAt", "ready_at"],
    ["createdAt", "created_at"],
  ];
  for (const [k, col] of map) if (o[k] !== undefined) r[col] = o[k];
  return r;
};

const reservationFrom = (r: Row): Reservation => ({
  id: r.id,
  code: r.code,
  customerId: r.customer_id,
  customerName: r.customer_name,
  customerPhone: r.customer_phone,
  date: typeof r.date === "string" ? r.date.slice(0, 10) : r.date,
  time: r.time,
  partySize: r.party_size,
  tableId: r.table_id,
  occasion: r.occasion,
  seating: r.seating,
  status: r.status,
  channel: r.channel,
  reminderSent: r.reminder_sent,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export const reservationTo = (x: Partial<Reservation>): Row => {
  const r: Row = {};
  const map: [keyof Reservation, string][] = [
    ["id", "id"], ["code", "code"], ["customerId", "customer_id"], ["customerName", "customer_name"],
    ["customerPhone", "customer_phone"], ["date", "date"], ["time", "time"], ["partySize", "party_size"],
    ["tableId", "table_id"], ["occasion", "occasion"], ["seating", "seating"], ["status", "status"],
    ["channel", "channel"], ["reminderSent", "reminder_sent"], ["createdAt", "created_at"],
  ];
  for (const [k, col] of map) if (x[k] !== undefined) r[col] = x[k];
  return r;
};

const callFrom = (r: Row): CallRecord => ({
  id: r.id,
  externalId: r.external_id,
  channel: r.channel,
  callerPhone: r.caller_phone,
  callerName: r.caller_name,
  agents: r.agents ?? [],
  outcome: r.outcome,
  summary: r.summary,
  transcript: r.transcript ?? [],
  recordingUrl: r.recording_url,
  durationSeconds: r.duration_seconds,
  cost: num(r.cost),
  orderId: r.order_id,
  reservationId: r.reservation_id,
  createdAt: r.created_at,
});
export const callTo = (c: CallRecord): Row => ({
  id: c.id,
  external_id: c.externalId,
  channel: c.channel,
  caller_phone: c.callerPhone,
  caller_name: c.callerName,
  agents: c.agents,
  outcome: c.outcome,
  summary: c.summary,
  transcript: c.transcript,
  recording_url: c.recordingUrl,
  duration_seconds: c.durationSeconds,
  cost: c.cost,
  order_id: c.orderId,
  reservation_id: c.reservationId,
  created_at: c.createdAt,
});

const notificationFrom = (r: Row): NotificationRecord => ({
  id: r.id,
  kind: r.kind,
  channel: r.channel,
  to: r.to,
  body: r.body,
  status: r.status,
  provider: r.provider,
  relatedId: r.related_id,
  createdAt: r.created_at,
});
export const notificationTo = (n: NotificationRecord): Row => ({
  id: n.id,
  kind: n.kind,
  channel: n.channel,
  to: n.to,
  body: n.body,
  status: n.status,
  provider: n.provider,
  related_id: n.relatedId,
  created_at: n.createdAt,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  return res.data;
}

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private sb: SupabaseClient;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: false } });
  }

  async getSettings(): Promise<Settings> {
    const { data } = await this.sb.from("settings").select("data").eq("id", 1).maybeSingle();
    return { ...DEFAULT_SETTINGS, ...((data?.data as Partial<Settings>) ?? {}) };
  }
  async updateSettings(patch: Partial<Settings>) {
    const next = { ...(await this.getSettings()), ...patch };
    check(await this.sb.from("settings").upsert({ id: 1, data: next, updated_at: new Date().toISOString() }));
    return next;
  }

  async listMenu() {
    const rows = check(await this.sb.from("menu_items").select("*").order("sort_order"));
    return (rows ?? []).map(menuFrom);
  }
  async updateMenuItem(id: string, patch: Partial<MenuItem>) {
    const rows = check(await this.sb.from("menu_items").update(menuTo(patch)).eq("id", id).select());
    return rows?.[0] ? menuFrom(rows[0]) : null;
  }

  async findCustomerByPhone(phone: string) {
    const d = digits(phone);
    if (!d) return null;
    const rows = check(await this.sb.from("customers").select("*").like("phone", `%${d}`).limit(1));
    return rows?.[0] ? customerFrom(rows[0]) : null;
  }
  async upsertCustomer(phone: string, name: string) {
    const existing = await this.findCustomerByPhone(phone);
    if (existing) {
      if (name && name !== existing.name) {
        check(await this.sb.from("customers").update({ name }).eq("id", existing.id));
        existing.name = name;
      }
      return existing;
    }
    const row = { id: `c-${Date.now().toString(36)}`, phone, name };
    const rows = check(await this.sb.from("customers").insert(row).select());
    return customerFrom(rows![0]);
  }
  async recordCustomerOrder(customerId: string, orderId: string) {
    const { data } = await this.sb.from("customers").select("total_orders").eq("id", customerId).maybeSingle();
    await this.sb
      .from("customers")
      .update({ total_orders: (data?.total_orders ?? 0) + 1, last_order_id: orderId })
      .eq("id", customerId);
  }

  async nextOrderNumber() {
    const n = check(await this.sb.rpc("next_order_number"));
    return Number(n);
  }
  async createOrder(order: Order) {
    check(await this.sb.from("orders").insert(orderTo(order)));
    if (order.items.length) {
      check(
        await this.sb.from("order_items").insert(
          order.items.map((i) => ({
            order_id: order.id,
            menu_item_id: i.menuItemId,
            name: i.name,
            quantity: i.quantity,
            size: i.size,
            add_ons: i.addOns,
            notes: i.notes,
            unit_price: i.unitPrice,
            line_total: i.lineTotal,
          })),
        ),
      );
    }
    return order;
  }
  async getOrder(id: string) {
    const q = /^\d+$/.test(id)
      ? this.sb.from("orders").select("*").eq("order_number", Number(id))
      : this.sb.from("orders").select("*").eq("id", id);
    const rows = check(await q.limit(1));
    return rows?.[0] ? orderFrom(rows[0]) : null;
  }
  async listOrders(query: OrderQuery = {}) {
    let q = this.sb.from("orders").select("*").order("created_at", { ascending: false }).limit(query.limit ?? 500);
    if (query.since) q = q.gte("created_at", query.since);
    if (query.status?.length) q = q.in("status", query.status);
    return (check(await q) ?? []).map(orderFrom);
  }
  async updateOrder(id: string, patch: Partial<Order>) {
    const rows = check(await this.sb.from("orders").update(orderTo(patch)).eq("id", id).select());
    return rows?.[0] ? orderFrom(rows[0]) : null;
  }

  async listTables(): Promise<DiningTable[]> {
    return (check(await this.sb.from("dining_tables").select("*").order("number")) ?? []) as DiningTable[];
  }
  async listReservations(query: ReservationQuery = {}) {
    let q = this.sb.from("reservations").select("*").order("date").order("time");
    if (query.from) q = q.gte("date", query.from);
    if (query.to) q = q.lte("date", query.to);
    if (query.phone) q = q.like("customer_phone", `%${digits(query.phone)}`);
    return (check(await q) ?? []).map(reservationFrom);
  }
  async getReservation(idOrCode: string) {
    const rows = check(
      await this.sb.from("reservations").select("*").or(`id.eq.${idOrCode},code.eq.${idOrCode.toUpperCase()}`).limit(1),
    );
    return rows?.[0] ? reservationFrom(rows[0]) : null;
  }
  async createReservation(r: Reservation) {
    check(await this.sb.from("reservations").insert(reservationTo(r)));
    return r;
  }
  async updateReservation(id: string, patch: Partial<Reservation>) {
    const rows = check(await this.sb.from("reservations").update(reservationTo(patch)).eq("id", id).select());
    return rows?.[0] ? reservationFrom(rows[0]) : null;
  }

  async listCalls(limit = 200) {
    return (check(await this.sb.from("calls").select("*").order("created_at", { ascending: false }).limit(limit)) ?? []).map(callFrom);
  }
  async getCall(id: string) {
    const rows = check(await this.sb.from("calls").select("*").or(`id.eq.${id},external_id.eq.${id}`).limit(1));
    return rows?.[0] ? callFrom(rows[0]) : null;
  }
  async upsertCall(call: CallRecord) {
    check(await this.sb.from("calls").upsert(callTo(call)));
    return call;
  }

  async listNotifications(limit = 100) {
    return (check(await this.sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit)) ?? []).map(notificationFrom);
  }
  async createNotification(n: NotificationRecord) {
    check(await this.sb.from("notifications").insert(notificationTo(n)));
    return n;
  }
}
