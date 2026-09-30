"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { askFlow } from "@/server/actions/flow";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED = ["What should I do first?", "Who should I call next?", "How am I doing today?"];

function screenLabel(pathname: string) {
  const first = pathname.split("/")[1] || "today";
  return first.charAt(0).toUpperCase() + first.slice(1).replace("-", " ");
}

export function FlowPanel({ assistantName }: { assistantName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking]);

  async function send(text: string) {
    if (!text.trim() || thinking) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setThinking(true);
    try {
      const res = await askFlow({ screen: screenLabel(pathname), message: text });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Couldn't reach Flow — ${e instanceof Error ? e.message : "try again in a moment."}` },
      ]);
    } finally {
      setThinking(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-20 flex items-center gap-2 bg-panel border border-rule text-ink rounded-full pl-2.5 pr-3.5 py-2 text-sm font-medium shadow-lift hover:border-accent/40 transition-colors"
        title={`Ask ${assistantName} (press /)`}
      >
        <span className="w-7 h-7 rounded-full bg-[#050807] border border-accent/30 flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-mark.png" alt="" className="h-3.5 w-auto" />
        </span>
        <span className="hidden sm:inline">{assistantName}</span>
        <kbd className="hidden sm:inline text-[10px] text-dim border border-rule rounded px-1 py-0.5 font-mono">/</kbd>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 bg-bg/40 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none md:pointer-events-none"
        aria-label="Close Flow"
        onClick={() => setOpen(false)}
      />
      <div className="fixed right-0 bottom-0 sm:right-4 sm:bottom-4 sm:top-auto z-40 w-full sm:w-[380px] sm:max-h-[min(640px,78vh)] h-[min(70vh,560px)] sm:h-auto bg-panel border border-rule sm:rounded-2xl flex flex-col shadow-lift animate-fade-up">
        <header className="flex items-center gap-2.5 px-4 py-3 border-b border-rule shrink-0">
          <span className="w-7 h-7 rounded-lg bg-[#050807] border border-accent/25 flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-mark.png" alt="" className="h-3.5 w-auto" />
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm block">{assistantName}</span>
            <span className="text-[11px] text-dim">Your co-pilot · press Esc to close</span>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-ink text-sm px-2 py-1 rounded-lg hover:bg-bg">
            Close
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
          {messages.length === 0 && (
            <div>
              <p className="section-label mb-2">Try asking</p>
              <div className="space-y-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="w-full text-left text-sm border border-rule rounded-xl px-3 py-2.5 hover:border-accent/40 bg-bg transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                "max-w-[88%] text-sm leading-relaxed whitespace-pre-wrap " +
                (m.role === "user"
                  ? "self-end bg-accent text-on-accent px-3 py-2 rounded-2xl rounded-br-md"
                  : "self-start bg-panel2 px-3 py-2 rounded-2xl rounded-bl-md")
              }
            >
              {m.content}
            </div>
          ))}
          {thinking && <div className="self-start text-xs text-muted px-1">{assistantName} is thinking…</div>}
        </div>

        <div className="flex gap-2 p-3 border-t border-rule shrink-0">
          <textarea
            className="flex-1 border border-rule rounded-xl px-3 py-2 bg-bg text-sm resize-none min-h-[44px] focus:border-accent/40 focus:outline-none"
            placeholder={`Ask ${assistantName}…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button type="button" onClick={() => send(input)} className="text-accent font-semibold px-2 self-end pb-2" aria-label="Send">
            →
          </button>
        </div>
      </div>
    </>
  );
}
