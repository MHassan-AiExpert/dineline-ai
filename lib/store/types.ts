import type {
  CallRecord,
  Customer,
  DiningTable,
  MenuItem,
  NotificationRecord,
  Order,
  OrderStatus,
  Reservation,
  Settings,
} from "../types";

export interface OrderQuery {
  since?: string; // ISO
  status?: OrderStatus[];
  limit?: number;
}

export interface ReservationQuery {
  from?: string; // YYYY-MM-DD
  to?: string;
  phone?: string;
}

/** One interface, two backends: a local JSON store (demo) and Supabase (production). */
export interface Store {
  readonly kind: "local" | "supabase";

  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  listMenu(): Promise<MenuItem[]>;
  updateMenuItem(id: string, patch: Partial<MenuItem>): Promise<MenuItem | null>;

  findCustomerByPhone(phone: string): Promise<Customer | null>;
  upsertCustomer(phone: string, name: string): Promise<Customer>;
  recordCustomerOrder(customerId: string, orderId: string): Promise<void>;

  nextOrderNumber(): Promise<number>;
  createOrder(order: Order): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  listOrders(query?: OrderQuery): Promise<Order[]>;
  updateOrder(id: string, patch: Partial<Order>): Promise<Order | null>;

  listTables(): Promise<DiningTable[]>;
  listReservations(query?: ReservationQuery): Promise<Reservation[]>;
  getReservation(idOrCode: string): Promise<Reservation | null>;
  createReservation(r: Reservation): Promise<Reservation>;
  updateReservation(id: string, patch: Partial<Reservation>): Promise<Reservation | null>;

  listCalls(limit?: number): Promise<CallRecord[]>;
  getCall(id: string): Promise<CallRecord | null>;
  upsertCall(call: CallRecord): Promise<CallRecord>;

  listNotifications(limit?: number): Promise<NotificationRecord[]>;
  createNotification(n: NotificationRecord): Promise<NotificationRecord>;
}
