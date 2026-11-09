"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, MicOff, RotateCcw, Volume2, VolumeX, Wrench, CornerDownRight, PhoneForwarded, Phone, PhoneOff, AudioLines } from "lucide-react";
import { AGENT_META, cn, TZ } from "@/lib/client";
import type { AgentId, TraceEvent } from "@/lib/types";
import { AgentDot } from "./ui";
import { VapiCallButton } from "./vapi-call";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  agent?: AgentId;
  events?: TraceEvent[];
}

interface CrewReply {
  sessionId: string;
  reply: string;
  agent: AgentId;
  events: TraceEvent[];
  mode: "llm" | "demo";
  notice?: string;
}

export const CALLERS = [
  { id: "returning", label: "Returning guest", detail: "Ayesha Khan · (212) 555-1000", phone: "+12125551000" },
  { id: "new", label: "New caller", detail: "(347) 555-0188", phone: "+13475550188" },
  { id: "hidden", label: "No caller ID", detail: "Agent will ask for a number", phone: "" },
];

const SUGGESTIONS = [
  "I'd like 2 chicken biryani and a mango lassi for pickup",
  "Can I book a table for 4 this Friday at 8pm?",
  "Is the butter chicken nut-free?",
  "Do you deliver to 10014?",
  "Where's my order?",
  "Same as last time, please",
];

function newSessionId() {
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function getRecognition(): any | null {
  if (typeof window === "undefined") return null;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = "en-US";
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

/** Picks the most natural English voice the browser offers (Edge "Natural" voices sound best). */
function pickVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en[-_](US|GB)/i.test(v.lang));
  return (
    voices.find((v) => /natural|neural/i.test(v.name) && /aria|jenny|ava|emma|michelle|sonia|libby/i.test(v.name)) ??
    voices.find((v) => /natural|neural/i.test(v.name)) ??
    voices.find((v) => /google us english/i.test(v.name)) ??
    voices.find((v) => /samantha|zira|female/i.test(v.name)) ??
    voices[0]
  );
}

/** Speaks text sentence by sentence (avoids Chrome cutting long utterances) and calls done at the end. */
function speakText(text: string, done: () => void) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return done();
  synth.cancel();
  // Make written details sound natural when spoken: "(+$18.00)" -> ", $18.00 extra,"
  const spoken = text.replace(/\(\+(\$[\d.]+)\)/g, ", $1 extra,").replace(/[()]/g, "").replace(/\s+,/g, ",").replace(/,\s*([?.!])/g, "$1");
  // split into sentences only at . ! ? followed by a space, so "$18.00" stays whole
  const parts = spoken.split(/(?<=[.!?])\s+/).filter(Boolean);
  const voice = pickVoice();
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part.trim());
    if (voice) u.voice = voice;
    u.rate = 1.05;
    if (i === parts.length - 1) {
      u.onend = done;
      u.onerror = done;
    }
    synth.speak(u);
  });
}

export function useCrewChat(callerPhone: string) {
  const [sessionId, setSessionId] = useState(newSessionId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [agent, setAgent] = useState<AgentId>("receptionist");
  const [mode, setMode] = useState<"llm" | "demo" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  const post = async (body: Record<string, unknown>): Promise<CrewReply> => {
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "The crew couldn't answer. Try again.");
    return json;
  };

  useEffect(() => {
    if (started.current === sessionId) return;
    started.current = sessionId;
    setBusy(true);
    post({ sessionId, action: "start", callerPhone })
      .then((r) => {
        setMessages([{ id: `${sessionId}-0`, role: "assistant", text: r.reply, agent: r.agent, events: r.events }]);
        setEvents([{ type: "agent", agent: "receptionist", at: new Date().toISOString() }, ...r.events]);
        setAgent(r.agent);
        setMode(r.mode);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return null;
      setError(null);
      setMessages((m) => [...m, { id: `${Date.now()}-u`, role: "user", text: message }]);
      setBusy(true);
      try {
        const r = await post({ sessionId, message, callerPhone });
        setMessages((m) => [...m, { id: `${Date.now()}-a`, role: "assistant", text: r.reply, agent: r.agent, events: r.events }]);
        setEvents((e) => [...e, ...r.events]);
        setAgent(r.agent);
        setMode(r.mode);
        setNotice(r.notice ?? null);
        return r;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, sessionId, callerPhone],
  );

  const reset = useCallback(() => {
    fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, action: "end" }) }).catch(() => {});
    setMessages([]);
    setEvents([]);
    setAgent("receptionist");
    setNotice(null);
    setError(null);
    setSessionId(newSessionId());
  }, [sessionId]);

  return { sessionId, messages, events, agent, mode, notice, busy, error, sendMessage, reset };
}

