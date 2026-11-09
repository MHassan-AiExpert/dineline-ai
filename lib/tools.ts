import type { Channel, DiningTable, MenuItem, Order, OrderItem, Reservation, Settings } from "./types";
import { getStore } from "./store";
import { bestMatch, matchMenu, normalize } from "./menu-match";
import { priceLine, round2, KNOWLEDGE_BASE } from "./seed";
import { DAY_NAMES, addDays, fromMinutes, localParts, prettyDate, to12h, toMinutes, weekdayOf, zonedToDate } from "./time";
import { resolveDate, resolveTime, resolveZip } from "./parse";
import { orderConfirmationText, reservationText, sendCustomerText } from "./notify";

/** Context passed to every tool call: who is calling and what the call has produced so far. */
export interface ToolContext {
  callerPhone: string;
  channel: Channel;
  sessionId: string;
  effects: { orderId?: string; reservationId?: string; outcome?: string; customerName?: string };
}

export interface ToolResult {
  ok: boolean;
  /** One-line human summary for the dashboard trace */
  summary: string;
  data: Record<string, unknown>;
}

type JsonSchema = Record<string, unknown>;
export interface ToolDef {
  name: string;
  description: string;
  parameters: JsonSchema;
}

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });

/** OpenAI / Vapi compatible function definitions. */
export const TOOL_DEFS: Record<string, ToolDef> = {
  lookup_caller: {
    name: "lookup_caller",
    description: "Look up a returning customer by phone number. Returns their name, order count and last order so you can greet them and offer a reorder.",
    parameters: { type: "object", properties: { phone: str("Caller phone number; omit to use the caller ID") }, required: [] },
  },
  get_menu: {
    name: "get_menu",
    description: "Get the live menu with prices, sizes and availability. Optionally filter by category (Starters, Grill, Curries, Biryani & Rice, Breads, Sides, Desserts, Drinks).",
    parameters: { type: "object", properties: { category: str("Optional category filter") }, required: [] },
  },
  check_item: {
    name: "check_item",
    description: "Check one menu item: price, sizes, add-ons, allergens, dietary tags, spice level and whether it's available right now. Suggests alternatives if it's sold out or not found.",
    parameters: { type: "object", properties: { name: str("What the caller called the dish") }, required: ["name"] },
  },
  check_delivery_zone: {
    name: "check_delivery_zone",
    description: "Check whether an address or ZIP code is inside the delivery zone, and return the delivery fee and minimum order.",
    parameters: { type: "object", properties: { address: str("Full delivery address or ZIP code") }, required: ["address"] },
  },
  price_order: {
    name: "price_order",
    description: "Price a draft order without saving it: validates every item and returns line prices, subtotal, tax, delivery fee and total. Use this before reading the order back to the caller.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["pickup", "delivery"] },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: str("Menu item name"),
              quantity: int("Quantity, default 1"),
              size: str("Size if the item has sizes, e.g. Regular, Family, Half, Full"),
              add_ons: { type: "array", items: { type: "string" } },
              notes: str("Special instructions, e.g. no onions, extra spicy"),
            },
            required: ["name"],
          },
        },
      },
      required: ["items"],
    },
  },
  place_order: {
    name: "place_order",
    description: "Place the confirmed order. Only call after the caller has confirmed the read-back and total. Sends the kitchen the ticket and texts the caller a confirmation.",
    parameters: {
      type: "object",
      properties: {
        customer_name: str("Caller's name"),
        phone: str("Callback number; omit to use caller ID"),
        type: { type: "string", enum: ["pickup", "delivery"] },
        address: str("Delivery address (required for delivery)"),
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: str("Menu item name"),
              quantity: int("Quantity, default 1"),
              size: str("Size if applicable"),
              add_ons: { type: "array", items: { type: "string" } },
              notes: str("Special instructions"),
            },
            required: ["name"],
          },
        },
        upsell_accepted: { type: "boolean", description: "True if the caller accepted your upsell suggestion" },
      },
      required: ["customer_name", "type", "items"],
    },
  },
  get_order_status: {
    name: "get_order_status",
    description: "Get the status of an existing order by order number, or the caller's most recent order.",
    parameters: { type: "object", properties: { order_number: str("Order number, e.g. 1042") }, required: [] },
  },
  check_availability: {
    name: "check_availability",
    description: "Check table availability for a date, time and party size. Accepts natural dates like 'Friday' or 'tomorrow'. Returns the best table or the nearest open times.",
    parameters: {
      type: "object",
      properties: {
        date: str("Date, e.g. 2026-11-14, 'tomorrow' or 'Friday'"),
        time: str("Time, e.g. 19:30 or '7:30 pm'"),
        party_size: int("Number of guests"),
        seating: str("Optional preference: indoor, patio, private"),
      },
      required: ["date", "time", "party_size"],
    },
  },
  create_booking: {
    name: "create_booking",
    description: "Book a table after checking availability and getting the caller's name. Texts the caller a confirmation code.",
    parameters: {
      type: "object",
      properties: {
        customer_name: str("Guest name"),
        phone: str("Phone; omit to use caller ID"),
        date: str("Date"),
        time: str("Time"),
        party_size: int("Number of guests"),
        occasion: str("Optional occasion, e.g. birthday"),
        seating: str("Optional preference: indoor, patio, private"),
      },
      required: ["customer_name", "date", "time", "party_size"],
    },
  },
  find_booking: {
    name: "find_booking",
    description: "Find the caller's upcoming bookings by confirmation code or phone number.",
    parameters: { type: "object", properties: { code: str("Confirmation code, e.g. SG4123"), phone: str("Phone; omit to use caller ID") }, required: [] },
  },
  modify_booking: {
    name: "modify_booking",
    description: "Change the date, time or party size of an existing booking. Checks availability first.",
    parameters: {
      type: "object",
      properties: { code: str("Confirmation code"), date: str("New date"), time: str("New time"), party_size: int("New party size") },
      required: ["code"],
    },
  },
  cancel_booking: {
    name: "cancel_booking",
    description: "Cancel an existing booking by confirmation code.",
    parameters: { type: "object", properties: { code: str("Confirmation code") }, required: ["code"] },
  },
  join_waitlist: {
    name: "join_waitlist",
    description: "Add the caller to the waitlist when the requested time is fully booked.",
    parameters: {
      type: "object",
      properties: { customer_name: str("Guest name"), phone: str("Phone; omit to use caller ID"), date: str("Date"), time: str("Time"), party_size: int("Guests") },
      required: ["customer_name", "date", "time", "party_size"],
    },
  },
  search_knowledge_base: {
    name: "search_knowledge_base",
    description: "Answer questions about hours, location, parking, delivery area, payment, halal, allergens, dietary options, catering, private dining and other restaurant policies.",
    parameters: { type: "object", properties: { question: str("The caller's question") }, required: ["question"] },
  },
  transfer_to_staff: {
    name: "transfer_to_staff",
    description: "Transfer the caller to a human staff member. Use when they ask for a person, are upset, or need something you can't do (catering quotes, complaints, refunds).",
    parameters: { type: "object", properties: { reason: str("Why the caller needs a human") }, required: ["reason"] },
  },
};

