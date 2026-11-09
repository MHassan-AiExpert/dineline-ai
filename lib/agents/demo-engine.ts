/**
 * Built-in rule-based crew. It runs the same four agents, handoffs and tools as the LLM crew,
 * so the dashboard and chatbot work with zero API keys. With LLM_API_KEY set, the LLM crew is used.
 */
import type { AgentId, TraceEvent } from "../types";
import { executeTool, type ToolContext, type ToolResult } from "../tools";
import { getStore } from "../store";
import { bestMatch, matchMenu, normalize } from "../menu-match";
import { resolveDate, resolvePartySize, resolvePhone, resolveTime, resolveZip } from "../parse";
import { to12h } from "../time";
import type { CrewSession } from "./session";

interface DraftLine {
  name: string;
  quantity: number;
  size?: string;
  notes?: string;
}

export interface DemoState {
  order: {
    items: DraftLine[];
    type?: "pickup" | "delivery";
    address?: string;
    name?: string;
    phone?: string;
    done?: boolean;
    upsellOffered?: string | null;
    upsellAccepted?: boolean;
    awaiting?: "upsell" | "confirm" | "change" | "name" | "phone" | "address" | "type" | "size";
    sizeFor?: string;
  };
  booking: {
    mode?: "new" | "modify" | "cancel";
    date?: string;
    time?: string;
    partySize?: number;
    name?: string;
    occasion?: string;
    seating?: string;
    code?: string;
    alternatives?: string[];
    awaiting?: "alt" | "name" | "waitlist" | "confirm_cancel" | "code" | "change";
    waitlistAfterName?: boolean;
  };
}

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, dozen: 12 };

