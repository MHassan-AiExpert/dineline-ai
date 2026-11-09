"use client";

import { useState } from "react";
import { Check, Copy, Circle } from "lucide-react";
import { Button, PageHeader, Panel, Pill, Skeleton } from "@/components/ui";
import { clock, cn, phone, send, useApi } from "@/lib/client";
import type { NotificationRecord, Settings } from "@/lib/types";

interface Resp {
  settings: Settings;
  integrations: {
    store: "local" | "supabase";
    llm: { provider: string; model: string } | null;
    vapi: { server: boolean; web: boolean; squadId: string | null };
    twilio: boolean;
    n8n: boolean;
    webhookSecret: boolean;
    publicUrl: string | null;
  };
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-[12.5px] text-muted">{label}</p>
      <div className="flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{value}</code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="text-muted hover:text-ink"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-4 text-cardamom" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function Step({ done, title, children }: { done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 border-b border-line py-4 last:border-0">
      <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", done ? "bg-cardamom text-white" : "bg-paper text-faint ring-1 ring-line")}>
        {done ? <Check className="size-3.5" strokeWidth={3} /> : <Circle className="size-2.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink">
          {title}
          {done ? <Pill tone="cardamom">Connected</Pill> : <Pill>Optional</Pill>}
        </p>
        <div className="mt-1 space-y-2 text-[13.5px] text-muted">{children}</div>
      </div>
    </li>
  );
}

export default function SetupPage() {
  const { data } = useApi<Resp>("/api/settings");
  const { data: notes } = useApi<{ notifications: NotificationRecord[] }>("/api/notifications", { refreshInterval: 6000 });
  const [resetting, setResetting] = useState(false);
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const base = data?.integrations.publicUrl || origin;

  return (
    <>
      <PageHeader title="Setup" sub="DineLine runs out of the box in demo mode. Connect each service below to go live; values go in your .env.local file.">
        {data?.integrations.store === "local" && (
          <Button
            variant="secondary"
            disabled={resetting}
            onClick={async () => {
              setResetting(true);
              await send("/api/demo/reset", "POST").catch(() => {});
              window.location.reload();
            }}
          >
            {resetting ? "Restoring…" : "Reset demo data"}
          </Button>
        )}
      </PageHeader>

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Panel title="Integrations" bodyClass="py-0">
            <ol>
              <Step done={!!data.integrations.llm} title="AI brain for the agents">
                <p>
                  {data.integrations.llm ? (
                    <>
                      Using <b className="text-ink">{data.integrations.llm.provider}</b> · {data.integrations.llm.model}.
                    </>
                  ) : (
                    "Without a key, the built-in rule-based crew answers. Add LLM_PROVIDER, LLM_API_KEY and LLM_MODEL (a free Gemini key works) for natural conversation."
                  )}
                </p>
              </Step>
              <Step done={data.integrations.store === "supabase"} title="Supabase database">
                <p>Run supabase/schema.sql then supabase/seed.sql in the SQL editor, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and optionally run npm run seed:supabase for a week of demo history.</p>
              </Step>
              <Step done={data.integrations.vapi.server} title="Vapi phone agents (Squad)">
                <p>Set VAPI_PRIVATE_KEY and PUBLIC_APP_URL, then run npm run setup:vapi. It creates the function tools, the four assistants and the squad, and prints the squad ID.</p>
                <CopyField label="Tool server URL (direct)" value={`${base}/api/vapi/tools`} />
                <CopyField label="Server URL for call events" value={`${base}/api/vapi/webhook`} />
              </Step>
              <Step done={data.integrations.vapi.web} title="Talk in the browser">
                <p>Set NEXT_PUBLIC_VAPI_PUBLIC_KEY and NEXT_PUBLIC_VAPI_SQUAD_ID to show the “Call by voice” button on the crew page.</p>
              </Step>
              <Step done={data.integrations.twilio || data.integrations.n8n} title="Customer texts (SMS / WhatsApp)">
                <p>Either point N8N_NOTIFY_WEBHOOK_URL at workflow 04 in n8n, or set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER to send straight from the app. Until then, texts are recorded in the outbox on the right.</p>
              </Step>
              <Step done={data.integrations.n8n} title="n8n workflows">
                <p>Import the seven files in the n8n folder. Each one starts with a Config node; set the app URL and secret there.</p>
                <CopyField label="Tool gateway for workflows 01–03" value={`${base}/api/tools/execute`} />
                <CopyField label="Reminders endpoint for workflow 05" value={`${base}/api/reservations/reminders`} />
                <CopyField label="Daily report endpoint for workflow 07" value={`${base}/api/reports/daily`} />
              </Step>
              <Step done={data.integrations.webhookSecret} title="Webhook secret">
                <p>Set DINELINE_WEBHOOK_SECRET so only Vapi and n8n can call the tool endpoints. Send it as the x-dineline-secret header (n8n) or the server secret (Vapi).</p>
              </Step>
            </ol>
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel title="Restaurant profile">
              <dl className="space-y-2.5 text-[13.5px]">
                {[
                  ["Name", data.settings.restaurantName],
                  ["Address", data.settings.address],
                  ["Phone", data.settings.phone],
                  ["Transfer to staff", data.settings.transferNumber],
                  ["Sales tax", `${(data.settings.taxRate * 100).toFixed(3)}%`],
                  ["Delivery", `$${data.settings.deliveryFee.toFixed(2)} fee · $${data.settings.deliveryMinimum} minimum`],
                  ["Delivery ZIPs", data.settings.deliveryZips.join(", ")],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel title="Text outbox" bodyClass="p-0">
              <ul className="max-h-[460px] divide-y divide-line overflow-y-auto scrollbar-thin">
                {(notes?.notifications ?? []).slice(0, 20).map((n) => (
                  <li key={n.id} className="px-4 py-2.5 text-[13px]">
                    <p className="flex items-center justify-between gap-2 text-[12px] text-faint">
                      <span>To {phone(n.to)}</span>
                      <span>
                        {n.provider === "demo" ? "simulated" : `${n.provider} · ${n.status}`} · {clock(n.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-ink">{n.body}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
