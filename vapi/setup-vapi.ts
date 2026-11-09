/**
 * Creates (or updates) everything DineLine needs in Vapi:
 *   • one function tool per business tool, pointing at this app (or at n8n)
 *   • four assistants: Receptionist, Order, Reservation, FAQ
 *   • a Squad that lets them hand callers to each other
 *   • optionally attaches the Squad to your Vapi phone number
 *
 * Usage: npm run setup:vapi
 * Reads from .env.local: VAPI_PRIVATE_KEY, PUBLIC_APP_URL, DINELINE_WEBHOOK_SECRET (optional),
 * VAPI_TOOLS_URL (optional, one URL for all tools) or VAPI_TOOLS_URL_LOOKUP / _ORDERS / _RESERVATIONS
 *   (optional, the n8n workflow 01/02/03 webhook URLs), VAPI_PHONE_NUMBER_ID (optional),
 * TRANSFER_PHONE_NUMBER (optional, E.164 number for live staff transfers), VAPI_MODEL and VAPI_VOICE_ID (optional).
 * Run it again any time you change prompts or tools: existing items are updated, not duplicated.
 */
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { AGENTS, AGENT_ORDER } from "../lib/agents/definitions";
import { TOOL_DEFS } from "../lib/tools";
import { DEFAULT_SETTINGS } from "../lib/seed";
import type { AgentId } from "../lib/types";

config({ path: ".env.local" });
config();

