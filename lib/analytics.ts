import { getStore } from "./store";
import { addDays, localParts } from "./time";
import type { CallRecord, Order, Settings } from "./types";

export interface Analytics {
  today: {
    calls: number;
    orders: number;
    revenue: number;
    avgTicket: number;
    reservations: number;
    covers: number;
    upsellRate: number;
    avgCallSeconds: number;
    aiHandledRate: number;
  };
  daily: { date: string; label: string; revenue: number; orders: number; calls: number; reservations: number }[];
  hourly: { hour: string; calls: number; orders: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
  outcomes: { outcome: string; count: number }[];
  channels: { channel: string; orders: number }[];
  agentUsage: { agent: string; calls: number }[];
}

function localDate(iso: string, tz: string) {
  return localParts(tz, new Date(iso)).date;
}

export async function computeAnalytics(days = 7): Promise<Analytics> {
  const store = getStore();
  const settings: Settings = await store.getSettings();
  const tz = settings.timezone;
  const today = localParts(tz).date;
  const from = addDays(today, -(days - 1));
  const sinceIso = new Date(Date.now() - (days + 1) * 86400000).toISOString();

  const [orders, calls, reservations] = await Promise.all([
    store.listOrders({ since: sinceIso, limit: 5000 }),
    store.listCalls(5000),
    store.listReservations({ from, to: today }),
  ]);

  const validOrders = orders.filter((o) => o.status !== "cancelled" && localDate(o.createdAt, tz) >= from);
  const windowCalls = calls.filter((c) => localDate(c.createdAt, tz) >= from);
  const todayOrders = validOrders.filter((o) => localDate(o.createdAt, tz) === today);
  const todayCalls = windowCalls.filter((c) => localDate(c.createdAt, tz) === today);
  const todayRes = reservations.filter((r) => r.date === today && !["cancelled", "waitlist"].includes(r.status));

  const revenue = (list: Order[]) => Math.round(list.reduce((s, o) => s + o.total, 0) * 100) / 100;
  const completedCalls = (list: CallRecord[]) => list.filter((c) => c.outcome !== "in_progress");

  const daily = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const dayOrders = validOrders.filter((o) => localDate(o.createdAt, tz) === date);
    daily.push({
      date,
      label: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      revenue: revenue(dayOrders),
      orders: dayOrders.length,
      calls: windowCalls.filter((c) => localDate(c.createdAt, tz) === date).length,
      reservations: reservations.filter((r) => r.date === date && !["cancelled", "waitlist"].includes(r.status)).length,
    });
  }

  const hourly: Analytics["hourly"] = [];
  for (let h = 11; h <= 22; h++) {
    const label = `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
    const inHour = (iso: string) => Number(localParts(tz, new Date(iso)).time.slice(0, 2)) === h;
    hourly.push({ hour: label, calls: windowCalls.filter((c) => inHour(c.createdAt)).length, orders: validOrders.filter((o) => inHour(o.createdAt)).length });
  }

  const itemMap = new Map<string, { quantity: number; revenue: number }>();
  for (const o of validOrders)
    for (const i of o.items) {
      const cur = itemMap.get(i.name) ?? { quantity: 0, revenue: 0 };
      cur.quantity += i.quantity;
      cur.revenue += i.lineTotal;
      itemMap.set(i.name, cur);
    }
  const topItems = [...itemMap.entries()]
    .map(([name, v]) => ({ name, quantity: v.quantity, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  const outcomeMap = new Map<string, number>();
  for (const c of completedCalls(windowCalls)) outcomeMap.set(c.outcome, (outcomeMap.get(c.outcome) ?? 0) + 1);
  const agentMap = new Map<string, number>();
  for (const c of windowCalls) for (const a of c.agents) agentMap.set(a, (agentMap.get(a) ?? 0) + 1);
  const channelMap = new Map<string, number>();
  for (const o of validOrders) channelMap.set(o.channel, (channelMap.get(o.channel) ?? 0) + 1);

  const done = completedCalls(todayCalls);
  return {
    today: {
      calls: todayCalls.length,
      orders: todayOrders.length,
      revenue: revenue(todayOrders),
      avgTicket: todayOrders.length ? Math.round((revenue(todayOrders) / todayOrders.length) * 100) / 100 : 0,
      reservations: todayRes.length,
      covers: todayRes.reduce((s, r) => s + r.partySize, 0),
      upsellRate: validOrders.length ? validOrders.filter((o) => o.upsellAccepted).length / validOrders.length : 0,
      avgCallSeconds: done.length ? Math.round(done.reduce((s, c) => s + c.durationSeconds, 0) / done.length) : 0,
      aiHandledRate: done.length ? done.filter((c) => c.outcome !== "transferred" && c.outcome !== "abandoned").length / done.length : 0,
    },
    daily,
    hourly,
    topItems,
    outcomes: [...outcomeMap.entries()].map(([outcome, count]) => ({ outcome, count })).sort((a, b) => b.count - a.count),
    channels: [...channelMap.entries()].map(([channel, orders]) => ({ channel, orders })),
    agentUsage: [...agentMap.entries()].map(([agent, calls]) => ({ agent, calls })),
  };
}

export function dailyReportText(a: Analytics, settings: Settings) {
  const t = a.today;
  const top = a.topItems.slice(0, 3).map((i) => `${i.name} (${i.quantity})`).join(", ");
  return [
    `${settings.restaurantName} daily report`,
    `Calls handled: ${t.calls} (${Math.round(t.aiHandledRate * 100)}% fully by AI)`,
    `Phone orders: ${t.orders} · revenue $${t.revenue.toFixed(2)} · avg ticket $${t.avgTicket.toFixed(2)}`,
    `Bookings today: ${t.reservations} (${t.covers} covers)`,
    `Upsell success: ${Math.round(t.upsellRate * 100)}%`,
    top ? `Top items: ${top}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