const isYes = (t: string) => /^(y|yes|yeah|yep|yup|sure|ok|okay|please|correct|sounds good|go ahead|that's right|thats right|do it|perfect|great|absolutely|definitely|why not|confirm|place it)\b/i.test(t.trim()) || /\b(yes please|go ahead|place (it|the order)|that's correct|sounds good)\b/i.test(t);
const isNo = (t: string) => /^(n|no|nope|nah|no thanks|not really|that's all|thats all|i'm good|im good|nothing else)\b/i.test(t.trim());
const isDone = (t: string) => /\b(that'?s (all|it|everything)|nothing else|that will be all|i'?m done|done|no,? that'?s it|that should be it|no more)\b/i.test(t);

export function demoGreeting(restaurant: string, firstName?: string) {
  return firstName
    ? `Hi ${firstName}, welcome back to ${restaurant}! This is Aria. Are you calling to order, book a table, or with a question?`
    : `Thanks for calling ${restaurant}, this is Aria. Are you calling to place an order, book a table, or with a question?`;
}

export type Intent = "order" | "reservation" | "faq" | "status" | "human" | "modify_booking" | "cancel_booking" | "greeting" | "thanks" | null;

export function detectIntent(text: string, hasMenuItem: boolean): Intent {
  const t = text.toLowerCase();
  if (/\b(manager|human|real person|someone real|staff member|speak to (a|some)one|talk to (a|some)one|operator)\b/.test(t)) return "human";
  if (/\b(where'?s|where is|status of|track)\b.*\border\b|\border status\b|\bis my order\b/.test(t)) return "status";
  if (/\b(cancel)\b.*\b(booking|reservation|table)\b|\bcancel (my|the) (booking|reservation)\b/.test(t)) return "cancel_booking";
  if (/\b(change|move|reschedule|modify|update)\b.*\b(booking|reservation|table)\b/.test(t)) return "modify_booking";
  if (/\b(book|reserve|reservation|a table|table for|party of|seat us|dine in|get a table)\b/.test(t)) return "reservation";
  if (/\b(same as (last time|before)|my usual|reorder|repeat my( last)? order)\b/.test(t)) return "order";
  if (/\b(order|delivery|deliver it|pick ?up|takeout|take out|take away|to go|i'?d like|i want|i'?ll have|i'?ll take|can i get|could i get|get me|add)\b/.test(t) && !/\b(do you deliver|deliver to|delivery (area|zone|fee|time))\b/.test(t)) return "order";
  if (hasMenuItem && /\b(\d+|one|two|three|four|five|a|an)\s+\w+/.test(t) && !/\?|\b(is|does|are|contain|have)\b/.test(t)) return "order";
  if (/\?|\b(what|when|where|how|which|do you|does|is (the|your|it|there)|are (you|your|the)|can i (pay|park|bring)|hours|open|close|parking|halal|allergen|allergy|gluten|vegan|vegetarian|nut|dairy|spicy|address|location|wifi|kids|catering|payment)\b/.test(t)) return "faq";
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|salam|assalam)/.test(t)) return "greeting";
  if (/\b(thank|thanks|bye|goodbye|cheers)\b/.test(t)) return "thanks";
  return null;
}

interface ParsedItem {
  line: DraftLine;
  ambiguousSizes?: string[];
}

/** Pulls "2 chicken biryani family, a garlic naan and one mango lassi no ice" into draft lines. */
async function parseItems(text: string): Promise<{ items: ParsedItem[]; unknown: string[] }> {
  const menu = await getStore().listMenu();
  const cleaned = text
    .toLowerCase()
    .replace(/\b(can i (get|have)|could i (get|have)|i'?d like|i would like|i want|i'?ll have|i'?ll take|let me get|get me|please|for (pickup|delivery|pick up)|to go|also|and also|add|plus|actually|order|place an order|i need)\b/g, ",")
    .replace(/\band\b|&|\+|;|\bwith\b(?=\s+(?:a|an|one|two|three|\d))/g, ",");
  const chunks = cleaned.split(",").map((c) => c.trim()).filter((c) => c.length > 1);
  const items: ParsedItem[] = [];
  const unknown: string[] = [];
  for (const chunk of chunks) {
    let quantity = 1;
    let rest = chunk;
    const hadQuantity = /^(\d{1,2})\s*x?\s+|^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple of|dozen)\s+/.test(chunk);
    const q = chunk.match(/^(\d{1,2})\s*x?\s+|^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple of|dozen)\s+/);
    if (q) {
      quantity = q[1] ? Number(q[1]) : NUM_WORDS[q[2].replace(" of", "")] ?? 1;
      rest = chunk.slice(q[0].length);
    }
    const sizeMatch = rest.match(/\b(family|regular|half|full|large|small)\b(\s+size)?/);
    let size = sizeMatch ? sizeMatch[1] : undefined;
    if (size === "large") size = "family";
    if (size === "small") size = "regular";
    const notesMatch = rest.match(/\b(no [a-z]+|extra [a-z]+|without [a-z]+|mild|medium|very spicy|extra spicy|less spicy)\b/g);
    rest = rest.replace(/\b(packs?|portions?|plates?|orders?|servings?|ones?|pieces?)\b/g, " ").replace(/\s+/g, " ").trim();
    const nameText = rest.replace(/\b(family|regular|half|full|large|small)\b(\s+size)?/g, "").replace(/\b(no [a-z]+|extra [a-z]+|without [a-z]+|mild|medium|very spicy|extra spicy|less spicy)\b/g, "").trim();
    if (!nameText || /^(that'?s all|that'?s it|nothing else|delivery|pickup|pick up|thanks|thank you|yes|no|ok|okay)$/.test(nameText)) continue;
    const item = bestMatch(nameText, menu);
    if (!item) {
      if (hadQuantity && nameText.split(" ").length <= 4 && !/\b(is|are|what|how|when|where|do|does|table|booking|reservation|people|guests)\b/.test(nameText)) unknown.push(nameText);
      continue;
    }
    const line: DraftLine = { name: item.name, quantity, notes: notesMatch?.join(", ") };
    let ambiguousSizes: string[] | undefined;
    if (item.sizes.length) {
      const chosen = size ? item.sizes.find((s) => normalize(s.name) === normalize(size!)) : undefined;
      if (chosen) line.size = chosen.name;
      else ambiguousSizes = item.sizes.map((s) => s.name);
    }
    items.push({ line, ambiguousSizes });
  }
  return { items, unknown };
}

const NOT_NAMES = /^(a|an|the|for|at|on|in|to|it|is|my|our|delivery|pickup|tonight|today|tomorrow|birthday|anniversary|dinner|lunch|table|booking|reservation|order|people|guests|just|here|calling|fine|good|great|okay|ok|yes|no|sure|thanks|thank|one|two|three|four|five|six|seven|eight|nine|ten|around|about|half)$/i;

function extractName(text: string): string | null {
  const m = text.match(/\b(?:my name is|name'?s|it'?s|this is|i am|i'm|under|for|put it under)\s+([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)?)/i);
  const raw = m ? m[1] : null;
  if (!raw) return null;
  if (NOT_NAMES.test(raw.split(" ")[0]) || /\d/.test(raw)) return null;
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function bareName(text: string): string | null {
  const t = text.trim().replace(/[.!]$/, "");
  if (/^[a-z][a-z'-]+(\s+[a-z][a-z'-]+)?$/i.test(t) && t.length <= 30 && !isYes(t) && !isNo(t) && !t.split(/\s+/).some((w) => NOT_NAMES.test(w)))
    return t.replace(/\b\w/g, (c) => c.toUpperCase());
  return null;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const listLines = (lines: DraftLine[]) =>
  lines.map((l) => `${l.quantity} ${l.name}${l.size && l.size !== "Regular" && l.size !== "Half" ? ` (${l.size})` : ""}${l.notes ? `, ${l.notes}` : ""}`).join(", ");

export async function demoTurn(session: CrewSession, text: string): Promise<{ reply: string; events: TraceEvent[] }> {
  const events: TraceEvent[] = [];
  const ctx: ToolContext = { callerPhone: session.callerPhone, channel: session.channel, sessionId: session.id, effects: session.effects };
  const at = () => new Date().toISOString();

  const tool = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    events.push({ type: "tool_call", agent: session.activeAgent, tool: name, args, at: at() });
    const res = await executeTool(name, args, ctx);
    events.push({ type: "tool_result", agent: session.activeAgent, tool: name, ok: res.ok, summary: res.summary, at: at() });
    return res;
  };
  const handoff = (to: AgentId, reason: string) => {
    if (session.activeAgent === to) return;
    events.push({ type: "handoff", from: session.activeAgent, to, reason, at: at() });
    events.push({ type: "agent", agent: to, at: at() });
    session.activeAgent = to;
    if (!session.agentsUsed.includes(to)) session.agentsUsed.push(to);
  };

  const menu = await getStore().listMenu();
  const mentionsItem = matchMenu(text, menu).some((m) => m.score >= 0.85) || (await parseItems(text)).items.length > 0;
  const o = session.demo.order;
  const b = session.demo.booking;

  // A pending question from the active specialist takes priority over intent switching.
  const answeringOrder = session.activeAgent === "order" && !!o.awaiting;
  const answeringBooking = session.activeAgent === "reservation" && !!b.awaiting;
  const intent = detectIntent(text, mentionsItem);

  if (!answeringOrder && !answeringBooking) {
    if (intent === "human") {
      handoff("receptionist", "caller asked for a person");
      await tool("transfer_to_staff", { reason: "Caller asked to speak with a person" });
      return { reply: "Of course. I'm connecting you with a team member now; please hold for a moment.", events };
    }
    if (intent === "status") {
      if (session.activeAgent !== "order") handoff("receptionist", "order status request");
      const num = text.match(/\b(\d{4})\b/)?.[1];
      const res = await tool("get_order_status", num ? { order_number: num } : {});
      return {
        reply: res.ok ? `Order #${res.data.order_number} is ${res.data.status}. It should be ready around ${res.data.ready_at}.` : "I couldn't find a recent order for this number. Do you have the order number handy?",
        events,
      };
    }
    if ((intent === "reservation" || intent === "modify_booking" || intent === "cancel_booking") && session.activeAgent !== "reservation") {
      handoff("reservation", intent === "reservation" ? "wants to book a table" : intent === "cancel_booking" ? "wants to cancel a booking" : "wants to change a booking");
    } else if (intent === "order" && session.activeAgent !== "order") {
      handoff("order", "wants to place an order");
    } else if (intent === "faq" && session.activeAgent !== "faq" && !(session.activeAgent === "order" && mentionsItem && !/\?/.test(text))) {
      handoff("faq", `question: ${text.slice(0, 80)}`);
    }
  }

  if (session.activeAgent === "receptionist") {
    if (intent === "thanks") return { reply: "You're welcome! Have a lovely day.", events };
    if (mentionsItem) {
      handoff("order", "mentioned menu items");
      return orderAgent();
    }
    return { reply: "I can take an order for pickup or delivery, book you a table, or answer a question. What would you like to do?", events };
  }
  if (session.activeAgent === "order") return orderAgent();
  if (session.activeAgent === "reservation") return reservationAgent();
  return faqAgent();

  // ───────────────────────────── ORDER AGENT ─────────────────────────────
  async function orderAgent(): Promise<{ reply: string; events: TraceEvent[] }> {
    const lower = text.toLowerCase();
    const wasAwaiting = o.awaiting;
    let answeredField = false;

    // answers to pending questions
    if (o.awaiting === "size" && o.sizeFor) {
      const line = o.items.find((l) => l.name === o.sizeFor && !l.size);
      const item = menu.find((m) => m.name === o.sizeFor);
      const size = item?.sizes.find((s) => lower.includes(s.name.toLowerCase())) ?? (/\b(big|large)\b/.test(lower) ? item?.sizes[1] : /\b(small|normal|standard)\b/.test(lower) ? item?.sizes[0] : undefined);
      if (line && size) {
        line.size = size.name;
        // "two family packs" answers the size and the quantity together
        const qty = lower.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
        if (qty) line.quantity = NUM_WORDS[qty[1]] ?? Number(qty[1]);
        o.awaiting = undefined;
        o.sizeFor = undefined;
        answeredField = true;
      } else if (line && item) {
        return { reply: `Which size for the ${item.name}: ${item.sizes.map((s) => `${s.name}${s.price ? ` (+${money(s.price)})` : ""}`).join(" or ")}?`, events };
      }
    } else if (o.awaiting === "upsell") {
      if (isYes(text) && o.upsellOffered) {
        o.items.push({ name: o.upsellOffered, quantity: 1 });
        o.upsellAccepted = true;
      }
      o.awaiting = undefined;
    } else if (o.awaiting === "confirm") {
      if (isYes(text)) {
        o.awaiting = undefined;
        return placeOrder();
      }
      o.awaiting = undefined;
      if (isNo(text) && !mentionsItem) {
        o.awaiting = "change";
        return { reply: "No problem. What would you like to change? You can add or remove items, or switch between pickup and delivery.", events };
      }
      o.done = false;
    } else if (o.awaiting === "change") {
      o.awaiting = undefined;
      // "yes" / "it's fine" / "nothing" after "what would you like to change?" goes back to the read-back
      if (isYes(text) || isNo(text) || isDone(text) || /\b(fine|nothing|never ?mind|all good)\b/i.test(text)) o.done = true;
      else o.done = false;
      if (/\bdeliver/i.test(text)) {
        o.type = "delivery";
        o.address = undefined;
        o.done = true;
      } else if (/\b(pick ?up|collect)\b/i.test(text)) {
        o.type = "pickup";
        o.address = undefined;
        o.done = true;
      }
    } else if (o.awaiting === "name") {
      const n = extractName(text) ?? bareName(text);
      if (n) {
        o.name = n;
        o.awaiting = undefined;
        answeredField = true;
      } else return { reply: "Sorry, what name should I put the order under?", events };
    } else if (o.awaiting === "phone") {
      const p = resolvePhone(text);
      if (p) {
        o.phone = p;
        o.awaiting = undefined;
        answeredField = true;
      } else return { reply: "Could you give me a 10-digit callback number?", events };
    } else if (o.awaiting === "address") {
      const zip = resolveZip(text);
      if (!zip) return { reply: "What's the full address, including the ZIP code?", events };
      const zone = await tool("check_delivery_zone", { address: text });
      if (!zone.data.in_zone) {
        o.awaiting = "type";
        o.type = undefined;
        return { reply: `Sorry, we don't deliver to ${zip}. Would you like to make it a pickup order instead?`, events };
      }
      o.address = text.trim();
      o.awaiting = undefined;
      answeredField = true;
    } else if (o.awaiting === "type") {
      if (/deliver/.test(lower) || resolveZip(text)) o.type = "delivery";
      else if (/pick|collect|takeout|take out|come get|yes|sure|ok/.test(lower)) o.type = "pickup";
      if (!o.type) return { reply: "Sorry, is that for pickup or delivery?", events };
      o.awaiting = undefined;
    }

    // reorder last order
    if (/\b(same as (last time|before|usual)|my usual|reorder|repeat (my|the) (last )?order)\b/.test(lower)) {
      const res = await tool("lookup_caller", {});
      const last = res.data.last_order as { items: { name: string; quantity: number; size: string | null }[] } | null;
      if (last) {
        o.items = last.items.map((i) => ({ name: i.name, quantity: i.quantity, size: i.size ?? undefined }));
        o.name ??= String(res.data.name);
      } else return { reply: "I don't see a previous order for this number. What would you like today?", events };
    }

    // removals
    const remove = answeredField ? null : lower.match(/\b(?:remove|take off|cancel|no more|drop)\s+(?:the\s+)?(.+)/);

    if (remove) {
      const item = bestMatch(remove[1], menu);
      if (item) o.items = o.items.filter((l) => l.name !== item.name);
    }

    // new items
    let addedThisTurn = false;
    if (!remove && !answeredField) {
      const { items, unknown } = await parseItems(text);
      for (const p of items) {
        const existing = o.items.find((l) => l.name === p.line.name && l.size === p.line.size && !p.ambiguousSizes);
        const item = menu.find((m) => m.name === p.line.name)!;
        if (!item.isAvailable) {
          const res = await tool("check_item", { name: item.name });
          const alts = (res.data.alternatives as string[] | undefined) ?? [];
          return { reply: `Sorry, the ${item.name} is sold out today.${alts.length ? ` Can I suggest ${alts.slice(0, 2).join(" or ")} instead?` : ""}`, events };
        }
        if (existing) existing.quantity += p.line.quantity;
        else o.items.push({ ...p.line });
        addedThisTurn = true;
        if (p.ambiguousSizes && !o.awaiting) {
          o.awaiting = "size";
          o.sizeFor = p.line.name;
        }
      }
      if (unknown.length && !items.length && !o.awaiting) {
        const res = await tool("check_item", { name: unknown[0] });
        if (!res.data.found) {
          const sugg = (res.data.suggestions as string[]) ?? [];
          return { reply: `Sorry, we don't have ${unknown[0]}. Popular picks are ${sugg.slice(0, 3).join(", ")}. What would you like?`, events };
        }
      }
    }

    // order type, address, name, phone mentioned inline
    const typeBefore = o.type;
    if (!o.type) {
      if (/\bdeliver(y|ed)?\b/.test(lower)) o.type = "delivery";
      else if (/\b(pick ?up|collect|takeout|take out|to go|come (get|grab))\b/.test(lower)) o.type = "pickup";
    }
    if (o.type === "delivery" && !o.address && resolveZip(text)) {
      const zone = await tool("check_delivery_zone", { address: text });
      if (zone.data.in_zone) o.address = text.trim();
      else return { reply: `Sorry, ${zone.data.zip} is outside our delivery area. Would pickup work instead?`, events };
    }
    const inlineName = extractName(text);
    if (inlineName && !o.name && !/\bfor (\d|two|three|four|five|six)\b/i.test(text)) o.name = inlineName;
    const inlinePhone = resolvePhone(text);
    if (inlinePhone) o.phone = inlinePhone;
    if (isDone(text) || (isNo(text) && o.items.length && !o.awaiting)) o.done = true;

    if (o.awaiting === "size" && o.sizeFor) {
      const item = menu.find((m) => m.name === o.sizeFor)!;
      return { reply: `Got it. Would you like the ${item.name} in ${item.sizes.map((s) => `${s.name}${s.price ? ` (+${money(s.price)})` : ""}`).join(" or ")}?`, events };
    }

    if (!o.items.length) return { reply: "Sure! What would you like to order?", events };

    // A full sentence like "2 biryani for pickup" counts as a complete order; otherwise keep collecting.
    const completeSentence = addedThisTurn && !typeBefore && !!o.type;
    if (!o.done && !completeSentence && !addedThisTurn && isYes(text) && !wasAwaiting) {
      return { reply: "Sure, what else would you like?", events };
    }
    if (!o.done && !completeSentence && wasAwaiting !== "upsell" && wasAwaiting !== "confirm") {
      return { reply: `Got it: ${listLines(o.items)}. Anything else, or is that everything?`, events };
    }
    o.done = true;

    if (!o.type) {
      o.awaiting = "type";
      return { reply: "Will that be for pickup or delivery?", events };
    }
    if (o.type === "delivery" && !o.address) {
      o.awaiting = "address";
      return { reply: "What's the delivery address, including the ZIP code?", events };
    }

    if (o.upsellOffered === undefined) {
      const priced = await tool("price_order", { type: o.type, items: o.items.map(toArgs) });
      const sugg = (priced.data.upsell_suggestions as string[]) ?? [];
      const pickName = sugg[0]?.replace(/\s*\(\$.*\)$/, "");
      if (pickName) {
        o.upsellOffered = pickName;
        o.awaiting = "upsell";
        const item = menu.find((m) => m.name === pickName);
        return { reply: `Perfect. Would you like to add a ${pickName}${item ? ` for ${money(item.price)}` : ""}? It goes great with that.`, events };
      }
      o.upsellOffered = null;
    }

    if (!o.name) {
      if (session.callerName) o.name = session.callerName;
      else {
        o.awaiting = "name";
        return { reply: "Great. What name should I put the order under?", events };
      }
    }
    if (!o.phone && !session.callerPhone) {
      o.awaiting = "phone";
      return { reply: `Thanks, ${o.name.split(" ")[0]}. What's the best callback number?`, events };
    }

    const priced = await tool("price_order", { type: o.type, items: o.items.map(toArgs) });
    if (priced.data.below_delivery_minimum) {
      o.done = false;
      return { reply: `Delivery has a ${money(Number(priced.data.below_delivery_minimum))} minimum before tax, and you're at ${money(Number(priced.data.subtotal))}. Want to add something, or switch to pickup?`, events };
    }
    o.awaiting = "confirm";
    const fee = o.type === "delivery" ? ` and the ${money(Number(priced.data.deliveryFee))} delivery fee` : "";
    return {
      reply: `Let me read that back: ${listLines(o.items)}, for ${o.type}${o.type === "delivery" ? ` to ${o.address}` : ""}. Your total is ${money(Number(priced.data.total))} including tax${fee}. Shall I place the order?`,
      events,
    };
  }

  async function placeOrder(): Promise<{ reply: string; events: TraceEvent[] }> {
    const res = await tool("place_order", {
      customer_name: o.name,
      phone: o.phone || session.callerPhone,
      type: o.type,
      address: o.address,
      items: o.items.map(toArgs),
      upsell_accepted: o.upsellAccepted ?? false,
    });
    if (!res.ok) {
      o.done = false;
      return { reply: `I couldn't place that yet: ${String(res.data.error ?? res.summary)}`, events };
    }
    session.demo.order = { items: [] };
    return {
      reply: `Done! Your order number is ${res.data.order_number}, total ${money(Number(res.data.total))}. It'll be ready around ${res.data.ready_at}, and a confirmation text is on its way. Anything else I can help with?`,
      events,
    };
  }

  // ─────────────────────────── RESERVATION AGENT ───────────────────────────
  async function reservationAgent(): Promise<{ reply: string; events: TraceEvent[] }> {
    const settings = await getStore().getSettings();
    const lower = text.toLowerCase();
    if (intent === "cancel_booking") b.mode = "cancel";
    else if (intent === "modify_booking") b.mode = "modify";
    b.mode ??= "new";

    const code = text.match(/\bSGW?\s?\d{3,4}\b/i)?.[0].replace(/\s/g, "").toUpperCase();
    if (code) b.code = code;

    // Cancel flow
    if (b.mode === "cancel") {
      if (b.awaiting === "confirm_cancel") {
        b.awaiting = undefined;
        if (isYes(text)) {
          const res = await tool("cancel_booking", { code: b.code });
          session.demo.booking = {};
          return { reply: res.ok ? `All done, your booking ${res.data.code} for ${res.data.date} at ${res.data.time} is cancelled. You'll get a text shortly.` : String(res.data.error), events };
        }
        session.demo.booking = {};
        return { reply: "No problem, I've left your booking as it is. Anything else?", events };
      }
      const found = await tool("find_booking", b.code ? { code: b.code } : {});
      if (!found.ok) {
        b.awaiting = "code";
        return { reply: "I couldn't find a booking for this number. What's your confirmation code? It starts with SG.", events };
      }
      const first = (found.data.bookings as { code: string; date: string; time: string; party_size: number }[])[0];
      b.code = first.code;
      b.awaiting = "confirm_cancel";
      return { reply: `I found your booking ${first.code} for ${first.party_size} on ${first.date} at ${first.time}. Shall I cancel it?`, events };
    }

    // gather details
    const date = resolveDate(text, settings.timezone);
    const time = resolveTime(text);
    const size = resolvePartySize(text) ?? (b.awaiting === undefined && b.date && b.time && !b.partySize ? Number(text.match(/^\s*(\d{1,2})\s*$/)?.[1]) || null : null);
    if (date) b.date = date;
    if (size) b.partySize = size;
    if (/\b(patio|outside|outdoor)\b/.test(lower)) b.seating = "patio";
    if (/\b(inside|indoor)\b/.test(lower)) b.seating = "indoor";
    if (/\b(private|private room)\b/.test(lower)) b.seating = "private";
    const occ = lower.match(/\b(birthday|anniversary|date night|business|proposal|graduation)\b/);
    if (occ) b.occasion = occ[1][0].toUpperCase() + occ[1].slice(1);

    if (b.awaiting === "alt") {
      const alts = b.alternatives ?? [];
      const picked =
        time ??
        (/\b(first|earlier|earliest)\b/.test(lower) ? resolveTime(alts[0] ?? "") : /\b(second|later|last)\b/.test(lower) ? resolveTime(alts[alts.length - 1] ?? "") : isYes(text) && alts[0] ? resolveTime(alts[0]) : null);
      if (picked) {
        b.time = picked;
        b.awaiting = undefined;
      } else if (/\bwait ?list\b/.test(lower) || isNo(text)) {
        b.awaiting = "waitlist";
        return { reply: `I can add you to the waitlist for ${to12h(b.time!)} and text you if a table opens up. Would you like that?`, events };
      }
    } else if (time) b.time = time;

    if (b.awaiting === "waitlist") {
      if (isYes(text)) {
        if (!b.name) b.name = session.callerName ?? extractName(text) ?? undefined;
        if (!b.name) {
          b.awaiting = "name";
          b.waitlistAfterName = true;
          return { reply: "What name should I put on the waitlist?", events };
        }
        return joinWaitlist();
      }
      session.demo.booking = {};
      return { reply: "No problem. Is there anything else I can help you with?", events };
    }

    if (b.awaiting === "name") {
      const n = extractName(text) ?? bareName(text);
      if (!n) return { reply: occ ? `Lovely, I'll note the ${b.occasion?.toLowerCase()}. And what name should the booking be under?` : "Sorry, what name should the booking be under?", events };
      b.name = n;
      b.awaiting = undefined;
      if (b.waitlistAfterName) return joinWaitlist();
    }
    if (b.awaiting === "code" && b.code) b.awaiting = undefined;

    if (b.mode === "modify") {
      if (!b.code) {
        const found = await tool("find_booking", {});
        if (!found.ok) {
          b.awaiting = "code";
          return { reply: "Sure. What's the confirmation code for the booking you'd like to change?", events };
        }
        b.code = (found.data.bookings as { code: string }[])[0].code;
      }
      if (!date && !time && !size) {
        b.awaiting = "change";
        return { reply: `I have booking ${b.code}. What would you like to change it to: a new date, time or party size?`, events };
      }
      b.awaiting = undefined;
      const res = await tool("modify_booking", { code: b.code, date: date ?? undefined, time: time ?? undefined, party_size: size ?? undefined });
      if (res.ok) {
        session.demo.booking = {};
        return { reply: `Done, booking ${res.data.confirmation_code} is now for ${res.data.party_size} on ${res.data.date} at ${res.data.time}. I've texted you the update.`, events };
      }
      const alts = (res.data.alternatives as string[]) ?? [];
      return { reply: `${String(res.data.error)}${alts.length ? ` I could do ${alts.join(" or ")} instead.` : ""}`, events };
    }

    // new booking: if nothing booking-related was said and nothing is in progress, don't restart the questions
    const nothingYet = !b.date && !b.time && !b.partySize && !b.awaiting;
    if (nothingYet && intent !== "reservation" && !date && !time && !size) {
      session.demo.booking = {};
      if (intent === "thanks") return { reply: "You're welcome! Enjoy your evening.", events };
      return { reply: "Is there anything else I can help with: another booking, an order, or a question?", events };
    }

    const missing: string[] = [];
    if (!b.date) missing.push("which day");
    if (!b.time) missing.push("what time");
    if (!b.partySize) missing.push("how many guests");
    if (missing.length) {
      const have = [b.partySize ? `for ${b.partySize}` : "", b.date ? `on ${new Date(`${b.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}` : "", b.time ? `at ${to12h(b.time)}` : ""].filter(Boolean).join(" ");
      return { reply: `${have ? `Great, a table ${have}. ` : "I'd be happy to book you a table. "}Could you tell me ${missing.join(" and ")}?`, events };
    }

    if (!b.awaiting) {
      const avail = await tool("check_availability", { date: b.date, time: b.time, party_size: b.partySize, seating: b.seating });
      if (!avail.ok && avail.data.reason) {
        const alts = (avail.data.alternatives as string[]) ?? [];
        if (alts.length) {
          b.alternatives = alts;
          b.awaiting = "alt";
          return { reply: `${String(avail.data.reason)} I could do ${alts.join(", ")}. Would any of those work?`, events };
        }
        b.time = undefined;
        if (/passed|closed|60 days/.test(String(avail.data.reason))) b.date = undefined;
        return { reply: `${String(avail.data.reason)} What other day or time would suit you?`, events };
      }
      if (avail.data.large_party) {
        session.demo.booking = {};
        await tool("transfer_to_staff", { reason: `Large party of ${b.partySize} for ${b.date} at ${b.time}` });
        return { reply: `For a group of ${b.partySize}, our private dining team will look after you personally. I'm connecting you with them now.`, events };
      }
      if (!avail.ok) return { reply: String(avail.data.error ?? "Could you repeat the date, time and party size?"), events };
      if (!avail.data.available) {
        const alts = (avail.data.alternatives as string[]) ?? [];
        if (alts.length) {
          b.alternatives = alts;
          b.awaiting = "alt";
          return { reply: `${to12h(b.time!)} is fully booked on ${avail.data.pretty_date}, but I have ${alts.join(", ")}. Would one of those work?`, events };
        }
        b.awaiting = "waitlist";
        return { reply: `We're fully booked around ${to12h(b.time!)} on ${avail.data.pretty_date}. Would you like me to add you to the waitlist?`, events };
      }
    }

    if (!b.name) {
      b.name = session.callerName ?? undefined;
      if (!b.name) {
        b.awaiting = "name";
        return { reply: `Good news, I have a table for ${b.partySize} at ${to12h(b.time!)}. What name should I put the booking under?`, events };
      }
    }

    const res = await tool("create_booking", { customer_name: b.name, date: b.date, time: b.time, party_size: b.partySize, occasion: b.occasion, seating: b.seating, phone: session.callerPhone || "+12125550100" });
    if (!res.ok) {
      const alts = (res.data.alternatives as string[]) ?? [];
      b.alternatives = alts;
      b.awaiting = alts.length ? "alt" : undefined;
      return { reply: `${String(res.data.error)}${alts.length ? ` I could do ${alts.join(" or ")}.` : ""}`, events };
    }
    session.demo.booking = {};
    return {
      reply: `You're all set, ${String(b.name).split(" ")[0]}: a table for ${res.data.party_size} on ${res.data.date} at ${res.data.time}${b.occasion ? ` for the ${b.occasion.toLowerCase()}` : ""}. Your confirmation code is ${res.data.confirmation_code}, and I've sent it by text. Anything else?`,
      events,
    };
  }

  async function joinWaitlist(): Promise<{ reply: string; events: TraceEvent[] }> {
    const res = await tool("join_waitlist", { customer_name: b.name, date: b.date, time: b.time, party_size: b.partySize, phone: session.callerPhone || "+12125550100" });
    session.demo.booking = {};
    return { reply: res.ok ? `You're on the waitlist (position ${res.data.position}) for ${res.data.date} at ${res.data.time}. We'll text you as soon as a table opens.` : String(res.data.error), events };
  }

  // ─────────────────────────────── FAQ AGENT ───────────────────────────────
  async function faqAgent(): Promise<{ reply: string; events: TraceEvent[] }> {
    if (intent === "thanks") return { reply: "You're welcome! Anything else I can help with?", events };
    const res = await tool("search_knowledge_base", { question: text });
    if (!res.ok) {
      return { reply: "I don't have that information to hand. I can connect you with a team member if you like, or help with an order or a booking.", events };
    }
    const facts = (res.data.facts as string[]).slice(0, 2).join(" ");
    return { reply: `${facts} Is there anything else, or would you like to place an order?`, events };
  }
}

function toArgs(l: DraftLine) {
  return { name: l.name, quantity: l.quantity, size: l.size, notes: l.notes };
}
