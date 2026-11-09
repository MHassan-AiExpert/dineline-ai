"use client";

/* Browser voice helpers: speech recognition (caller) and speech synthesis (agent). */
/* eslint-disable @typescript-eslint/no-explicit-any */

export function getRecognition(): any | null {
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
export function pickVoice(): SpeechSynthesisVoice | undefined {
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

/** Rewrites written details so they sound natural when spoken. */
export function toSpoken(text: string) {
  return text
    .replace(/\(\+(\$[\d.]+)\)/g, ", $1 extra,")
    .replace(/[()]/g, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*([?.!])/g, "$1");
}

/** Speaks text sentence by sentence (avoids Chrome cutting long utterances) and calls done at the end. */
export function speakText(text: string, done: () => void) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return done();
  synth.cancel();
  const parts = toSpoken(text).split(/(?<=[.!?])\s+/).filter(Boolean);
  if (!parts.length) return done();
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

/** US ringback tone (440 + 480 Hz), played `rings` times. Resolves when finished. */
export function playRingback(rings = 2): { done: Promise<void>; stop: () => void } {
  let ctx: AudioContext | null = null;
  let stopped = false;
  const done = new Promise<void>((resolve) => {
    try {
      ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      [440, 480].forEach((f) => {
        const o = ctx!.createOscillator();
        o.frequency.value = f;
        o.connect(gain);
        o.start();
      });
      const t0 = ctx.currentTime + 0.05;
      for (let i = 0; i < rings; i++) {
        const s = t0 + i * 3;
        gain.gain.setValueAtTime(0.0001, s);
        gain.gain.linearRampToValueAtTime(0.09, s + 0.03);
        gain.gain.setValueAtTime(0.09, s + 1.7);
        gain.gain.linearRampToValueAtTime(0.0001, s + 1.75);
      }
      setTimeout(() => {
        ctx?.close().catch(() => {});
        resolve();
      }, rings * 3000 - 900);
    } catch {
      setTimeout(resolve, rings * 2000);
    }
  });
  return {
    done,
    stop: () => {
      if (stopped) return;
      stopped = true;
      ctx?.close().catch(() => {});
    },
  };
}

/** Short three-tone "call ended" beep. */
export function playHangup() {
  try {
    const ctx = new AudioContext();
    [0, 0.18, 0.36].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 620;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + t + 0.02);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + t + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.16);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* no audio */
  }
}
