export type AgentId = "receptionist" | "order" | "reservation" | "faq";

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  open: string; // "11:30"
  close: string; // "22:00"
}

export interface Settings {
  restaurantName: string;
  tagline: string;
  address: string;
  phone: string;
  timezone: string;
  currency: string;
  taxRate: number; // 0.08875
  deliveryFee: number;
  deliveryMinimum: number;
  deliveryZips: string[];
  hours: OpeningHours[];
  transferNumber: string;
  avgPrepMinutes: number;
  reservationSlotMinutes: number;
  parking: string;
  paymentMethods: string[];
}

export interface MenuOption {
  name: string;
  price: number; // extra cost on top of base price
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  sizes: MenuOption[]; // empty = single size
  addOns: MenuOption[];
  allergens: string[];
  dietary: string[]; // vegetarian, vegan, gluten-free, halal
  spicy: number; // 0-3
  isAvailable: boolean;
  isUpsell: boolean;
  popular: boolean;
}

export interface Customer {
  id: string;
  phone: string;
  name: string;
  totalOrders: number;
  lastOrderId: string | null;
  notes: string;
  createdAt: string;
}

export type OrderStatus = "new" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";
export type OrderType = "pickup" | "delivery";
export type Channel = "phone" | "web_chat" | "web_voice";

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  size: string | null;
  addOns: string[];
  notes: string;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  type: OrderType;
  address: string | null;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  channel: Channel;
  upsellAccepted: boolean;
  readyAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiningTable {
  id: string;
  number: number;
  seats: number;
  area: "indoor" | "patio" | "private";
}

export type ReservationStatus = "booked" | "seated" | "completed" | "cancelled" | "no_show" | "waitlist";

export interface Reservation {
  id: string;
  code: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  date: string; // YYYY-MM-DD (restaurant local)
  time: string; // HH:MM (restaurant local)
  partySize: number;
  tableId: string | null;
  occasion: string;
  seating: string;
  status: ReservationStatus;
  channel: Channel;
  reminderSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CallOutcome =
  | "order_placed"
  | "reservation_booked"
  | "reservation_changed"
  | "question_answered"
  | "transferred"
  | "abandoned"
  | "in_progress";

export interface TranscriptLine {
  role: "caller" | "agent" | "system";
  agent?: AgentId;
  text: string;
  at: string;
}

export interface CallRecord {
  id: string;
  externalId: string | null;
  channel: Channel;
  callerPhone: string;
  callerName: string;
  agents: AgentId[];
  outcome: CallOutcome;
  summary: string;
  transcript: TranscriptLine[];
  recordingUrl: string | null;
  durationSeconds: number;
  cost: number;
  orderId: string | null;
  reservationId: string | null;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  kind: "order_confirmation" | "order_status" | "reservation_confirmation" | "reservation_reminder" | "reservation_cancelled" | "daily_report";
  channel: "sms" | "whatsapp";
  to: string;
  body: string;
  status: "sent" | "queued" | "simulated" | "failed";
  provider: "twilio" | "n8n" | "demo";
  relatedId: string | null;
  createdAt: string;
}

/** Agent crew trace events shown live in the dashboard */
export type TraceEvent =
  | { type: "agent"; agent: AgentId; at: string }
  | { type: "handoff"; from: AgentId; to: AgentId; reason: string; at: string }
  | { type: "tool_call"; agent: AgentId; tool: string; args: Record<string, unknown>; at: string }
  | { type: "tool_result"; agent: AgentId; tool: string; ok: boolean; summary: string; at: string };
