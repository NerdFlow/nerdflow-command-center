"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { askFlow } from "@/server/actions/flow";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTED = ["What should I do first today?", "Which leads are hottest right now?", "Summarize yesterday for me"];

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
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      setMessages((m) => [...m, { role: "assistant", content: `Couldn't reach Flow — ${e instanceof Error ? e.message : "try again in a moment."}` }]);
    } finally {
      setThinking(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-20 flex items-center gap-2 bg-accent text-on-accent rounded-full px-4 py-2.5 font-semibold shadow-lg"
      >
        <span className="w-5 h-5 rounded-md bg-ink flex items-center justify-center text-accent text-xs font-bold">F</span>
        {assistantName}
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[380px] bg-panel border-l border-rule z-30 flex flex-col shadow-2xl">
      <header className="flex items-center gap-2.5 px-4 py-3.5 border-b border-rule">
        <span className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center text-accent text-xs font-bold">F</span>
        <span className="font-semibold flex-1">{assistantName}</span>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-ink text-sm">
          /
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div>
            <p className="text-xs text-muted uppercase tracking-wide mb-2">Suggested</p>
            <div className="space-y-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left text-sm border border-rule rounded-lg px-3 py-2.5 hover:border-accent bg-bg"
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
                ? "self-end bg-accent text-on-accent px-3 py-2 rounded-xl rounded-br-sm"
                : "self-start bg-panel2 px-3 py-2 rounded-xl rounded-bl-sm")
            }
          >
            {m.content}
          </div>
        ))}
        {thinking && <div className="self-start text-xs text-muted px-1">{assistantName} is thinking…</div>}
      </div>

      <div className="flex gap-2 p-3 border-t border-rule">
        <textarea
          className="flex-1 border border-rule rounded-lg px-3 py-2 bg-bg text-sm resize-none min-h-[44px]"
          placeholder="Ask Flow anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button onClick={() => send(input)} className="text-accent font-semibold px-2" aria-label="Send">
          →
        </button>
      </div>
    </div>
  );
}
