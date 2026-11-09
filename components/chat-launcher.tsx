"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { CALLERS, CrewChat, useCrewChat } from "./crew-chat";
import { cn } from "@/lib/client";

function Drawer({ onClose }: { onClose: () => void }) {
  const [caller, setCaller] = useState(CALLERS[0]);
  const chat = useCrewChat(caller.phone);
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex h-[min(640px,calc(100dvh-24px))] flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[400px]">
      <div className="flex items-center justify-between gap-3 bg-ink px-4 py-3 text-white">
        <div>
          <p className="font-display text-[16px] font-semibold">Call Saffron Grill</p>
          <label className="mt-0.5 flex items-center gap-1.5 text-[12px] text-white/60">
            Calling as
            <select
              value={caller.id}
              onChange={(e) => {
                setCaller(CALLERS.find((c) => c.id === e.target.value)!);
                chat.reset();
              }}
              className="rounded bg-ink-3 px-1 py-0.5 text-white outline-none"
            >
              {CALLERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-white/70 hover:text-white" aria-label="Close chat">
          <X className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 bg-paper">
        <CrewChat chat={chat} compact callerPhone={caller.phone} />
      </div>
    </div>
  );
}

/** Floating "call the crew" button available on every dashboard page. */
export function ChatLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/playground") || pathname.startsWith("/phone")) return null;
  return (
    <>
      {open && <Drawer onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full bg-ink py-3 pr-5 pl-4 text-[14px] font-medium text-white shadow-xl transition-transform hover:-translate-y-0.5",
          open && "hidden",
        )}
      >
        <span className="relative grid size-6 place-items-center rounded-full bg-saffron text-ink">
          <MessageCircle className="size-3.5" strokeWidth={2.4} />
        </span>
        Test the AI crew
      </button>
    </>
  );
}
