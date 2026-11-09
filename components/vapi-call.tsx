"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { cn } from "@/lib/client";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
const SQUAD_ID = process.env.NEXT_PUBLIC_VAPI_SQUAD_ID;

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Starts a real voice call with the Vapi squad from the browser. Hidden until Vapi keys are configured. */
export function VapiCallButton({ compact = false }: { compact?: boolean }) {
  const vapiRef = useRef<any>(null);
  const [state, setState] = useState<"idle" | "connecting" | "live">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => vapiRef.current?.stop?.(), []);

  if (!PUBLIC_KEY || !SQUAD_ID) return null;

  const start = async () => {
    setError(null);
    setState("connecting");
    try {
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = vapiRef.current ?? new Vapi(PUBLIC_KEY);
      vapiRef.current = vapi;
      vapi.removeAllListeners?.();
      vapi.on("call-start", () => setState("live"));
      vapi.on("call-end", () => setState("idle"));
      vapi.on("error", (e: any) => {
        setError(e?.error?.message ?? e?.message ?? "Call failed");
        setState("idle");
      });
      await vapi.start(undefined, undefined, SQUAD_ID);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the call");
      setState("idle");
    }
  };

  const stop = () => {
    vapiRef.current?.stop();
    setState("idle");
  };

  if (compact) {
    return (
      <button
        onClick={state === "idle" ? start : stop}
        className={cn("rounded-md p-1.5 transition-colors", state === "live" ? "bg-chili text-white" : state === "connecting" ? "bg-saffron-wash text-saffron-deep" : "text-muted hover:bg-paper hover:text-ink")}
        title={error ?? (state === "idle" ? "Call the crew by voice (Vapi)" : "Hang up")}
      >
        {state === "idle" ? <Phone className="size-4" /> : <PhoneOff className="size-4" />}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={state === "idle" ? start : stop}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-[14px] font-medium transition-colors",
          state === "live" ? "bg-chili text-white" : "bg-saffron text-ink hover:bg-saffron-deep hover:text-white",
        )}
      >
        {state === "idle" ? <Phone className="size-4" /> : <PhoneOff className="size-4" />}
        {state === "idle" ? "Call by voice" : state === "connecting" ? "Connecting…" : "Hang up"}
      </button>
      {error && <p className="text-[12px] text-chili">{error}</p>}
    </div>
  );
}

export const vapiConfigured = Boolean(PUBLIC_KEY && SQUAD_ID);