// ─────────────────────────────── helpers ───────────────────────────────

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function hoursFor(settings: Settings, date: string) {
  return settings.hours.find((h) => h.day === weekdayOf(date)) ?? null;
}

function isOpenNow(settings: Settings) {
  const now = localParts(settings.timezone);
  const h = settings.hours.find((x) => x.day === now.weekday);
  if (!h) return false;
  return now.minutes >= toMinutes(h.open) && now.minutes < toMinutes(h.close) - 15;
}

function hoursText(settings: Settings) {
  const groups: string[] = [];
  for (const h of settings.hours) groups.push(`${DAY_NAMES[h.day]} ${to12h(h.open)}–${to12h(h.close)}`);
  return groups.join("; ");
}

function menuSummary(m: MenuItem) {
  return {
    name: m.name,
    category: m.category,
    price: m.price,
    sizes: m.sizes.length ? m.sizes.map((s) => `${s.name}${s.price ? ` +$${s.price.toFixed(2)}` : ""}`) : undefined,
    available: m.isAvailable,
    spicy: m.spicy || undefined,
    dietary: m.dietary.filter((d) => d !== "halal"),
  };
}

interface DraftItem {
  name?: string;
  quantity?: number;
  size?: string;
  add_ons?: string[];
  notes?: string;
}

async function buildLines(rawItems: DraftItem[], menu: MenuItem[]) {
  const lines: OrderItem[] = [];
  const problems: string[] = [];
  for (const raw of rawItems ?? []) {
    if (!raw?.name) continue;
    const item = bestMatch(String(raw.name), menu);
    if (!item) {
      problems.push(`"${raw.name}" isn't on the menu`);
      continue;
    }
    if (!item.isAvailable) {
      problems.push(`${item.name} is sold out today`);
      continue;
    }
    let size: string | null = null;
    if (item.sizes.length) {
      const wanted = raw.size ? item.sizes.find((s) => normalize(s.name) === normalize(raw.size!)) : null;
      size = (wanted ?? item.sizes[0]).name;
    }
    const addOns = (raw.add_ons ?? [])
      .map((a) => item.addOns.find((o) => normalize(o.name).includes(normalize(a)) || normalize(a).includes(normalize(o.name)))?.name)
      .filter((x): x is string => !!x);
    const qty = Math.max(1, Math.min(50, Math.round(Number(raw.quantity) || 1)));
    const line = priceLine(item, qty, size, addOns);
    line.notes = raw.notes ?? "";
    const existing = lines.find((l) => l.menuItemId === line.menuItemId && l.size === line.size && l.notes === line.notes && l.addOns.join() === line.addOns.join());
    if (existing) {
      existing.quantity += line.quantity;
      existing.lineTotal = round2(existing.unitPrice * existing.quantity);
    } else lines.push(line);
  }
  return { lines, problems };
}