const API = (process.env.VAPI_API_URL ?? "https://api.vapi.ai").replace(/\/$/, "");
const KEY = process.env.VAPI_PRIVATE_KEY;
const APP = (process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
const TOOLS_URL = process.env.VAPI_TOOLS_URL || `${APP}/api/vapi/tools`;
const EVENTS_URL = process.env.VAPI_EVENTS_URL || `${APP}/api/vapi/webhook`;
const SECRET = process.env.DINELINE_WEBHOOK_SECRET ?? "";
const TRANSFER = process.env.TRANSFER_PHONE_NUMBER ?? "";
const MODEL = process.env.VAPI_MODEL ?? "gpt-4o-mini";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function vapi(method: string, route: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

// Optional: route each tool group through its own n8n workflow (01 lookup, 02 orders, 03 reservations)
const GROUP_URL: Record<string, string | undefined> = {
  lookup: process.env.VAPI_TOOLS_URL_LOOKUP,
  orders: process.env.VAPI_TOOLS_URL_ORDERS,
  reservations: process.env.VAPI_TOOLS_URL_RESERVATIONS,
};
const TOOL_GROUP: Record<string, string> = {
  price_order: "orders",
  place_order: "orders",
  check_availability: "reservations",
  create_booking: "reservations",
  find_booking: "reservations",
  modify_booking: "reservations",
  cancel_booking: "reservations",
  join_waitlist: "reservations",
};
const toolUrl = (name: string) => GROUP_URL[TOOL_GROUP[name] ?? "lookup"] || TOOLS_URL;

const server = (url: string) => ({ url, ...(SECRET ? { headers: { "x-dineline-secret": SECRET } } : {}) });

const ASSISTANT_NAMES: Record<AgentId, string> = {
  receptionist: "DineLine Receptionist",
  order: "DineLine Order",
  reservation: "DineLine Reservation",
  faq: "DineLine FAQ",
};

async function main() {
  if (!KEY) throw new Error("Set VAPI_PRIVATE_KEY in .env.local");
  if (!APP && !process.env.VAPI_TOOLS_URL) throw new Error("Set PUBLIC_APP_URL (your ngrok/Vercel URL) in .env.local");
  if (/localhost|127\.0\.0\.1/.test(TOOLS_URL)) throw new Error("Vapi can't reach localhost. Use an ngrok or Cloudflare tunnel URL, or your Vercel URL, as PUBLIC_APP_URL.");

  console.log(`Tools will call: ${TOOLS_URL}`);
  console.log(`Call events go to: ${EVENTS_URL}\n`);

  // 1. Function tools
  const existingTools: any[] = await vapi("GET", "/tool?limit=1000");
  const toolIds: Record<string, string> = {};
  const needed = new Set(AGENT_ORDER.flatMap((a) => AGENTS[a].tools));
  for (const name of needed) {
    if (name === "transfer_to_staff" && TRANSFER) continue; // replaced by a real transferCall tool below
    const def = TOOL_DEFS[name];
    const body = {
      type: "function",
      function: { name: def.name, description: def.description, parameters: def.parameters },
      server: server(toolUrl(name)),
      messages: name === "place_order" || name === "create_booking" ? [{ type: "request-start", content: "One moment while I put that through." }] : [],
    };
    const found = existingTools.find((t) => t.type === "function" && t.function?.name === name);
    const { type: _type, ...updatable } = body;
    const saved = found ? await vapi("PATCH", `/tool/${found.id}`, updatable) : await vapi("POST", "/tool", body);
    toolIds[name] = saved.id;
    console.log(`${found ? "updated" : "created"} tool  ${name}`);
  }
  if (TRANSFER) {
    const body = {
      type: "transferCall",
      destinations: [{ type: "number", number: TRANSFER, message: "Connecting you with a team member now.", description: "Restaurant staff" }],
      function: { name: "transfer_to_staff", description: TOOL_DEFS.transfer_to_staff.description },
    };
    const found = existingTools.find((t) => t.type === "transferCall" && t.function?.name === "transfer_to_staff");
    const { type: _type, ...updatable } = body;
    const saved = found ? await vapi("PATCH", `/tool/${found.id}`, updatable) : await vapi("POST", "/tool", body);
    toolIds.transfer_to_staff = saved.id;
    console.log(`${found ? "updated" : "created"} tool  transfer_to_staff (live transfer to ${TRANSFER})`);
  }

  // 2. Assistants
  const existingAssistants: any[] = await vapi("GET", "/assistant?limit=1000");
  const assistantIds: Record<AgentId, string> = {} as Record<AgentId, string>;
  for (const id of AGENT_ORDER) {
    const def = AGENTS[id];
    const prompt = def.prompt({ settings: DEFAULT_SETTINGS, channel: "phone", forVapi: true });
    const body: Record<string, unknown> = {
      name: ASSISTANT_NAMES[id],
      firstMessage: def.firstMessage ?? "",
      firstMessageMode: def.firstMessage ? "assistant-speaks-first" : "assistant-speaks-first-with-model-generated-message",
      model: {
        provider: "openai",
        model: MODEL,
        temperature: 0.4,
        messages: [{ role: "system", content: prompt }],
        toolIds: def.tools.map((t) => toolIds[t]).filter(Boolean),
      },
      voice: { provider: "vapi", voiceId: process.env.VAPI_VOICE_ID ?? "Elliot" },
      transcriber: { provider: "deepgram", model: "nova-3", language: "en" },
      server: server(EVENTS_URL),
      serverMessages: ["end-of-call-report"],
      endCallPhrases: ["goodbye", "bye now", "have a lovely evening"],
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 900,
    };
    const found = existingAssistants.find((a) => a.name === ASSISTANT_NAMES[id]);
    const saved = found ? await vapi("PATCH", `/assistant/${found.id}`, body) : await vapi("POST", "/assistant", body);
    assistantIds[id] = saved.id;
    console.log(`${found ? "updated" : "created"} assistant  ${ASSISTANT_NAMES[id]}`);
  }

  // 3. Squad: every member can hand off to the teammates its prompt mentions
  const squadBody = {
    name: "DineLine Restaurant Crew",
    members: AGENT_ORDER.map((id) => ({
      assistantId: assistantIds[id],
      assistantDestinations: AGENTS[id].handoffs.map((to) => ({
        type: "assistant",
        assistantName: ASSISTANT_NAMES[to],
        message: "",
        description: `Hand off to the ${to} specialist: ${AGENTS[to].role}.`,
      })),
    })),
  };
  const squads: any[] = await vapi("GET", "/squad?limit=1000");
  const foundSquad = squads.find((s) => s.name === squadBody.name);
  const squad = foundSquad ? await vapi("PATCH", `/squad/${foundSquad.id}`, squadBody) : await vapi("POST", "/squad", squadBody);
  console.log(`${foundSquad ? "updated" : "created"} squad  ${squadBody.name}  (${squad.id})`);

  // 4. Optional: attach the squad to a phone number
  if (process.env.VAPI_PHONE_NUMBER_ID) {
    await vapi("PATCH", `/phone-number/${process.env.VAPI_PHONE_NUMBER_ID}`, { squadId: squad.id, assistantId: null, server: server(EVENTS_URL) });
    console.log(`attached squad to phone number ${process.env.VAPI_PHONE_NUMBER_ID}`);
  }

  const out = path.join(process.cwd(), "vapi", "vapi-ids.json");
  fs.writeFileSync(out, JSON.stringify({ squadId: squad.id, assistants: assistantIds, tools: toolIds }, null, 2));
  console.log(`\nSaved IDs to vapi/vapi-ids.json`);
  console.log(`Add this to .env.local for the in-browser call button:\nNEXT_PUBLIC_VAPI_SQUAD_ID=${squad.id}`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message ?? e}`);
  process.exit(1);
});
