import type {
  CallRecord,
  Customer,
  DiningTable,
  MenuItem,
  NotificationRecord,
  Order,
  OrderItem,
  Reservation,
  Settings,
  AgentId,
  CallOutcome,
} from "./types";
import { addDays, localParts, prettyDate, to12h, zonedToDate } from "./time";

export const DEFAULT_SETTINGS: Settings = {
  restaurantName: "Saffron Grill",
  tagline: "Charcoal grill, slow curries and dum biryani",
  address: "214 Bleecker Street, New York, NY 10012",
  phone: "+1 (212) 555-0147",
  timezone: "America/New_York",
  currency: "USD",
  taxRate: 0.08875,
  deliveryFee: 3.99,
  deliveryMinimum: 20,
  deliveryZips: ["10012", "10014", "10003", "10011", "10013", "10002", "10009"],
  hours: [
    { day: 0, open: "12:00", close: "21:30" },
    { day: 1, open: "11:30", close: "22:00" },
    { day: 2, open: "11:30", close: "22:00" },
    { day: 3, open: "11:30", close: "22:00" },
    { day: 4, open: "11:30", close: "22:00" },
    { day: 5, open: "11:30", close: "23:00" },
    { day: 6, open: "11:30", close: "23:00" },
  ],
  transferNumber: "+1 (212) 555-0199",
  avgPrepMinutes: 25,
  reservationSlotMinutes: 90,
  parking: "Street parking on Bleecker and a paid garage at 180 Thompson Street, two minutes' walk.",
  paymentMethods: ["Visa", "Mastercard", "American Express", "Apple Pay", "Google Pay", "Cash"],
};

const S = (name: string, price: number) => ({ name, price });

