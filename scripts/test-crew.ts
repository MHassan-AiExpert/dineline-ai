/**
 * Runs scripted conversations through the agent crew and prints each turn.
 * Usage: npm run test:crew            (demo crew, or the LLM crew if LLM_API_KEY is set)
 */
import "dotenv/config";
import { runCrewTurn, startConversation } from "../lib/agents/crew";

const scripts: { title: string; phone: string; lines: string[] }[] = [
  {
    title: "Delivery order with upsell (new caller)",
    phone: "+13475550188",
    lines: [
      "Hi, I'd like to order delivery",
      "2 chicken biryani and a garlic naan",
      "family size please",
      "that's all",
      "45 Carmine St, New York, NY 10014",
      "yes please",
      "Sarah Lopez",
      "yes",
    ],
  },
  {
    title: "Allergen question then pickup order (returning caller)",
    phone: "+12125551000",
    lines: ["Is the butter chicken nut free?", "ok what about the chicken karahi?", "great, I'll order a half chicken karahi and 2 butter naan for pickup", "no thanks", "yes go ahead"],
  },
  {
    title: "Table booking with alternatives",
    phone: "+16465550123",
    lines: ["Can I book a table for 4 tomorrow at 7:30pm?", "Daniel Park"],
  },
  {
    title: "Booking then cancel",
    phone: "+16465550123",
    lines: ["I need to cancel my reservation", "yes"],
  },
  {
    title: "Hours and parking, then human",
    phone: "",
    lines: ["What time do you close today?", "Is there parking nearby?", "can I speak to the manager about catering"],
  },
];

async function main() {
  for (const [i, s] of scripts.entries()) {
    const id = `test-${Date.now()}-${i}`;
    console.log(`\n━━━ ${s.title} ━━━`);
    const start = await startConversation({ sessionId: id, callerPhone: s.phone });
    console.log(`  [${start.agent}] ${start.reply}`);
    for (const line of s.lines) {
      console.log(`  caller › ${line}`);
      const r = await runCrewTurn({ sessionId: id, message: line, callerPhone: s.phone });
      for (const e of r.events) {
        if (e.type === "handoff") console.log(`    ↪ handoff ${e.from} → ${e.to} (${e.reason})`);
        if (e.type === "tool_result") console.log(`    ⚙ ${e.tool}: ${e.summary}${e.ok ? "" : " [failed]"}`);
      }
      console.log(`  [${r.agent}${r.mode === "llm" ? "·llm" : ""}] ${r.reply}`);
      if (r.notice) console.log(`  ! ${r.notice}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
