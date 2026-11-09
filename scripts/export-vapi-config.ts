/** Writes vapi/squad.config.json: the four assistants, their prompts, tools and handoffs (no IDs or secrets). */
import fs from "node:fs";
import path from "node:path";
import { AGENTS, AGENT_ORDER } from "../lib/agents/definitions";
import { TOOL_DEFS } from "../lib/tools";
import { DEFAULT_SETTINGS } from "../lib/seed";

const config = {
  squad: "DineLine Restaurant Crew",
  members: AGENT_ORDER.map((id) => ({
    id,
    name: AGENTS[id].name,
    role: AGENTS[id].role,
    firstMessage: AGENTS[id].firstMessage ?? null,
    handoffs: AGENTS[id].handoffs,
    tools: AGENTS[id].tools,
    systemPrompt: AGENTS[id].prompt({ settings: DEFAULT_SETTINGS, channel: "phone", forVapi: true }),
  })),
  tools: Object.values(TOOL_DEFS),
};
fs.writeFileSync(path.join(process.cwd(), "vapi", "squad.config.json"), JSON.stringify(config, null, 2));
console.log("Wrote vapi/squad.config.json");