export const DEFAULT_MENU: MenuItem[] = [
  // Starters
  { id: "m-samosa", name: "Vegetable Samosa", category: "Starters", description: "Two crisp pastries with spiced potato and peas, tamarind chutney.", price: 7.5, sizes: [], addOns: [S("Extra chutney", 0.75)], allergens: ["gluten"], dietary: ["vegetarian", "vegan", "halal"], spicy: 1, isAvailable: true, isUpsell: false, popular: true },
  { id: "m-chicken-pakora", name: "Chicken Pakora", category: "Starters", description: "Gram-flour battered chicken bites, mint raita.", price: 9.5, sizes: [], addOns: [], allergens: ["dairy"], dietary: ["gluten-free", "halal"], spicy: 1, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-chaat", name: "Aloo Tikki Chaat", category: "Starters", description: "Potato patties, chickpeas, yogurt, tamarind and sev.", price: 8.95, sizes: [], addOns: [], allergens: ["dairy", "gluten"], dietary: ["vegetarian", "halal"], spicy: 1, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-fish-amritsari", name: "Amritsari Fish", category: "Starters", description: "Carom-spiced fried cod, lemon and chaat masala.", price: 12.5, sizes: [], addOns: [], allergens: ["fish"], dietary: ["gluten-free", "halal"], spicy: 2, isAvailable: true, isUpsell: false, popular: false },
  // Grill
  { id: "m-seekh", name: "Lamb Seekh Kebab", category: "Grill", description: "Minced lamb skewers from the charcoal grill, onion salad.", price: 16.95, sizes: [], addOns: [S("Extra skewer", 5.5)], allergens: [], dietary: ["gluten-free", "halal"], spicy: 2, isAvailable: true, isUpsell: false, popular: true },
  { id: "m-tikka", name: "Chicken Tikka", category: "Grill", description: "Yogurt-marinated chicken thigh, charred in the tandoor.", price: 15.95, sizes: [], addOns: [], allergens: ["dairy"], dietary: ["gluten-free", "halal"], spicy: 1, isAvailable: true, isUpsell: false, popular: true },
  { id: "m-malai-boti", name: "Malai Boti", category: "Grill", description: "Cream and cardamom chicken, mild and smoky.", price: 16.5, sizes: [], addOns: [], allergens: ["dairy", "nuts"], dietary: ["gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-paneer-tikka", name: "Paneer Tikka", category: "Grill", description: "Grilled cottage cheese, peppers and onion.", price: 14.5, sizes: [], addOns: [], allergens: ["dairy"], dietary: ["vegetarian", "gluten-free", "halal"], spicy: 1, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-mixed-grill", name: "Saffron Mixed Grill", category: "Grill", description: "Seekh, tikka, malai boti and lamb chops for two.", price: 34.0, sizes: [], addOns: [], allergens: ["dairy", "nuts"], dietary: ["gluten-free", "halal"], spicy: 2, isAvailable: true, isUpsell: false, popular: true },
  // Curries
  { id: "m-butter-chicken", name: "Butter Chicken", category: "Curries", description: "Tandoori chicken in a tomato, butter and fenugreek sauce.", price: 18.95, sizes: [], addOns: [S("Extra chicken", 4.0)], allergens: ["dairy", "nuts"], dietary: ["gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: true },
  { id: "m-karahi", name: "Chicken Karahi", category: "Curries", description: "Wok-cooked chicken with tomato, ginger and green chilli.", price: 18.5, sizes: [S("Half", 0), S("Full", 9.0)], addOns: [], allergens: [], dietary: ["gluten-free", "halal"], spicy: 2, isAvailable: true, isUpsell: false, popular: true },
  { id: "m-nihari", name: "Beef Nihari", category: "Curries", description: "Overnight-braised beef shank, ginger and lemon.", price: 21.0, sizes: [], addOns: [], allergens: ["gluten"], dietary: ["halal"], spicy: 2, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-saag-paneer", name: "Saag Paneer", category: "Curries", description: "Spinach and mustard greens with paneer.", price: 16.5, sizes: [], addOns: [], allergens: ["dairy"], dietary: ["vegetarian", "gluten-free", "halal"], spicy: 1, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-dal-makhani", name: "Dal Makhani", category: "Curries", description: "Black lentils slow-cooked overnight with butter.", price: 14.95, sizes: [], addOns: [], allergens: ["dairy"], dietary: ["vegetarian", "gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-chana", name: "Chana Masala", category: "Curries", description: "Chickpeas in an onion-tomato masala.", price: 13.95, sizes: [], addOns: [], allergens: [], dietary: ["vegetarian", "vegan", "gluten-free", "halal"], spicy: 1, isAvailable: true, isUpsell: false, popular: false },
  // Biryani & rice
  { id: "m-chicken-biryani", name: "Chicken Biryani", category: "Biryani & Rice", description: "Dum-cooked basmati with saffron, chicken and fried onion. Raita on the side.", price: 17.95, sizes: [S("Regular", 0), S("Family", 16.0)], addOns: [S("Extra raita", 1.5)], allergens: ["dairy"], dietary: ["gluten-free", "halal"], spicy: 2, isAvailable: true, isUpsell: false, popular: true },
  { id: "m-lamb-biryani", name: "Lamb Biryani", category: "Biryani & Rice", description: "Slow-cooked lamb layered with saffron basmati.", price: 20.95, sizes: [S("Regular", 0), S("Family", 18.0)], addOns: [S("Extra raita", 1.5)], allergens: ["dairy"], dietary: ["gluten-free", "halal"], spicy: 2, isAvailable: true, isUpsell: false, popular: true },
  { id: "m-veg-biryani", name: "Vegetable Biryani", category: "Biryani & Rice", description: "Seasonal vegetables and paneer with saffron rice.", price: 15.5, sizes: [S("Regular", 0), S("Family", 13.0)], addOns: [], allergens: ["dairy", "nuts"], dietary: ["vegetarian", "gluten-free", "halal"], spicy: 1, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-jeera-rice", name: "Jeera Rice", category: "Biryani & Rice", description: "Basmati with toasted cumin.", price: 5.5, sizes: [], addOns: [], allergens: [], dietary: ["vegan", "gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
  // Breads
  { id: "m-garlic-naan", name: "Garlic Naan", category: "Breads", description: "Tandoor-baked with garlic and coriander butter.", price: 4.5, sizes: [], addOns: [], allergens: ["gluten", "dairy"], dietary: ["vegetarian", "halal"], spicy: 0, isAvailable: true, isUpsell: true, popular: true },
  { id: "m-butter-naan", name: "Butter Naan", category: "Breads", description: "Soft leavened bread brushed with butter.", price: 3.95, sizes: [], addOns: [], allergens: ["gluten", "dairy"], dietary: ["vegetarian", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-cheese-naan", name: "Cheese Naan", category: "Breads", description: "Stuffed with mozzarella and green chilli.", price: 5.5, sizes: [], addOns: [], allergens: ["gluten", "dairy"], dietary: ["vegetarian", "halal"], spicy: 1, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-roti", name: "Tandoori Roti", category: "Breads", description: "Whole-wheat flatbread.", price: 3.25, sizes: [], addOns: [], allergens: ["gluten"], dietary: ["vegan", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
  // Sides
  { id: "m-raita", name: "Cucumber Raita", category: "Sides", description: "Yogurt with cucumber and roasted cumin.", price: 3.95, sizes: [], addOns: [], allergens: ["dairy"], dietary: ["vegetarian", "gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-salad", name: "Kachumber Salad", category: "Sides", description: "Cucumber, tomato, onion, lime and chaat masala.", price: 5.95, sizes: [], addOns: [], allergens: [], dietary: ["vegan", "gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
  // Desserts
  { id: "m-gulab-jamun", name: "Gulab Jamun", category: "Desserts", description: "Warm milk dumplings in rose and cardamom syrup.", price: 6.5, sizes: [], addOns: [], allergens: ["dairy", "gluten"], dietary: ["vegetarian", "halal"], spicy: 0, isAvailable: true, isUpsell: true, popular: true },
  { id: "m-kheer", name: "Saffron Kheer", category: "Desserts", description: "Rice pudding with saffron, pistachio and almond.", price: 6.95, sizes: [], addOns: [], allergens: ["dairy", "nuts"], dietary: ["vegetarian", "gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
  // Drinks
  { id: "m-mango-lassi", name: "Mango Lassi", category: "Drinks", description: "Alphonso mango and yogurt.", price: 5.5, sizes: [], addOns: [], allergens: ["dairy"], dietary: ["vegetarian", "gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: true, popular: true },
  { id: "m-chai", name: "Karak Chai", category: "Drinks", description: "Strong spiced tea with milk.", price: 3.95, sizes: [], addOns: [], allergens: ["dairy"], dietary: ["vegetarian", "gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
  { id: "m-mint-lemonade", name: "Mint Lemonade", category: "Drinks", description: "Fresh lime, mint and black salt.", price: 4.5, sizes: [], addOns: [], allergens: [], dietary: ["vegan", "gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: true, popular: false },
  { id: "m-soda", name: "Soft Drink", category: "Drinks", description: "Coke, Diet Coke, Sprite or ginger ale.", price: 2.95, sizes: [], addOns: [], allergens: [], dietary: ["vegan", "gluten-free", "halal"], spicy: 0, isAvailable: true, isUpsell: false, popular: false },
];

export const DEFAULT_TABLES: DiningTable[] = [
  { id: "t-1", number: 1, seats: 2, area: "indoor" },
  { id: "t-2", number: 2, seats: 2, area: "indoor" },
  { id: "t-3", number: 3, seats: 2, area: "indoor" },
  { id: "t-4", number: 4, seats: 4, area: "indoor" },
  { id: "t-5", number: 5, seats: 4, area: "indoor" },
  { id: "t-6", number: 6, seats: 4, area: "indoor" },
  { id: "t-7", number: 7, seats: 4, area: "patio" },
  { id: "t-8", number: 8, seats: 4, area: "patio" },
  { id: "t-9", number: 9, seats: 6, area: "indoor" },
  { id: "t-10", number: 10, seats: 6, area: "patio" },
  { id: "t-11", number: 11, seats: 8, area: "private" },
  { id: "t-12", number: 12, seats: 10, area: "private" },
];

/** Knowledge base used by the FAQ agent (on top of settings and menu data). */
export const KNOWLEDGE_BASE: { topic: string; keywords: string[]; answer: string }[] = [
  { topic: "Halal", keywords: ["halal", "zabiha"], answer: "All meat at Saffron Grill is certified zabiha halal, and we cook without alcohol." },
  { topic: "Allergen kitchen", keywords: ["cross", "contamination", "nut-free", "celiac", "allergy", "allergic"], answer: "Our kitchen handles nuts, dairy, gluten and fish. We prepare allergy orders separately, but we can't guarantee zero cross-contact." },
  { topic: "Spice level", keywords: ["spice", "spicy", "mild", "hot", "heat"], answer: "Most dishes can be made mild, medium or hot. Just tell us your preferred spice level when you order." },
  { topic: "Catering", keywords: ["catering", "event", "party trays", "large order", "wedding"], answer: "We cater events from 15 to 200 guests with party trays. Larger orders need 48 hours' notice; the manager can quote you." },
  { topic: "Private dining", keywords: ["private", "room", "group", "birthday"], answer: "Our private room seats up to 18 guests. Groups over 10 have a set menu from $45 per person." },
  { topic: "Kids", keywords: ["kids", "children", "high chair", "child"], answer: "We're family-friendly, with high chairs available and a mild kids' plate of chicken tikka, rice and naan for $9.95." },
  { topic: "Vegan", keywords: ["vegan", "plant"], answer: "Vegan options include Vegetable Samosa, Chana Masala, Jeera Rice, Tandoori Roti, Kachumber Salad and Mint Lemonade." },
  { topic: "Delivery time", keywords: ["how long", "delivery time", "eta", "wait"], answer: "Pickup orders are usually ready in about 25 minutes; delivery takes 40 to 55 minutes depending on distance." },
  { topic: "Gift cards", keywords: ["gift card", "voucher"], answer: "Gift cards are sold in the restaurant in any amount from $25." },
  { topic: "Dress code", keywords: ["dress", "attire"], answer: "There's no dress code. Come as you are." },
  { topic: "Wi-Fi", keywords: ["wifi", "wi-fi", "internet"], answer: "Free Wi-Fi is available for dine-in guests; ask your server for the password." },
  { topic: "Accessibility", keywords: ["wheelchair", "accessible", "step-free", "accessibility"], answer: "The dining room and restroom are step-free and wheelchair accessible." },
];

// ───────────────────────────── Demo history ─────────────────────────────

/** Small deterministic PRNG so the demo data looks the same on every boot. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FIRST = ["Ayesha", "Daniel", "Priya", "Marcus", "Sofia", "Omar", "Hannah", "Leo", "Fatima", "Chris", "Nadia", "Ethan", "Zara", "Kevin", "Mei", "Bilal", "Grace", "Tom", "Sana", "Ryan"];
const LAST = ["Khan", "Miller", "Patel", "Johnson", "Rossi", "Siddiqui", "Lee", "Garcia", "Ahmed", "Brown", "Chen", "Hussain", "Walker", "Nguyen", "Malik", "Davis"];

export interface SeedBundle {
  customers: Customer[];
  orders: Order[];
  reservations: Reservation[];
  calls: CallRecord[];
  notifications: NotificationRecord[];
  nextOrderNumber: number;
}

export function priceLine(item: MenuItem, quantity: number, size: string | null, addOns: string[]): OrderItem {
  const sizeExtra = size ? item.sizes.find((s) => s.name === size)?.price ?? 0 : 0;
  const addOnExtra = addOns.reduce((sum, a) => sum + (item.addOns.find((o) => o.name === a)?.price ?? 0), 0);
  const unitPrice = round2(item.price + sizeExtra + addOnExtra);
  return {
    menuItemId: item.id,
    name: item.name,
    quantity,
    size,
    addOns,
    notes: "",
    unitPrice,
    lineTotal: round2(unitPrice * quantity),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Builds a week of believable history (orders, bookings, calls, texts) relative to "now",
 * so the dashboard and analytics look alive on first run.
 */
export function buildDemoHistory(settings: Settings = DEFAULT_SETTINGS, menu: MenuItem[] = DEFAULT_MENU, now = new Date()): SeedBundle {
  const rand = rng(20261109);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const tz = settings.timezone;
  const today = localParts(tz, now);

  const customers: Customer[] = [];
  for (let i = 0; i < 26; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    customers.push({
      id: `c-${i + 1}`,
      phone: `+1212555${String(1000 + i * 37).slice(-4)}`,
      name: `${first} ${last}`,
      totalOrders: 0,
      lastOrderId: null,
      notes: i % 9 === 0 ? "Prefers extra spicy" : "",
      createdAt: new Date(now.getTime() - (30 - i) * 86400000).toISOString(),
    });
  }

  const orders: Order[] = [];
  const calls: CallRecord[] = [];
  const reservations: Reservation[] = [];
  const notifications: NotificationRecord[] = [];
  let orderNumber = 1001;
  const available = menu.filter((m) => m.isAvailable);
  const upsells = menu.filter((m) => m.isUpsell);

  for (let dayOffset = -6; dayOffset <= 0; dayOffset++) {
    const date = addDays(today.date, dayOffset);
    const isToday = dayOffset === 0;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const busy = weekday === 5 || weekday === 6 ? 1.5 : 1;
    const count = Math.round((isToday ? 9 : 16) * busy + rand() * 5);

    // spread over lunch (12-14) and dinner (18-21:30); today's activity runs up to "now" so the demo always looks live.
    // Times are sorted first so order numbers rise with the clock.
    const minutes: number[] = [];
    for (let n = 0; n < count; n++) {
      const dinner = rand() < 0.65;
      let minute = (dinner ? 18 * 60 : 12 * 60) + Math.floor(rand() * (dinner ? 210 : 140));
      if (isToday) minute = today.minutes - 3 - Math.floor(Math.pow(rand(), 1.6) * 300);
      if (minute >= 0) minutes.push(minute);
    }
    minutes.sort((x, y) => x - y);

    for (const minute of minutes) {
      const hh = String(Math.floor(minute / 60)).padStart(2, "0");
      const mm = String(minute % 60).padStart(2, "0");
      const createdAt = zonedToDate(date, `${hh}:${mm}`, tz);
      if (createdAt.getTime() > now.getTime()) continue;

      const customer = pick(customers);
      const lineCount = 1 + Math.floor(rand() * 3);
      const items: OrderItem[] = [];
      for (let l = 0; l < lineCount; l++) {
        const item = pick(available);
        if (items.some((i) => i.menuItemId === item.id)) continue;
        const size = item.sizes.length ? (rand() < 0.2 ? item.sizes[1].name : item.sizes[0].name) : null;
        items.push(priceLine(item, rand() < 0.3 ? 2 : 1, size, []));
      }
      const upsellAccepted = rand() < 0.42;
      const upsellPick = upsells.find((u) => !items.some((i) => i.menuItemId === u.id) && rand() < 0.6) ?? upsells.find((u) => !items.some((i) => i.menuItemId === u.id));
      if (upsellAccepted && upsellPick) items.push(priceLine(upsellPick, 1, null, []));
      const type = rand() < 0.45 ? "delivery" : "pickup";
      const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
      const tax = round2(subtotal * settings.taxRate);
      const deliveryFee = type === "delivery" ? settings.deliveryFee : 0;
      const total = round2(subtotal + tax + deliveryFee);
      const ageMin = (now.getTime() - createdAt.getTime()) / 60000;
      let status: Order["status"] = "completed";
      if (isToday && ageMin < 12) status = "new";
      else if (isToday && ageMin < 28) status = "preparing";
      else if (isToday && ageMin < 40) status = type === "delivery" ? "out_for_delivery" : "ready";
      if (!isToday && rand() < 0.03) status = "cancelled";

      const id = `o-${orderNumber}`;
      const order: Order = {
        id,
        orderNumber,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        type,
        address: type === "delivery" ? `${100 + Math.floor(rand() * 300)} ${pick(["Sullivan St", "MacDougal St", "W 4th St", "Thompson St", "Bedford St", "Carmine St"])}, New York, NY ${pick(settings.deliveryZips)}` : null,
        items,
        subtotal,
        tax,
        deliveryFee,
        total,
        status,
        channel: rand() < 0.86 ? "phone" : "web_chat",
        upsellAccepted,
        readyAt: new Date(createdAt.getTime() + settings.avgPrepMinutes * 60000).toISOString(),
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      };
      orders.push(order);
      customer.totalOrders += 1;
      customer.lastOrderId = id;
      orderNumber++;

      const agents: AgentId[] = rand() < 0.3 ? ["receptionist", "faq", "order"] : ["receptionist", "order"];
      calls.push(makeCall({
        id: `call-${id}`,
        createdAt,
        customer,
        agents,
        outcome: "order_placed",
        summary: `${customer.name.split(" ")[0]} ordered ${items.map((i) => `${i.quantity}× ${i.name}`).join(", ")} for ${type}, $${total.toFixed(2)}.${upsellAccepted ? " Accepted the upsell." : ""}`,
        orderId: id,
        duration: 95 + Math.floor(rand() * 140),
        lines: [
          ["agent", "receptionist", `Thanks for calling ${settings.restaurantName}, this is Aria. Are you calling to order, book a table, or with a question?`],
          ["caller", undefined, `Hi, I'd like to place an order for ${type}.`],
          ["agent", "order", `Of course! What can I get started for you?`],
          ["caller", undefined, items.map((i) => `${i.quantity} ${i.name}`).join(" and ")],
          ["agent", "order", `Got it. That comes to $${total.toFixed(2)} including tax${deliveryFee ? " and delivery" : ""}. Your order number is ${order.orderNumber}.`],
        ],
      }));
      notifications.push({
        id: `n-${id}`,
        kind: "order_confirmation",
        channel: "sms",
        to: customer.phone,
        body: `Saffron Grill: order #${order.orderNumber} confirmed, $${total.toFixed(2)}. Ready around ${new Date(order.readyAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}.`,
        status: "simulated",
        provider: "demo",
        relatedId: id,
        createdAt: createdAt.toISOString(),
      });
    }

    // a few question-only and abandoned calls per day
    const extra = 3 + Math.floor(rand() * 3);
    for (let e = 0; e < extra; e++) {
      const minute = isToday ? Math.max(0, today.minutes - 5 - Math.floor(rand() * 280)) : 12 * 60 + Math.floor(rand() * 540);
      const createdAt = zonedToDate(date, `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`, tz);
      if (createdAt.getTime() > now.getTime()) continue;
      const customer = pick(customers);
      const outcome: CallOutcome = pick(["question_answered", "question_answered", "question_answered", "abandoned", "transferred"]);
      const q = pick([
        ["Do you have parking nearby?", settings.parking],
        ["Is the biryani gluten-free?", "Yes, our Chicken Biryani is gluten-free. It does contain dairy, from the yogurt marinade and raita."],
        ["What time do you close tonight?", "We're open until 10 PM tonight."],
        ["Is your meat halal?", "Yes, all our meat is certified zabiha halal."],
        ["Do you deliver to 10014?", "Yes, 10014 is in our delivery zone. Delivery is $3.99 with a $20 minimum."],
      ]);
      calls.push(makeCall({
        id: `call-q-${date}-${e}`,
        createdAt,
        customer,
        agents: outcome === "transferred" ? ["receptionist"] : ["receptionist", "faq"],
        outcome,
        summary:
          outcome === "abandoned"
            ? "Caller hung up before stating a request."
            : outcome === "transferred"
              ? "Caller asked for the manager about a catering quote; transferred to staff."
              : `Asked "${q[0]}" and got an answer from the FAQ agent.`,
        orderId: null,
        duration: outcome === "abandoned" ? 9 + Math.floor(rand() * 15) : 40 + Math.floor(rand() * 60),
        lines:
          outcome === "abandoned"
            ? [["agent", "receptionist", `Thanks for calling ${settings.restaurantName}, this is Aria. How can I help?`]]
            : [
                ["agent", "receptionist", `Thanks for calling ${settings.restaurantName}, this is Aria. How can I help?`],
                ["caller", undefined, q[0]],
                ["agent", outcome === "transferred" ? "receptionist" : "faq", outcome === "transferred" ? "Let me connect you with our manager now." : q[1]],
              ],
      }));
    }
  }

  // Reservations: past week (completed) + next 7 days (booked)
  const occasions = ["", "", "", "Birthday", "Anniversary", "Business dinner", "Date night"];
  let code = 4100;
  for (let dayOffset = -6; dayOffset <= 6; dayOffset++) {
    const date = addDays(today.date, dayOffset);
    const count = dayOffset < 0 ? 5 + Math.floor(rand() * 4) : dayOffset === 0 ? 8 : 3 + Math.floor(rand() * 5);
    const taken: { tableId: string; minutes: number }[] = [];
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    for (let r = 0; r < count; r++) {
      const slot = pick(["12:30", "13:00", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"]);
      const partySize = pick([2, 2, 2, 3, 4, 4, 5, 6, 8]);
      const free = (t: DiningTable) => !taken.some((x) => x.tableId === t.id && Math.abs(x.minutes - toMin(slot)) < 90);
      const table = DEFAULT_TABLES.find((t) => t.seats >= partySize && t.seats <= partySize + 4 && free(t));
      if (!table) continue;
      taken.push({ tableId: table.id, minutes: toMin(slot) });
      const customer = pick(customers);
      const at = zonedToDate(date, slot, tz);
      const past = at.getTime() < now.getTime();
      let status: Reservation["status"] = past ? (rand() < 0.08 ? "no_show" : "completed") : "booked";
      if (dayOffset === 0 && past && now.getTime() - at.getTime() < 75 * 60000) status = "seated";
      const createdAt = new Date(at.getTime() - (1 + Math.floor(rand() * 4)) * 86400000);
      const id = `r-${code}`;
      reservations.push({
        id,
        code: `SG${code}`,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        date,
        time: slot,
        partySize,
        tableId: table.id,
        occasion: pick(occasions),
        seating: table.area,
        status,
        channel: "phone",
        reminderSent: past,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      });
      code++;
      if (createdAt.getTime() < now.getTime()) {
        calls.push(makeCall({
          id: `call-${id}`,
          createdAt,
          customer,
          agents: ["receptionist", "reservation"],
          outcome: "reservation_booked",
          summary: `${customer.name.split(" ")[0]} booked a table for ${partySize} on ${prettyDate(date)} at ${to12h(slot)}.`,
          orderId: null,
          reservationId: id,
          duration: 70 + Math.floor(rand() * 80),
          lines: [
            ["agent", "receptionist", `Thanks for calling ${settings.restaurantName}, this is Aria. How can I help?`],
            ["caller", undefined, `I'd like to book a table for ${partySize}.`],
            ["agent", "reservation", `Happy to help. You're booked for ${partySize} on ${prettyDate(date)} at ${to12h(slot)}. Your confirmation code is SG${code - 1}.`],
          ],
        }));
      }
    }
  }
  // two waitlist entries for tonight
  for (let w = 0; w < 2; w++) {
    const customer = pick(customers);
    reservations.push({
      id: `r-w${w}`,
      code: `SGW${w + 1}`,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      date: today.date,
      time: w === 0 ? "20:00" : "20:30",
      partySize: w === 0 ? 4 : 6,
      tableId: null,
      occasion: "",
      seating: "any",
      status: "waitlist",
      channel: "phone",
      reminderSent: false,
      createdAt: new Date(now.getTime() - (w + 1) * 3600000).toISOString(),
      updatedAt: new Date(now.getTime() - (w + 1) * 3600000).toISOString(),
    });
  }

  calls.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { customers, orders, reservations, calls, notifications: notifications.slice(0, 60), nextOrderNumber: orderNumber };
}

function makeCall(input: {
  id: string;
  createdAt: Date;
  customer: Customer;
  agents: AgentId[];
  outcome: CallOutcome;
  summary: string;
  orderId: string | null;
  reservationId?: string | null;
  duration: number;
  lines: [string, AgentId | undefined, string][];
}): CallRecord {
  const t = input.createdAt.getTime();
  return {
    id: input.id,
    externalId: null,
    channel: "phone",
    callerPhone: input.customer.phone,
    callerName: input.customer.name,
    agents: input.agents,
    outcome: input.outcome,
    summary: input.summary,
    transcript: input.lines.map(([role, agent, text], i) => ({
      role: role as "caller" | "agent",
      agent,
      text,
      at: new Date(t + i * 9000).toISOString(),
    })),
    recordingUrl: null,
    durationSeconds: input.duration,
    cost: Math.round(input.duration * 0.0012 * 100) / 100,
    orderId: input.orderId,
    reservationId: input.reservationId ?? null,
    createdAt: input.createdAt.toISOString(),
  };
}