export type CrewChatState = ReturnType<typeof useCrewChat>;

export function CrewChat({ chat, compact = false, callerPhone }: { chat: CrewChatState; compact?: boolean; callerPhone: string }) {
  const [draft, setDraft] = useState("");
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const recRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSpoken = useRef<string | null>(null);

  useEffect(() => setCanListen(!!getRecognition()), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages.length, chat.busy]);

  // ── Voice call mode: speak each reply, then listen hands-free, like a phone call ──
  type CallState = "off" | "speaking" | "listening" | "thinking";
  const [call, setCall] = useState<CallState>("off");
  const [heard, setHeard] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const callRef = useRef<CallState>("off");
  const sendRef = useRef(chat.sendMessage);
  sendRef.current = chat.sendMessage;
  const setCallState = (state: CallState) => {
    callRef.current = state;
    setCall(state);
  };

  const listenRef = useRef<() => void>(() => {});
  listenRef.current = () => {
    if (callRef.current === "off") return;
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    let finalText = "";
    setHeard("");
    setCallState("listening");
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setHeard((finalText + interim).trim());
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        setMicError("Allow microphone access in your browser to start a voice call.");
        setCallState("off");
      }
    };
    rec.onend = async () => {
      if (callRef.current !== "listening") return;
      const said = finalText.trim();
      if (!said) {
        setTimeout(() => listenRef.current(), 150); // silence: keep listening
        return;
      }
      setCallState("thinking");
      const reply = await sendRef.current(said);
      if (!reply && (callRef.current as CallState) !== "off") listenRef.current(); // error: listen again
    };
    rec.start();
  };

  const startCall = () => {
    setMicError(null);
    setSpeak(false);
    setCallState("speaking");
    const lastAgent = chat.messages.filter((m) => m.role === "assistant").at(-1);
    lastSpoken.current = chat.messages.at(-1)?.id ?? null;
    if (lastAgent) speakText(lastAgent.text, () => listenRef.current());
    else listenRef.current();
  };

  const endCall = () => {
    setCallState("off");
    setHeard("");
    try {
      recRef.current?.abort?.();
    } catch {
      /* already stopped */
    }
    window.speechSynthesis?.cancel();
  };

  useEffect(() => () => {
    callRef.current = "off";
    try {
      recRef.current?.abort?.();
    } catch {}
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  // Speak replies aloud: always during a voice call, otherwise when the speaker toggle is on
  useEffect(() => {
    const last = chat.messages.at(-1);
    if (!last || last.role !== "assistant" || lastSpoken.current === last.id) return;
    const inCall = callRef.current !== "off";
    if (!speak && !inCall) return;
    lastSpoken.current = last.id;
    if (inCall) setCallState("speaking");
    speakText(last.text, () => {
      if (callRef.current !== "off") listenRef.current();
    });
  }, [chat.messages, speak]);

  const submit = async (text?: string) => {
    const value = (text ?? draft).trim();
    if (!value) return;
    setDraft("");
    await chat.sendMessage(value);
    inputRef.current?.focus();
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setDraft((finalText + interim).trim());
    };
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) submit(finalText);
    };
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const showSuggestions = chat.messages.filter((m) => m.role === "user").length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* status bar */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", AGENT_META[chat.agent].wash)}>
            <AgentDot agent={chat.agent} className="size-2.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{AGENT_META[chat.agent].label}</p>
            <p className="truncate text-[11.5px] text-muted">{chat.mode === "llm" ? "AI crew (LLM)" : chat.mode === "demo" ? "Built-in demo crew" : "Connecting…"}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {canListen && call === "off" && (
            <button
              onClick={startCall}
              className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-cardamom px-3 text-[13px] font-semibold text-white transition-colors hover:bg-cardamom/90"
              title="Talk to the crew hands-free, like a phone call"
            >
              <Phone className="size-3.5" />
              {compact ? "Call" : "Start voice call"}
            </button>
          )}
          <VapiCallButton compact />
          <button
            onClick={() => {
              setSpeak((s) => !s);
              if (speak) window.speechSynthesis?.cancel();
            }}
            className={cn("rounded-md p-1.5 transition-colors", speak ? "bg-saffron-wash text-saffron-deep" : "text-muted hover:bg-paper hover:text-ink")}
            aria-pressed={speak}
            title={speak ? "Stop reading replies aloud" : "Read replies aloud"}
          >
            {speak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <button onClick={chat.reset} className="rounded-md p-1.5 text-muted hover:bg-paper hover:text-ink" title="Start a new conversation">
            <RotateCcw className="size-4" />
          </button>
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {chat.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[82%] rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-[14.5px] leading-snug text-white">{m.text}</p>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col items-start gap-1.5">
              {!compact &&
                m.events
                  ?.filter((e) => e.type === "handoff")
                  .map((e, i) =>
                    e.type === "handoff" ? (
                      <p key={i} className="flex items-center gap-1.5 text-[12px] text-muted">
                        <CornerDownRight className="size-3.5" />
                        {AGENT_META[e.from].short} handed off to <span className={cn("font-semibold", AGENT_META[e.to].text)}>{AGENT_META[e.to].short}</span>
                      </p>
                    ) : null,
                  )}
              {compact &&
                m.events?.some((e) => e.type === "handoff") && (
                  <p className="text-[11.5px] text-muted">
                    Handed to <span className={cn("font-semibold", m.agent && AGENT_META[m.agent].text)}>{m.agent && AGENT_META[m.agent].short}</span>
                  </p>
                )}
              <div className="flex max-w-[88%] gap-2">
                <span className={cn("mt-2 size-2 shrink-0 rounded-full", m.agent ? AGENT_META[m.agent].color : "bg-faint")} />
                <p className="rounded-2xl rounded-tl-sm border border-line bg-surface px-3.5 py-2 text-[14.5px] leading-snug text-ink">{m.text}</p>
              </div>
            </div>
          ),
        )}
        {chat.busy && (
          <div className="flex items-center gap-2 pl-4 text-muted">
            <span className="typing flex gap-1" aria-label="Agent is typing">
              <span className="size-1.5 rounded-full bg-current" />
              <span className="size-1.5 rounded-full bg-current" />
              <span className="size-1.5 rounded-full bg-current" />
            </span>
          </div>
        )}
        {chat.error && <p className="rounded-md bg-chili-wash px-3 py-2 text-[13px] text-chili">{chat.error}</p>}
        {chat.notice && <p className="rounded-md bg-saffron-wash px-3 py-2 text-[12.5px] text-saffron-deep">{chat.notice}</p>}
        {micError && <p className="rounded-md bg-chili-wash px-3 py-2 text-[13px] text-chili">{micError}</p>}
      </div>

      {/* suggestions */}
      {showSuggestions && !chat.busy && call === "off" && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-thin">
          {SUGGESTIONS.slice(0, compact ? 4 : 6)
            .filter((s) => callerPhone || !/last time|my order/i.test(s))
            .map((s) => (
              <button key={s} onClick={() => submit(s)} className="shrink-0 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] text-ink hover:border-ink">
                {s}
              </button>
            ))}
        </div>
      )}

      {/* voice call panel */}
      {call !== "off" && (
        <div className="border-t border-line bg-ink px-4 py-3.5 text-white">
          <div className="flex items-center gap-3.5">
            <span
              className={cn(
                "relative grid size-12 shrink-0 place-items-center rounded-full transition-colors",
                call === "listening" ? "bg-chili" : call === "speaking" ? "bg-saffron text-ink" : "bg-ink-3",
              )}
            >
              {call === "listening" ? (
                <span className="eq flex h-5 items-end gap-[3px]" aria-hidden>
                  <span className="w-[3px] rounded-full bg-white" />
                  <span className="w-[3px] rounded-full bg-white" />
                  <span className="w-[3px] rounded-full bg-white" />
                  <span className="w-[3px] rounded-full bg-white" />
                </span>
              ) : call === "speaking" ? (
                <AudioLines className="size-5" />
              ) : (
                <span className="typing flex gap-1">
                  <span className="size-1.5 rounded-full bg-white" />
                  <span className="size-1.5 rounded-full bg-white" />
                  <span className="size-1.5 rounded-full bg-white" />
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="text-[14.5px] font-semibold">
                {call === "listening" ? "Listening… go ahead" : call === "speaking" ? `${AGENT_META[chat.agent].short} is speaking` : "Thinking…"}
              </p>
              <p className="truncate text-[13px] text-white/60">
                {call === "listening" ? heard || "Speak naturally, it sends when you pause" : call === "thinking" ? heard : "Wait for the reply, then speak"}
              </p>
            </div>
            <button onClick={endCall} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-chili px-4 text-[13.5px] font-semibold text-white hover:bg-chili/90">
              <PhoneOff className="size-4" />
              End
            </button>
          </div>
        </div>
      )}

      {/* composer */}
      <form
        hidden={call !== "off"}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-1.5 focus-within:border-ink">
          {canListen && (
            <button
              type="button"
              onClick={toggleMic}
              className={cn("grid size-9 shrink-0 place-items-center rounded-lg transition-colors", listening ? "bg-chili text-white" : "text-muted hover:bg-paper hover:text-ink")}
              aria-pressed={listening}
              title={listening ? "Stop listening" : "Speak your message"}
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
          )}
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={listening ? "Listening…" : "Talk to Saffron Grill…"}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-[14.5px] text-ink outline-none placeholder:text-faint focus-visible:outline-none"
            aria-label="Message"
          />
          <button type="submit" disabled={!draft.trim() || chat.busy} className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-white disabled:opacity-30" aria-label="Send">
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

/** Live trace of the crew: which agent is on, handoffs and every tool call with its result. */
export function CrewTrace({ events }: { events: TraceEvent[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);
  const rows = events.filter((e) => e.type !== "tool_call");
  if (!rows.length) return <p className="px-4 py-6 text-center text-[13px] text-muted">Tool calls and handoffs will appear here as the conversation runs.</p>;
  return (
    <ol ref={ref} className="scrollbar-thin max-h-full space-y-1 overflow-y-auto px-3 py-3">
      {rows.map((e, i) => {
        const time = new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: TZ });
        if (e.type === "agent")
          return (
            <li key={i} className="flex items-center gap-2 px-1 py-1 text-[12.5px]">
              <AgentDot agent={e.agent} />
              <span className="font-medium text-ink">{AGENT_META[e.agent].label}</span>
              <span className="text-faint">on the line</span>
              <span className="ml-auto text-[11px] text-faint tabular-nums">{time}</span>
            </li>
          );
        if (e.type === "handoff")
          return (
            <li key={i} className={cn("rounded-md px-2.5 py-2 text-[12.5px]", AGENT_META[e.to].wash)}>
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <PhoneForwarded className="size-3.5" />
                {AGENT_META[e.from].short} → {AGENT_META[e.to].short}
                <span className="ml-auto text-[11px] font-normal text-muted tabular-nums">{time}</span>
              </p>
              {e.reason && <p className="mt-0.5 text-muted">{e.reason}</p>}
            </li>
          );
        if (e.type === "tool_result") {
          const call = events.slice(0, events.indexOf(e)).reverse().find((x) => x.type === "tool_call" && x.tool === e.tool);
          const args = call && call.type === "tool_call" ? Object.entries(call.args).filter(([, v]) => v !== undefined && v !== "" && v !== null) : [];
          return (
            <li key={i} className="group rounded-md border border-line bg-surface px-2.5 py-2 text-[12.5px]">
              <p className="flex items-center gap-1.5">
                <Wrench className={cn("size-3.5", e.ok ? "text-cardamom" : "text-chili")} />
                <code className="font-mono text-[11.5px] font-medium text-ink">{e.tool}</code>
                <AgentDot agent={e.agent} className="size-1.5" />
                <span className="ml-auto text-[11px] text-faint tabular-nums">{time}</span>
              </p>
              <p className={cn("mt-0.5", e.ok ? "text-ink" : "text-chili")}>{e.summary}</p>
              {args.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11.5px] text-faint hover:text-muted">Arguments</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-paper p-2 font-mono text-[11px] leading-relaxed text-muted">{JSON.stringify(Object.fromEntries(args), null, 2)}</pre>
                </details>
              )}
            </li>
          );
        }
        return null;
      })}
    </ol>
  );
}