function totals(lines: OrderItem[], type: "pickup" | "delivery", settings: Settings) {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const tax = round2(subtotal * settings.taxRate);
  const deliveryFee = type === "delivery" ? settings.deliveryFee : 0;
  return { subtotal, tax, deliveryFee, total: round2(subtotal + tax + deliveryFee) };
}

async function estimateReadyAt(settings: Settings, type: "pickup" | "delivery") {
  const active = await getStore().listOrders({ status: ["new", "preparing"], limit: 100 });
  const busyExtra = Math.min(25, active.length * 2);
  const minutes = settings.avgPrepMinutes + busyExtra + (type === "delivery" ? 20 : 0);
  // Before opening (or after closing) the kitchen starts at the next opening time.
  const now = localParts(settings.timezone);
  for (let offset = 0; offset < 8; offset++) {
    const date = addDays(now.date, offset);
    const h = hoursFor(settings, date);
    if (!h) continue;
    const open = toMinutes(h.open);
    const close = toMinutes(h.close) - 15;
    if (offset === 0 && now.minutes >= open && now.minutes < close) break; // open now
    if (offset === 0 && now.minutes >= close) continue;
    const start = zonedToDate(date, h.open, settings.timezone);
    return { minutes: Math.round((start.getTime() - Date.now()) / 60000) + minutes, at: new Date(start.getTime() + minutes * 60000), scheduled: true };
  }
  return { minutes, at: new Date(Date.now() + minutes * 60000), scheduled: false };
}

function inZone(address: string, settings: Settings) {
  const zip = resolveZip(address);
  return { zip, ok: zip ? settings.deliveryZips.includes(zip) : null };
}

/** Finds a free table, smallest that fits, honoring seating preference when possible. */
function findTable(
  tables: DiningTable[],
  reservations: Reservation[],
  date: string,
  time: string,
  partySize: number,
  slotMinutes: number,
  seating?: string,
  ignoreId?: string,
): DiningTable | null {
  const start = toMinutes(time);
  const busy = new Set(
    reservations
      .filter((r) => r.id !== ignoreId && r.date === date && (r.status === "booked" || r.status === "seated") && r.tableId)
      .filter((r) => Math.abs(toMinutes(r.time) - start) < slotMinutes)
      .map((r) => r.tableId as string),
  );
  const fits = tables.filter((t) => t.seats >= partySize && t.seats <= partySize + 4 && !busy.has(t.id)).sort((a, b) => a.seats - b.seats);
  const pref = seating && ["indoor", "patio", "private"].includes(seating) ? fits.find((t) => t.area === seating) : null;
  return pref ?? fits[0] ?? null;
}

function validateSlot(settings: Settings, date: string, time: string): string | null {
  const today = localParts(settings.timezone);
  if (date < today.date) return "That date has already passed.";
  if (date > addDays(today.date, 60)) return "We take bookings up to 60 days ahead.";
  const h = hoursFor(settings, date);
  if (!h) return `We're closed on ${DAY_NAMES[weekdayOf(date)]}s.`;
  const t = toMinutes(time);
  const lastSeating = toMinutes(h.close) - 60;
  if (t < toMinutes(h.open) || t > lastSeating)
    return `On ${DAY_NAMES[weekdayOf(date)]} we seat from ${to12h(h.open)} to ${to12h(fromMinutes(lastSeating))}.`;
  if (date === today.date && t < today.minutes + 15) return "That time has already passed today.";
  if (t % 15 !== 0) return "Bookings are taken on the quarter hour.";
  return null;
}

async function alternatives(settings: Settings, date: string, time: string, partySize: number, seating?: string) {
  const store = getStore();
  const [tables, reservations] = await Promise.all([store.listTables(), store.listReservations({ from: date, to: date })]);
  const base = toMinutes(time);
  const out: string[] = [];
  for (const delta of [30, -30, 60, -60, 90, -90, 120, -120]) {
    const t = fromMinutes(base + delta);
    if (validateSlot(settings, date, t)) continue;
    if (findTable(tables, reservations, date, t, partySize, settings.reservationSlotMinutes, seating)) out.push(t);
    if (out.length >= 3) break;
  }
  return out.sort();
}

// ─────────────────────────────── tools ───────────────────────────────

type Args = Record<string, unknown>;
type Handler = (args: Args, ctx: ToolContext) => Promise<ToolResult>;

