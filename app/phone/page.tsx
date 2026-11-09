"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Captions, ChevronLeft, Mail, MessageCircle, Mic, MicOff, Phone, PhoneOff, Video, Volume2 } from "lucide-react";
import { AGENT_META, cn } from "@/lib/client";
import { CALLERS } from "@/components/crew-chat";
import { getRecognition, playHangup, playRingback, speakText } from "@/lib/voice";
import type { AgentId } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Screen = "contact" | "dialing" | "call" | "ended";
type Line = "speaking" | "listening" | "thinking" | "muted" | "connecting";

const PHONE_W = 390;
const PHONE_H = 844;

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return now ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/, "") : "9:41";
}

function useFitScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 40) / (PHONE_H + 24), (window.innerWidth - 24) / (PHONE_W + 24)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function PhonePage() {
  const clock = useClock();
  const scale = useFitScale();
  const [caller, setCaller] = useState(CALLERS[0]);
  const [bg, setBg] = useState<"light" | "dark">("light");
  const [controls, setControls] = useState(true);
  const [fast, setFast] = useState(true);
  const fastRef = useRef(true);
  fastRef.current = fast;

  const [screen, setScreen] = useState<Screen>("contact");
  const [line, setLine] = useState<Line>("connecting");
  const [agent, setAgent] = useState<AgentId>("receptionist");
  const [agentText, setAgentText] = useState("");
  const [callerText, setCallerText] = useState("");
  const [captions, setCaptions] = useState(true);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const sessionRef = useRef("");
  const recRef = useRef<any>(null);
  const ringRef = useRef<{ stop: () => void } | null>(null);
  const startedRef = useRef(0);

  // H toggles the recording controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "h" && !(e.target instanceof HTMLInputElement)) setControls((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // call timer
  useEffect(() => {
    if (screen !== "call") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedRef.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [screen]);

  // stop everything if the page is closed mid-call
  useEffect(
    () => () => {
      activeRef.current = false;
      try {
        recRef.current?.abort?.();
      } catch {}
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [],
  );

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "The line dropped. Try calling again.");
    return json as { reply: string; agent: AgentId };
  };

  const listenRef = useRef<() => void>(() => {});
  const sayRef = useRef<(text: string) => void>(() => {});

  sayRef.current = (text: string) => {
    if (!activeRef.current) return;
    setLine("speaking");
    setAgentText("");
    setCallerText("");
    speakText(
      text,
      () => {
        if (activeRef.current) listenRef.current();
      },
      (soFar) => setAgentText(soFar),
    );
  };

  listenRef.current = () => {
    if (!activeRef.current) return;
    if (mutedRef.current) {
      setLine("muted");
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      setError("This browser can't hear you. Use Chrome or Edge.");
      return;
    }
    recRef.current = rec;
    let finalText = "";
    let interimText = ""; // Edge sometimes stops without finalising the last phrase
    setLine("listening");
    let silence: ReturnType<typeof setTimeout> | null = null;
    rec.onresult = (e: any) => {
      // end the turn after a short pause instead of waiting for the browser's slower default
      if (silence) clearTimeout(silence);
      silence = setTimeout(() => {
        try {
          rec.stop();
        } catch {}
      }, 900);
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      interimText = interim;
      setCallerText((finalText + interim).trim());
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        setError("Allow microphone access in the browser, then call again.");
        endCall();
      }
    };
    rec.onend = async () => {
      if (silence) clearTimeout(silence);
      if (!activeRef.current || mutedRef.current) return;
      const said = (finalText + " " + interimText).trim();
      if (!said) {
        setTimeout(() => listenRef.current(), 150);
        return;
      }
      setLine("thinking");
      try {
        const r = await post({ sessionId: sessionRef.current, message: said, callerPhone: caller.phone, fast: fastRef.current });
        if (!activeRef.current) return;
        setAgent(r.agent);
        sayRef.current(r.reply);
      } catch {
        if (activeRef.current) sayRef.current("Sorry, I didn't catch that. Could you say it again?");
      }
    };
    try {
      rec.start();
    } catch {
      setTimeout(() => listenRef.current(), 300);
    }
  };

  const startCall = async () => {
    setError(null);
    setAgentText("");
    setCallerText("");
    setAgent("receptionist");
    setMuted(false);
    mutedRef.current = false;
    setElapsed(0);
    setLine("connecting");
    setScreen("dialing");
    activeRef.current = true;
    // unlock speech on this tap so the greeting can play after the ring
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
    sessionRef.current = `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const ring = playRingback(2);
    ringRef.current = ring;
    try {
      const [, r] = await Promise.all([ring.done, post({ sessionId: sessionRef.current, action: "start", callerPhone: caller.phone })]);
      if (!activeRef.current) return;
      startedRef.current = Date.now();
      setScreen("call");
      setAgent(r.agent);
      sayRef.current(r.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call failed");
      activeRef.current = false;
      setScreen("contact");
    }
  };

  const endCall = useCallback(() => {
    const wasActive = activeRef.current;
    activeRef.current = false;
    ringRef.current?.stop();
    try {
      recRef.current?.abort?.();
    } catch {}
    window.speechSynthesis?.cancel();
    if (!wasActive) return;
    playHangup();
    if (sessionRef.current) fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessionRef.current, action: "end" }) }).catch(() => {});
    setScreen("ended");
    setTimeout(() => setScreen((s) => (s === "ended" ? "contact" : s)), 2600);
  }, []);

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      try {
        recRef.current?.abort?.();
      } catch {}
      if (line === "listening") setLine("muted");
    } else if (line === "muted" || line === "listening") {
      listenRef.current();
    }
  };

  const status = screen === "dialing" ? "calling…" : fmt(elapsed);

  return (
    <div className={cn("fixed inset-0 z-[80] grid place-items-center overflow-hidden", bg === "light" ? "bg-[#ecebef]" : "bg-[#0e0e12]")}>
      {/* the phone */}
      <div style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})` }} className="relative shrink-0">
        {/* frame */}
        <div className="absolute -inset-[12px] rounded-[64px] bg-[#1b1b1f] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.55),inset_0_0_0_2px_#3a3a40]" />
        <div className="absolute top-[150px] -left-[15px] h-[34px] w-[4px] rounded-l bg-[#2a2a2f]" />
        <div className="absolute top-[205px] -left-[15px] h-[62px] w-[4px] rounded-l bg-[#2a2a2f]" />
        <div className="absolute top-[280px] -left-[15px] h-[62px] w-[4px] rounded-l bg-[#2a2a2f]" />
        <div className="absolute top-[230px] -right-[15px] h-[96px] w-[4px] rounded-r bg-[#2a2a2f]" />

        {/* screen */}
        <div className={cn("relative h-full w-full overflow-hidden rounded-[52px] font-sans", screen === "contact" ? "bg-[#f2f2f7] text-[#111]" : "bg-[#1c1d22] text-white")}>
          {/* call background */}
          {screen !== "contact" && (
            <div aria-hidden className="absolute inset-0">
              <div className="absolute inset-0 bg-gradient-to-b from-[#3b3a44] via-[#22232a] to-[#121317]" />
              <div className="absolute -top-24 left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-saffron/25 blur-[90px]" />
            </div>
          )}

          {/* status bar */}
          <div className="relative z-10 flex h-[54px] items-center justify-between px-[34px] pt-[6px] text-[16px] font-semibold">
            <span>{clock}</span>
            <span className="absolute top-[11px] left-1/2 h-[34px] w-[120px] -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-[6px]">
              <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
                <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
                <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
                <rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" />
                <rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" />
              </svg>
              <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden>
                <path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5Z" fill="currentColor" />
                <path d="M3.4 6.8a6.5 6.5 0 0 1 9.2 0l-1.3 1.3a4.6 4.6 0 0 0-6.6 0L3.4 6.8Z" fill="currentColor" />
                <path d="M1.1 4.5a9.8 9.8 0 0 1 13.8 0l-1.3 1.3a8 8 0 0 0-11.2 0L1.1 4.5Z" fill="currentColor" />
              </svg>
              <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
                <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" />
                <rect x="2" y="2" width="16" height="9" rx="2" fill="currentColor" />
                <rect x="24.5" y="4" width="2" height="5" rx="1" fill="currentColor" opacity="0.4" />
              </svg>
            </span>
          </div>

          {/* ── contact screen ── */}
          {screen === "contact" && (
            <div className="relative z-10 flex h-[calc(100%-54px)] flex-col px-5">
              <div className="flex items-center justify-between pt-1 text-[17px] text-[#0a7cff]">
                <span className="flex items-center">
                  <ChevronLeft className="size-6" strokeWidth={2.2} /> Contacts
                </span>
                <span>Edit</span>
              </div>
              <div className="mt-6 flex flex-col items-center text-center">
                <span className="grid size-[104px] place-items-center rounded-full bg-gradient-to-b from-[#f4b53a] to-[#d98e05] text-[40px] font-semibold text-white">SG</span>
                <h1 className="mt-4 text-[30px] font-semibold tracking-tight">Saffron Grill</h1>
                <p className="mt-0.5 text-[15px] text-[#6c6c72]">Restaurant · Bleecker St</p>
              </div>
              <div className="mt-6 grid grid-cols-4 gap-2.5">
                {[
                  { icon: MessageCircle, label: "message" },
                  { icon: Phone, label: "call", primary: true },
                  { icon: Video, label: "video" },
                  { icon: Mail, label: "mail" },
                ].map(({ icon: Icon, label, primary }) => (
                  <button
                    key={label}
                    onClick={primary ? startCall : undefined}
                    className={cn("flex flex-col items-center gap-1 rounded-[14px] bg-white py-2.5 text-[12px] text-[#0a7cff]", !primary && "cursor-default")}
                    aria-label={primary ? "Call Saffron Grill" : label}
                  >
                    <Icon className="size-[22px]" fill={primary ? "currentColor" : "none"} strokeWidth={primary ? 0 : 1.8} />
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={startCall} className="mt-4 rounded-[14px] bg-white px-4 py-3 text-left">
                <p className="text-[13px] text-[#6c6c72]">phone</p>
                <p className="text-[17px] text-[#0a7cff]">+1 (212) 555-0147</p>
              </button>
              <div className="mt-3 rounded-[14px] bg-white px-4 py-3">
                <p className="text-[13px] text-[#6c6c72]">notes</p>
                <p className="text-[15px] leading-snug">Order pickup or delivery, book a table, or ask about the menu. Calls are answered 24/7.</p>
              </div>
              {error && <p className="mt-3 rounded-[12px] bg-[#ffe9e7] px-3 py-2 text-[14px] text-[#c0392b]">{error}</p>}
              <button
                onClick={startCall}
                className="mt-auto mb-12 flex h-[60px] items-center justify-center gap-2 rounded-full bg-[#34c759] text-[19px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(52,199,89,0.8)] active:scale-[0.98]"
              >
                <Phone className="size-6" fill="currentColor" strokeWidth={0} /> Call
              </button>
            </div>
          )}

          {/* ── dialing / in call / ended ── */}
          {screen !== "contact" && (
            <div className="relative z-10 flex h-[calc(100%-54px)] flex-col items-center px-7">
              <p className="mt-10 text-[17px] text-white/70">{screen === "ended" ? "Call Ended" : status}</p>
              <h1 className="mt-1 text-[36px] font-medium tracking-tight">Saffron Grill</h1>
              {screen === "call" && (
                <p className="mt-2 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[13px] text-white/80">
                  <span className={cn("size-2 rounded-full", AGENT_META[agent].color, line === "speaking" && "live-dot")} />
                  {AGENT_META[agent].label}
                </p>
              )}
              {screen === "ended" && <p className="mt-2 text-[17px] text-white/60">{fmt(elapsed)}</p>}

              {/* live captions */}
              <div className="mt-6 flex w-full flex-1 flex-col justify-end gap-3 pb-6" aria-live="polite">
                {screen === "call" && captions && (
                  <>
                    {agentText && (
                      <p className={cn("text-[19px] leading-snug transition-opacity", line === "speaking" ? "text-white" : "text-white/55")}>{agentText}</p>
                    )}
                    {(callerText || line === "listening") && (
                      <p className="text-[17px] leading-snug text-[#8fd19e]">
                        <span className="text-white/45">You: </span>
                        {callerText || <span className="text-white/40">…</span>}
                      </p>
                    )}
                  </>
                )}
                {screen === "call" && (
                  <p className="text-center text-[13px] text-white/45">
                    {line === "listening" ? "Listening, go ahead" : line === "thinking" ? "One moment…" : line === "muted" ? "You're muted" : ""}
                  </p>
                )}
              </div>

              {/* call buttons */}
              <div className="mb-[52px] w-full">
                <div className="grid grid-cols-3 gap-x-6 gap-y-5 px-2">
                  {[
                    { key: "mute", icon: muted ? MicOff : Mic, label: "mute", on: muted, onClick: toggleMute },
                    { key: "cc", icon: Captions, label: "captions", on: captions, onClick: () => setCaptions((c) => !c) },
                    { key: "speaker", icon: Volume2, label: "speaker", on: speaker, onClick: () => setSpeaker((s) => !s) },
                  ].map(({ key, icon: Icon, label, on, onClick }) => (
                    <button key={key} onClick={onClick} disabled={screen !== "call"} className="flex flex-col items-center gap-1.5 disabled:opacity-50">
                      <span className={cn("grid size-[74px] place-items-center rounded-full backdrop-blur", on ? "bg-white text-[#1c1d22]" : "bg-white/15 text-white")}>
                        <Icon className="size-[30px]" strokeWidth={1.8} />
                      </span>
                      <span className="text-[13px] text-white/85">{label}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={endCall}
                    disabled={screen === "ended"}
                    className="grid size-[76px] place-items-center rounded-full bg-[#ff3b30] text-white shadow-[0_10px_24px_-10px_rgba(255,59,48,0.9)] active:scale-95 disabled:opacity-60"
                    aria-label="End call"
                  >
                    <PhoneOff className="size-[32px]" strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* home indicator */}
          <span className={cn("absolute bottom-[9px] left-1/2 z-10 h-[5px] w-[136px] -translate-x-1/2 rounded-full", screen === "contact" ? "bg-black/85" : "bg-white/85")} />
        </div>
      </div>

      {/* recording controls (press H to hide) */}
      {controls && (
        <div className="fixed bottom-4 left-4 z-[90] w-[230px] rounded-xl bg-white/90 p-3 text-[12.5px] text-ink shadow-lg ring-1 ring-black/5 backdrop-blur">
          <p className="mb-1.5 font-semibold">Recording setup</p>
          <label className="mb-2 block">
            <span className="text-muted">Calling as</span>
            <select
              value={caller.id}
              disabled={screen !== "contact"}
              onChange={(e) => setCaller(CALLERS.find((c) => c.id === e.target.value)!)}
              className="mt-0.5 w-full rounded-md border border-line-strong bg-white px-2 py-1"
            >
              {CALLERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-muted">Replies</p>
          <div className="mt-0.5 mb-2 flex gap-1">
            {[
              { v: true, label: "Fast (instant)" },
              { v: false, label: "AI (Gemini)" },
            ].map(({ v, label }) => (
              <button key={label} onClick={() => setFast(v)} className={cn("flex-1 rounded-md py-1", fast === v ? "bg-ink text-white" : "bg-paper ring-1 ring-line")}>
                {label}
              </button>
            ))}
          </div>
          <div className="mb-2 flex gap-1">
            {(["light", "dark"] as const).map((b) => (
              <button key={b} onClick={() => setBg(b)} className={cn("flex-1 rounded-md py-1 capitalize", bg === b ? "bg-ink text-white" : "bg-paper ring-1 ring-line")}>
                {b} background
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Link href="/" className="font-medium text-saffron-deep hover:underline">
              Open dashboard
            </Link>
            <span className="text-faint">Press H to hide</span>
          </div>
        </div>
      )}
    </div>
  );
}
