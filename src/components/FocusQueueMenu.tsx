"use client";

import { useState } from "react";

export type FocusQueueItem = {
  key: string;
  label: string;
  detail?: string | null;
};

/** Opens a card in the current filter. Choosing one does not log a skip. */
export function FocusQueueMenu({
  items,
  activeKey,
  onJump,
  startOpen = false,
}: {
  items: FocusQueueItem[];
  activeKey: string | null;
  onJump: (key: string) => void;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  if (items.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
        className="text-xs font-medium border border-rule bg-panel rounded-lg px-2.5 py-1.5 text-ink"
      >
        Queue · {items.length}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close queue" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div role="listbox" aria-label="Queue" className="absolute left-0 top-full mt-1 z-30 w-72 max-h-80 overflow-y-auto bg-panel border border-rule rounded-xl shadow-lift py-1">
            {items.map((item, index) => {
              const active = item.key === activeKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onJump(item.key);
                    setOpen(false);
                  }}
                  className={
                    "block w-full text-left px-3 py-2 text-sm " + (active ? "bg-accent-soft text-ink" : "text-ink hover:bg-panel2")
                  }
                >
                  <span className="text-dim tabular-nums mr-2">{index + 1}</span>
                  {item.label}
                  {item.detail ? <span className="block text-xs text-muted pl-5">{item.detail}</span> : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