const handlers: Record<string, Handler> = {
  async lookup_caller(args, ctx) {
    const store = getStore();
    const phone = String(args.phone || ctx.callerPhone || "");
    const c = phone ? await store.findCustomerByPhone(phone) : null;
    if (!c) return { ok: true, summary: "New caller", data: { returning: false } };
    const last = c.lastOrderId ? await store.getOrder(c.lastOrderId) : null;
    ctx.effects.customerName = c.name;
    return {
      ok: true,
      summary: `Returning caller ${c.name} (${c.totalOrders} orders)`,
      data: {
        returning: true,
        name: c.name,
        phone: c.phone,
        total_orders: c.totalOrders,
        notes: c.notes || undefined,
        last_order: last
          ? { order_number: last.orderNumber, type: last.type, items: last.items.map((i) => ({ name: i.name, quantity: i.quantity, size: i.size })), total: last.total, date: last.createdAt.slice(0, 10) }
          : null,
      },
    };
  },

  async get_menu(args) {
    const menu = await getStore().listMenu();
    const category = args.category ? String(args.category).toLowerCase() : "";
    const filtered = category ? menu.filter((m) => m.category.toLowerCase().includes(category)) : menu;
    const byCat: Record<string, unknown[]> = {};
    for (const m of filtered) (byCat[m.category] ??= []).push(menuSummary(m));
    const soldOut = menu.filter((m) => !m.isAvailable).map((m) => m.name);
    return {
      ok: true,
      summary: `${filtered.length} items${category ? ` in ${args.category}` : ""}${soldOut.length ? `, ${soldOut.length} sold out` : ""}`,
      data: { categories: byCat, sold_out: soldOut, popular: menu.filter((m) => m.popular && m.isAvailable).map((m) => m.name) },
    };
  },

  async check_item(args) {
    const menu = await getStore().listMenu();
    const matches = matchMenu(String(args.name ?? ""), menu);
    if (!matches.length || matches[0].score < 0.5) {
      return {
        ok: false,
        summary: `No match for "${args.name}"`,
        data: { found: false, message: `We don't have "${args.name}".`, suggestions: menu.filter((m) => m.popular && m.isAvailable).slice(0, 4).map((m) => m.name) },
      };
    }
    const item = matches[0].item;
    const data: Record<string, unknown> = {
      found: true,
      name: item.name,
      description: item.description,
      price: item.price,
      sizes: item.sizes,
      add_ons: item.addOns,
      allergens: item.allergens.length ? item.allergens : ["none of the major allergens"],
      dietary: item.dietary,
      spice_level: ["mild", "medium-mild", "medium-hot", "hot"][item.spicy],
      available: item.isAvailable,
    };
    if (!item.isAvailable) {
      data.alternatives = menu.filter((m) => m.category === item.category && m.isAvailable && m.id !== item.id).slice(0, 3).map((m) => m.name);
    }
    const close = matches.slice(1, 3).filter((m) => m.score >= matches[0].score - 0.05).map((m) => m.item.name);
    if (close.length) data.did_you_mean = close;
    return { ok: true, summary: `${item.name} · $${item.price.toFixed(2)}${item.isAvailable ? "" : " · SOLD OUT"}`, data };
  },

  async check_delivery_zone(args) {
    const settings = await getStore().getSettings();
    const { zip, ok } = inZone(String(args.address ?? ""), settings);
    if (!zip)
      return { ok: false, summary: "No ZIP code found", data: { in_zone: null, message: "Ask the caller for the ZIP code of the delivery address." } };
    return {
      ok: true,
      summary: ok ? `${zip} is in the delivery zone` : `${zip} is outside the zone`,
      data: ok
        ? { in_zone: true, zip, delivery_fee: settings.deliveryFee, minimum_order: settings.deliveryMinimum, eta_minutes: "40-55" }
        : { in_zone: false, zip, message: `We don't deliver to ${zip}. Pickup is available at ${settings.address}.`, zones: settings.deliveryZips },
    };
  },

  async price_order(args) {
    const store = getStore();
    const [menu, settings] = await Promise.all([store.listMenu(), store.getSettings()]);
    const type = args.type === "delivery" ? "delivery" : "pickup";
    const { lines, problems } = await buildLines(args.items as DraftItem[], menu);
    const t = totals(lines, type, settings);
    // Smart upsell: a drink if there's none, bread with curries, otherwise dessert.
    const has = (cat: string) => lines.some((l) => menu.find((m) => m.id === l.menuItemId)?.category === cat);
    const rank = (m: MenuItem) =>
      m.category === "Drinks" && !has("Drinks") ? 0 : m.category === "Breads" && has("Curries") && !has("Breads") ? 1 : m.category === "Desserts" && !has("Desserts") ? 2 : 5;
    const upsell = menu
      .filter((m) => m.isUpsell && m.isAvailable && !lines.some((l) => l.menuItemId === m.id))
      .filter((m) => rank(m) < 5)
      .sort((a, b) => rank(a) - rank(b));
    return {
      ok: problems.length === 0 && lines.length > 0,
      summary: lines.length ? `${lines.length} lines · total $${t.total.toFixed(2)}${problems.length ? ` · ${problems.length} issue(s)` : ""}` : "No valid items",
      data: {
        lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, size: l.size, add_ons: l.addOns, notes: l.notes || undefined, line_total: l.lineTotal })),
        ...t,
        problems,
        below_delivery_minimum: type === "delivery" && t.subtotal < settings.deliveryMinimum ? settings.deliveryMinimum : undefined,
        upsell_suggestions: upsell.slice(0, 3).map((m) => `${m.name} ($${m.price.toFixed(2)})`),
      },
    };
  },

  async place_order(args, ctx) {
    const store = getStore();
    const [menu, settings] = await Promise.all([store.listMenu(), store.getSettings()]);
    const type = args.type === "delivery" ? "delivery" : "pickup";
    const name = String(args.customer_name ?? "").trim();
    const phone = String(args.phone || ctx.callerPhone || "").trim();
    if (!name) return { ok: false, summary: "Missing name", data: { error: "Ask for the caller's name before placing the order." } };
    if (!phone) return { ok: false, summary: "Missing phone", data: { error: "Ask for a callback phone number." } };
    const { lines, problems } = await buildLines(args.items as DraftItem[], menu);
    if (problems.length) return { ok: false, summary: problems.join("; "), data: { error: "Fix these items with the caller first.", problems } };
    if (!lines.length) return { ok: false, summary: "Empty order", data: { error: "The order has no items." } };
    let address: string | null = null;
    if (type === "delivery") {
      address = String(args.address ?? "").trim();
      if (!address) return { ok: false, summary: "Missing address", data: { error: "Ask for the delivery address including ZIP code." } };
      const zone = inZone(address, settings);
      if (zone.ok === false) return { ok: false, summary: `Outside zone (${zone.zip})`, data: { error: `We don't deliver to ${zone.zip}. Offer pickup instead.` } };
      if (zone.ok === null) return { ok: false, summary: "No ZIP in address", data: { error: "Ask for the ZIP code of the delivery address." } };
    }
    const t = totals(lines, type, settings);
    if (type === "delivery" && t.subtotal < settings.deliveryMinimum)
      return { ok: false, summary: "Below delivery minimum", data: { error: `Delivery needs a $${settings.deliveryMinimum} minimum before tax. The current subtotal is $${t.subtotal.toFixed(2)}.` } };
    const customer = await store.upsertCustomer(phone, name);
    const orderNumber = await store.nextOrderNumber();
    const ready = await estimateReadyAt(settings, type);
    const now = new Date().toISOString();
    const order: Order = {
      id: `o-${orderNumber}-${Date.now().toString(36).slice(-4)}`,
      orderNumber,
      customerId: customer.id,
      customerName: name,
      customerPhone: phone,
      type,
      address,
      items: lines,
      ...t,
      status: "new",
      channel: ctx.channel,
      upsellAccepted: Boolean(args.upsell_accepted),
      readyAt: ready.at.toISOString(),
      createdAt: now,
      updatedAt: now,
    };
    await store.createOrder(order);
    await store.recordCustomerOrder(customer.id, order.id);
    ctx.effects.orderId = order.id;
    ctx.effects.outcome = "order_placed";
    ctx.effects.customerName = name;
    await sendCustomerText({ kind: "order_confirmation", to: phone, body: orderConfirmationText(order, settings), relatedId: order.id, payload: { orderNumber, total: order.total } });
    const readyLocal = ready.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.timezone });
    return {
      ok: true,
      summary: `Order #${orderNumber} placed · $${order.total.toFixed(2)}`,
      data: { order_number: orderNumber, total: order.total, ready_in_minutes: ready.minutes, ready_at: readyLocal, scheduled_for_opening: ready.scheduled || undefined, type, confirmation_text_sent_to: phone },
    };
  },

  async get_order_status(args, ctx) {
    const store = getStore();
    const settings = await store.getSettings();
    let order: Order | null = null;
    if (args.order_number) order = await store.getOrder(String(args.order_number).replace(/\D/g, ""));
    if (!order && ctx.callerPhone) {
      const c = await store.findCustomerByPhone(ctx.callerPhone);
      if (c?.lastOrderId) order = await store.getOrder(c.lastOrderId);
    }
    if (!order) return { ok: false, summary: "Order not found", data: { error: "I couldn't find that order. Ask for the order number." } };
    const labels: Record<string, string> = { new: "received by the kitchen", preparing: "being prepared", ready: "ready for pickup", out_for_delivery: "out for delivery", completed: "completed", cancelled: "cancelled" };
    return {
      ok: true,
      summary: `#${order.orderNumber} is ${order.status}`,
      data: { order_number: order.orderNumber, status: labels[order.status], ready_at: new Date(order.readyAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.timezone }), type: order.type, total: order.total },
    };
  },

  async check_availability(args) {
    const store = getStore();
    const settings = await store.getSettings();
    const date = resolveDate(String(args.date ?? ""), settings.timezone);
    const time = resolveTime(String(args.time ?? ""));
    const partySize = Number(args.party_size);
    if (!date) return { ok: false, summary: "Unclear date", data: { error: "Ask which date they'd like." } };
    if (!time) return { ok: false, summary: "Unclear time", data: { error: "Ask what time they'd like." } };
    if (!partySize || partySize < 1) return { ok: false, summary: "Unclear party size", data: { error: "Ask how many guests." } };
    const largest = Math.max(...(await store.listTables()).map((t) => t.seats));
    if (partySize > largest)
      return { ok: false, summary: "Large party", data: { error: `Parties over ${largest} are arranged by our private dining team. Offer to transfer the caller to staff.`, large_party: true } };
    const invalid = validateSlot(settings, date, time);
    const seating = args.seating ? String(args.seating).toLowerCase() : undefined;
    if (invalid) {
      const alts = invalid.includes("passed") || invalid.includes("closed") || invalid.includes("60 days") ? [] : await alternatives(settings, date, time, partySize, seating);
      return { ok: false, summary: invalid, data: { available: false, reason: invalid, date, pretty_date: prettyDate(date), alternatives: alts.map(to12h) } };
    }
    const [tables, reservations] = await Promise.all([store.listTables(), store.listReservations({ from: date, to: date })]);
    const table = findTable(tables, reservations, date, time, partySize, settings.reservationSlotMinutes, seating);
    if (table) {
      return {
        ok: true,
        summary: `Available · table ${table.number} (${table.area}) ${prettyDate(date)} ${to12h(time)}`,
        data: { available: true, date, time, pretty: `${prettyDate(date)} at ${to12h(time)}`, party_size: partySize, seating: table.area },
      };
    }
    const alts = await alternatives(settings, date, time, partySize, seating);
    return {
      ok: true,
      summary: `Full at ${to12h(time)} · ${alts.length} alternative(s)`,
      data: { available: false, date, pretty_date: prettyDate(date), requested_time: to12h(time), alternatives: alts.map(to12h), alternatives_24h: alts, waitlist_available: true },
    };
  },

  async create_booking(args, ctx) {
    const store = getStore();
    const settings = await store.getSettings();
    const name = String(args.customer_name ?? "").trim();
    const phone = String(args.phone || ctx.callerPhone || "").trim();
    const date = resolveDate(String(args.date ?? ""), settings.timezone);
    const time = resolveTime(String(args.time ?? ""));
    const partySize = Number(args.party_size);
    if (!name) return { ok: false, summary: "Missing name", data: { error: "Ask for the name for the booking." } };
    if (!phone) return { ok: false, summary: "Missing phone", data: { error: "Ask for a phone number for the booking." } };
    if (!date || !time || !partySize) return { ok: false, summary: "Missing details", data: { error: "Date, time and party size are required." } };
    const invalid = validateSlot(settings, date, time);
    if (invalid) return { ok: false, summary: invalid, data: { error: invalid } };
    const seating = args.seating ? String(args.seating).toLowerCase() : undefined;
    const [tables, reservations] = await Promise.all([store.listTables(), store.listReservations({ from: date, to: date })]);
    const table = findTable(tables, reservations, date, time, partySize, settings.reservationSlotMinutes, seating);
    if (!table) {
      const alts = await alternatives(settings, date, time, partySize, seating);
      return { ok: false, summary: "Slot just filled", data: { error: "That time is no longer available.", alternatives: alts.map(to12h) } };
    }
    const customer = await store.upsertCustomer(phone, name);
    const now = new Date().toISOString();
    const code = `SG${Math.floor(4000 + Math.random() * 5999)}`;
    const r: Reservation = {
      id: uid("r"),
      code,
      customerId: customer.id,
      customerName: name,
      customerPhone: phone,
      date,
      time,
      partySize,
      tableId: table.id,
      occasion: String(args.occasion ?? ""),
      seating: table.area,
      status: "booked",
      channel: ctx.channel,
      reminderSent: false,
      createdAt: now,
      updatedAt: now,
    };
    await store.createReservation(r);
    ctx.effects.reservationId = r.id;
    ctx.effects.outcome = "reservation_booked";
    ctx.effects.customerName = name;
    await sendCustomerText({ kind: "reservation_confirmation", to: phone, body: reservationText(r, settings, "reservation_confirmation"), relatedId: r.id, payload: { code } });
    return {
      ok: true,
      summary: `Booked ${code} · ${partySize} on ${prettyDate(date)} ${to12h(time)}`,
      data: { confirmation_code: code, date: prettyDate(date), time: to12h(time), party_size: partySize, seating: table.area, confirmation_text_sent_to: phone },
    };
  },

  async find_booking(args, ctx) {
    const store = getStore();
    const settings = await store.getSettings();
    const today = localParts(settings.timezone).date;
    let list: Reservation[] = [];
    if (args.code) {
      const r = await store.getReservation(String(args.code).replace(/\s/g, ""));
      if (r) list = [r];
    }
    if (!list.length) {
      const phone = String(args.phone || ctx.callerPhone || "");
      if (phone) list = await store.listReservations({ from: today, phone });
    }
    list = list.filter((r) => r.date >= today && ["booked", "waitlist"].includes(r.status));
    if (!list.length) return { ok: false, summary: "No upcoming booking", data: { error: "No upcoming booking found. Ask for the confirmation code." } };
    return {
      ok: true,
      summary: `${list.length} booking(s) found`,
      data: { bookings: list.map((r) => ({ code: r.code, name: r.customerName, date: prettyDate(r.date), time: to12h(r.time), party_size: r.partySize, status: r.status })) },
    };
  },

  async modify_booking(args, ctx) {
    const store = getStore();
    const settings = await store.getSettings();
    const r = await store.getReservation(String(args.code ?? "").replace(/\s/g, ""));
    if (!r || !["booked", "waitlist"].includes(r.status)) return { ok: false, summary: "Booking not found", data: { error: "Couldn't find an active booking with that code." } };
    const date = args.date ? resolveDate(String(args.date), settings.timezone) ?? r.date : r.date;
    const time = args.time ? resolveTime(String(args.time)) ?? r.time : r.time;
    const partySize = args.party_size ? Number(args.party_size) : r.partySize;
    const invalid = validateSlot(settings, date, time);
    if (invalid) return { ok: false, summary: invalid, data: { error: invalid } };
    const [tables, reservations] = await Promise.all([store.listTables(), store.listReservations({ from: date, to: date })]);
    const table = findTable(tables, reservations, date, time, partySize, settings.reservationSlotMinutes, r.seating, r.id);
    if (!table) {
      const alts = await alternatives(settings, date, time, partySize);
      return { ok: false, summary: "New slot unavailable", data: { error: "That new time isn't available.", alternatives: alts.map(to12h) } };
    }
    const updated = await store.updateReservation(r.id, { date, time, partySize, tableId: table.id, seating: table.area, status: "booked", reminderSent: false });
    ctx.effects.reservationId = r.id;
    ctx.effects.outcome = "reservation_changed";
    if (updated) await sendCustomerText({ kind: "reservation_confirmation", to: updated.customerPhone, body: reservationText(updated, settings, "reservation_confirmation"), relatedId: r.id });
    return { ok: true, summary: `Moved ${r.code} to ${prettyDate(date)} ${to12h(time)}`, data: { confirmation_code: r.code, date: prettyDate(date), time: to12h(time), party_size: partySize } };
  },

  async cancel_booking(args, ctx) {
    const store = getStore();
    const settings = await store.getSettings();
    const r = await store.getReservation(String(args.code ?? "").replace(/\s/g, ""));
    if (!r || !["booked", "waitlist"].includes(r.status)) return { ok: false, summary: "Booking not found", data: { error: "Couldn't find an active booking with that code." } };
    await store.updateReservation(r.id, { status: "cancelled" });
    ctx.effects.reservationId = r.id;
    ctx.effects.outcome = "reservation_changed";
    await sendCustomerText({ kind: "reservation_cancelled", to: r.customerPhone, body: reservationText(r, settings, "reservation_cancelled"), relatedId: r.id });
    // Offer the freed slot to the first matching waitlist guest
    const waiting = (await store.listReservations({ from: r.date, to: r.date })).find((w) => w.status === "waitlist" && w.partySize <= r.partySize && Math.abs(toMinutes(w.time) - toMinutes(r.time)) <= 60);
    return { ok: true, summary: `Cancelled ${r.code}${waiting ? " · waitlist guest can be offered the slot" : ""}`, data: { cancelled: true, code: r.code, date: prettyDate(r.date), time: to12h(r.time) } };
  },

  async join_waitlist(args, ctx) {
    const store = getStore();
    const settings = await store.getSettings();
    const name = String(args.customer_name ?? "").trim();
    const phone = String(args.phone || ctx.callerPhone || "").trim();
    const date = resolveDate(String(args.date ?? ""), settings.timezone);
    const time = resolveTime(String(args.time ?? ""));
    const partySize = Number(args.party_size);
    if (!name || !phone || !date || !time || !partySize) return { ok: false, summary: "Missing details", data: { error: "Need name, phone, date, time and party size." } };
    const now = new Date().toISOString();
    const r: Reservation = {
      id: uid("r"),
      code: `SGW${Math.floor(100 + Math.random() * 899)}`,
      customerId: (await store.upsertCustomer(phone, name)).id,
      customerName: name,
      customerPhone: phone,
      date,
      time,
      partySize,
      tableId: null,
      occasion: "",
      seating: "any",
      status: "waitlist",
      channel: ctx.channel,
      reminderSent: false,
      createdAt: now,
      updatedAt: now,
    };
    await store.createReservation(r);
    ctx.effects.reservationId = r.id;
    ctx.effects.outcome = "reservation_booked";
    await sendCustomerText({ kind: "reservation_confirmation", to: phone, body: reservationText(r, settings, "reservation_confirmation"), relatedId: r.id });
    const position = (await store.listReservations({ from: date, to: date })).filter((x) => x.status === "waitlist").length;
    return { ok: true, summary: `Waitlisted ${r.code} (position ${position})`, data: { reference: r.code, position, date: prettyDate(date), time: to12h(time) } };
  },

  async search_knowledge_base(args) {
    const store = getStore();
    const [settings, menu] = await Promise.all([store.getSettings(), store.listMenu()]);
    const q = String(args.question ?? "").toLowerCase();
    const facts: string[] = [];
    const now = localParts(settings.timezone);
    const todayHours = settings.hours.find((h) => h.day === now.weekday);

    if (/\b(hour|hours|open|close|closing|opening|timing|time do you)\b/.test(q)) {
      if (todayHours) facts.push(`Today (${DAY_NAMES[now.weekday]}) we're open ${to12h(todayHours.open)} to ${to12h(todayHours.close)}, and right now we're ${isOpenNow(settings) ? "open" : "closed"}.`);
      if (!/\b(today|tonight|now)\b/.test(q)) facts.push(`Our full hours: ${hoursText(settings)}.`);
    }
    if (/\b(where|address|location|located|directions|find you)\b/.test(q)) facts.push(`We're at ${settings.address}.`);
    if (/\b(park|parking|garage)\b/.test(q)) facts.push(settings.parking);
    if (/\b(deliver|delivery|zip|area)\b/.test(q)) {
      const zip = resolveZip(q);
      if (zip) facts.push(settings.deliveryZips.includes(zip) ? `Yes, we deliver to ${zip}.` : `Sorry, ${zip} is outside our delivery area.`);
      facts.push(`Delivery covers ZIP codes ${settings.deliveryZips.join(", ")}; the fee is $${settings.deliveryFee.toFixed(2)} with a $${settings.deliveryMinimum} minimum.`);
    }
    if (/\b(pay|payment|card|cash|apple pay|amex)\b/.test(q)) facts.push(`We accept ${settings.paymentMethods.join(", ")}.`);
    if (/\b(phone|number|call you)\b/.test(q)) facts.push(`Our number is ${settings.phone}.`);

    for (const entry of KNOWLEDGE_BASE) if (entry.keywords.some((k) => q.includes(k))) facts.push(entry.answer);

    // Menu-aware answers: allergens / dietary for any dish mentioned
    const allergenWords = ["gluten", "dairy", "nut", "nuts", "fish", "milk", "lactose", "wheat", "vegan", "vegetarian", "allergen", "allergy", "contain", "free", "spicy"];
    const mentionsDish = matchMenu(q.replace(/\b(is|does|the|your|have|has|contain|contains|any|free|gluten|dairy|nut|nuts|vegan|vegetarian|spicy|it)\b/g, " "), menu).filter((m, _i, all) => m.score >= 0.6 && m.score >= all[0].score - 0.05).slice(0, 2);
    for (const { item } of mentionsDish) {
      const allergens = item.allergens.length ? `contains ${item.allergens.join(", ")}` : "contains none of the major allergens (nuts, dairy, gluten, fish)";
      const tags = item.dietary.filter((d) => d !== "halal");
      facts.push(`${item.name}: ${allergens}${tags.length ? `; it's ${tags.join(", ")}` : ""}; spice level ${["mild", "medium-mild", "medium-hot", "hot"][item.spicy]}; $${item.price.toFixed(2)}${item.isAvailable ? "" : " (sold out today)"}.`);
    }
    if (!mentionsDish.length && allergenWords.some((w) => q.includes(w))) {
      const key = q.includes("gluten") || q.includes("wheat") ? "gluten-free" : q.includes("vegan") ? "vegan" : q.includes("vegetarian") ? "vegetarian" : null;
      if (key && !facts.some((f) => f.toLowerCase().includes(`${key.split("-")[0]} options`))) facts.push(`${key[0].toUpperCase() + key.slice(1)} dishes: ${menu.filter((m) => m.dietary.includes(key) && m.isAvailable).map((m) => m.name).join(", ")}.`);
      const nutFree = /\bnut/.test(q);
      if (nutFree) facts.push(`Dishes that contain nuts: ${menu.filter((m) => m.allergens.includes("nuts")).map((m) => m.name).join(", ")}. Everything else is made without nuts.`);
    }

    const unique = [...new Set(facts)];
    if (!unique.length)
      return { ok: false, summary: "No answer in knowledge base", data: { answer: null, message: "Not in the knowledge base. Offer to transfer the caller to staff or take a message." } };
    return { ok: true, summary: `${unique.length} fact(s) found`, data: { facts: unique } };
  },

  async transfer_to_staff(args, ctx) {
    const settings = await getStore().getSettings();
    ctx.effects.outcome = "transferred";
    return { ok: true, summary: `Transfer requested: ${args.reason ?? ""}`.trim(), data: { transferring_to: settings.transferNumber, say: "Tell the caller you're connecting them to a team member now." } };
  },
};

export async function executeTool(name: string, args: Args, ctx: ToolContext): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) return { ok: false, summary: `Unknown tool ${name}`, data: { error: `Unknown tool: ${name}` } };
  try {
    return await handler(args ?? {}, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, summary: `Error: ${message}`, data: { error: "Something went wrong on our side. Apologize and offer to take a message or transfer." } };
  }
}

export const TOOL_NAMES = Object.keys(handlers);

/** Finds a free table for a waitlisted guest being offered a seat. */
export async function findFreeTable(date: string, time: string, partySize: number, ignoreId?: string) {
  const store = getStore();
  const settings = await store.getSettings();
  const [tables, reservations] = await Promise.all([store.listTables(), store.listReservations({ from: date, to: date })]);
  return findTable(tables, reservations, date, time, partySize, settings.reservationSlotMinutes, undefined, ignoreId);
}
