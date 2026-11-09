import fs from "node:fs";
import path from "node:path";
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
import { DEFAULT_MENU, DEFAULT_SETTINGS, DEFAULT_TABLES, buildDemoHistory } from "../seed";
import type { OrderQuery, ReservationQuery, Store } from "./types";

interface DB {
  version: number;
  seededAt: string;
  settings: Settings;
  menu: MenuItem[];
  tables: DiningTable[];
  customers: Customer[];
  orders: Order[];
  reservations: Reservation[];
  calls: CallRecord[];
  notifications: NotificationRecord[];
  nextOrderNumber: number;
}

const DB_VERSION = 1;
const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

function freshDb(): DB {
  const history = buildDemoHistory(DEFAULT_SETTINGS, DEFAULT_MENU);
  return {
    version: DB_VERSION,
    seededAt: new Date().toISOString(),
    settings: structuredClone(DEFAULT_SETTINGS),
    menu: structuredClone(DEFAULT_MENU),
    tables: structuredClone(DEFAULT_TABLES),
    ...history,
  };
}

function loadDb(): DB {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as DB;
      // Re-seed when the demo history is more than a day old so "today" stays populated.
      const stale = Date.now() - Date.parse(parsed.seededAt) > 20 * 3600 * 1000;
      if (parsed.version === DB_VERSION && !stale) return parsed;
    }
  } catch {
    // corrupt or unreadable file: start fresh
  }
  return freshDb();
}

const g = globalThis as unknown as { __dinelineDb?: DB; __dinelineSaveTimer?: NodeJS.Timeout };

function db(): DB {
  if (!g.__dinelineDb) g.__dinelineDb = loadDb();
  return g.__dinelineDb;
}

/** Persist to .data/db.json (debounced). Silently skipped on read-only hosts such as Vercel. */
function persist() {
  if (g.__dinelineSaveTimer) clearTimeout(g.__dinelineSaveTimer);
  g.__dinelineSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(db()));
    } catch {
      /* read-only filesystem: keep in memory only */
    }
  }, 300);
}

const clone = <T,>(v: T): T => structuredClone(v);
const digits = (p: string) => p.replace(/\D/g, "").slice(-10);

export class LocalStore implements Store {
  readonly kind = "local" as const;

  async getSettings() {
    return clone(db().settings);
  }
  async updateSettings(patch: Partial<Settings>) {
    db().settings = { ...db().settings, ...patch };
    persist();
    return clone(db().settings);
  }

  async listMenu() {
    return clone(db().menu);
  }
  async updateMenuItem(id: string, patch: Partial<MenuItem>) {
    const item = db().menu.find((m) => m.id === id);
    if (!item) return null;
    Object.assign(item, patch, { id });
    persist();
    return clone(item);
  }

  async findCustomerByPhone(phone: string) {
    const d = digits(phone);
    if (!d) return null;
    const c = db().customers.find((x) => digits(x.phone) === d);
    return c ? clone(c) : null;
  }
  async upsertCustomer(phone: string, name: string) {
    const d = digits(phone);
    let c = db().customers.find((x) => digits(x.phone) === d);
    if (c) {
      if (name && name !== c.name) c.name = name;
    } else {
      c = {
        id: `c-${Date.now().toString(36)}`,
        phone,
        name,
        totalOrders: 0,
        lastOrderId: null,
        notes: "",
        createdAt: new Date().toISOString(),
      };
      db().customers.push(c);
    }
    persist();
    return clone(c);
  }
  async recordCustomerOrder(customerId: string, orderId: string) {
    const c = db().customers.find((x) => x.id === customerId);
    if (c) {
      c.totalOrders += 1;
      c.lastOrderId = orderId;
      persist();
    }
  }

  async nextOrderNumber() {
    const n = db().nextOrderNumber;
    db().nextOrderNumber = n + 1;
    persist();
    return n;
  }
  async createOrder(order: Order) {
    db().orders.unshift(clone(order));
    persist();
    return clone(order);
  }
  async getOrder(id: string) {
    const o = db().orders.find((x) => x.id === id || String(x.orderNumber) === id);
    return o ? clone(o) : null;
  }
  async listOrders(query: OrderQuery = {}) {
    let list = db().orders;
    if (query.since) list = list.filter((o) => o.createdAt >= query.since!);
    if (query.status?.length) list = list.filter((o) => query.status!.includes(o.status));
    return clone(list.slice(0, query.limit ?? 500));
  }
  async updateOrder(id: string, patch: Partial<Order>) {
    const o = db().orders.find((x) => x.id === id);
    if (!o) return null;
    Object.assign(o, patch, { id, updatedAt: new Date().toISOString() });
    persist();
    return clone(o);
  }

  async listTables() {
    return clone(db().tables);
  }
  async listReservations(query: ReservationQuery = {}) {
    let list = db().reservations;
    if (query.from) list = list.filter((r) => r.date >= query.from!);
    if (query.to) list = list.filter((r) => r.date <= query.to!);
    if (query.phone) {
      const d = digits(query.phone);
      list = list.filter((r) => digits(r.customerPhone) === d);
    }
    return clone([...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
  }
  async getReservation(idOrCode: string) {
    const key = idOrCode.toUpperCase();
    const r = db().reservations.find((x) => x.id === idOrCode || x.code.toUpperCase() === key);
    return r ? clone(r) : null;
  }
  async createReservation(r: Reservation) {
    db().reservations.push(clone(r));
    persist();
    return clone(r);
  }
  async updateReservation(id: string, patch: Partial<Reservation>) {
    const r = db().reservations.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch, { id, updatedAt: new Date().toISOString() });
    persist();
    return clone(r);
  }

  async listCalls(limit = 200) {
    return clone([...db().calls].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit));
  }
  async getCall(id: string) {
    const c = db().calls.find((x) => x.id === id || x.externalId === id);
    return c ? clone(c) : null;
  }
  async upsertCall(call: CallRecord) {
    const i = db().calls.findIndex((x) => x.id === call.id);
    if (i >= 0) db().calls[i] = clone(call);
    else db().calls.unshift(clone(call));
    persist();
    return clone(call);
  }

  async listNotifications(limit = 100) {
    return clone(db().notifications.slice(0, limit));
  }
  async createNotification(n: NotificationRecord) {
    db().notifications.unshift(clone(n));
    db().notifications = db().notifications.slice(0, 300);
    persist();
    return clone(n);
  }
}

/** Resets the local demo data (used by the "Reset demo data" button). */
export function resetLocalDb() {
  g.__dinelineDb = freshDb();
  persist();
}
