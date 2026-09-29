import { useState } from 'react';

type FlowState = 'idle' | 'thinking' | 'answered';

interface FlowPanelProps {
  screen: string;
  collapsed: boolean;
  onToggle: () => void;
}

const screenPrompts: Record<string, string[]> = {
  today: [
    'What should I do first today?',
    'Which leads are hottest right now?',
    'Summarize yesterday for me',
  ],
  focus: [
    'How do I handle "send me an email"?',
    'What\'s the best opener for this lead?',
    'Give me three discovery questions',
  ],
  campaigns: [
    'Help me write a campaign brief',
    'What\'s the best channel for STR managers?',
    'Review my ICP for gaps',
  ],
  'lead-gen': [
    'What keywords work best in Florida?',
    'Explain the fit score for this run',
    'When should I auto-approve leads?',
  ],
  replies: [
    'Draft a response to this objection',
    'How do I turn "not now" into a yes?',
    'Prioritize my reply queue',
  ],
  deals: [
    'What\'s my next move on TropicStay?',
    'How do I prep for Friday\'s demo?',
    'Which deal is most at risk?',
  ],
};

const thinkingLines = [
  'Checking your lead queue…',
  'Looking at campaign data…',
  'Reading the context…',
  'Pulling insights…',
];

const canned: Record<string, string> = {
  'What should I do first today?': "Start with the 3 open replies — two are interested leads that went cold overnight. Handle those before calls. Then hit the 12 call-ready leads. You need 8 more conversations to hit your weekly target.",
  'Which leads are hottest right now?': "Sunshine Property Management (Dana Kim) replied and mentioned they\'re actively looking. Suncoast Stays has a demo booked Friday. Gulf Coast Getaways has 60 listings and is active on Instagram — DM them today.",
  'How do I handle "send me an email"?': '"Absolutely — what\'s the best address? I\'ll send something over in the next hour with a quick video showing exactly how it works for managers your size. Usually 2 minutes to watch." Then send the email within the hour. Don\'t let it sit.',
  'What\'s the best opener for this lead?': "\"Hi [Name], I noticed [Business] manages properties in [City] — we work with a few managers there who were struggling with after-hours guest issues. We built something that fixes that without hiring staff. Worth a 10-minute call?\"",
};

export function FlowPanel({ screen, collapsed, onToggle }: FlowPanelProps) {
  const [state, setState] = useState<FlowState>('idle');
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [thinkLine, setThinkLine] = useState('');

  const prompts = screenPrompts[screen] ?? screenPrompts['today'];

  function ask(q: string) {
    setState('thinking');
    setThinkLine(thinkingLines[Math.floor(Math.random() * thinkingLines.length)]);
    setInput('');
    setTimeout(() => {
      const resp = canned[q] ?? "I'm looking at the context here. Focus on the highest fit-score leads first — those conversations convert 3x better. Want me to pull the specific list?";
      setAnswer(resp);
      setState('answered');
    }, 1400);
  }

  function reset() {
    setState('idle');
    setAnswer('');
    setInput('');
  }

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-2 py-4 px-2 bg-[#0B1210] border border-[#1D2925] border-r-0 rounded-l-xl cursor-pointer hover:border-[#34E0A1]/40 transition-colors"
        title="Open Flow (press /)"
      >
        <span className="text-[10px] text-[#B8C9C2] font-mono tracking-widest" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>FLOW</span>
        <div className="w-6 h-6 rounded-full bg-[#34E0A1]/10 flex items-center justify-center">
          <GlassesIcon size={12} />
        </div>
      </button>
    );
  }

  return (
    <div className="w-72 shrink-0 flex flex-col bg-[#0B1210] border-l border-[#1D2925] h-full animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1D2925]">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full bg-[#34E0A1]/10 border border-[#34E0A1]/30 flex items-center justify-center ${state === 'thinking' ? 'animate-flow-pulse' : ''}`}>
            <GlassesIcon size={14} />
          </div>
          <span className="text-sm font-semibold text-white">Flow</span>
          {state === 'thinking' && (
            <span className="text-[10px] text-[#34E0A1] font-mono animate-pulse">thinking</span>
          )}
        </div>
        <button onClick={onToggle} className="text-[#6B7E78] hover:text-[#B8C9C2] transition-colors text-xs font-mono">/</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {state === 'idle' && (
          <>
            <p className="text-[11px] text-[#6B7E78] uppercase tracking-widest font-medium">Suggested</p>
            {prompts.map((p) => (
              <button
                key={p}
                onClick={() => ask(p)}
                className="w-full text-left text-sm text-[#B8C9C2] bg-[#121A17] hover:bg-[#34E0A1]/5 border border-[#1D2925] hover:border-[#34E0A1]/30 rounded-lg px-3 py-2.5 transition-all"
              >
                {p}
              </button>
            ))}
          </>
        )}

        {state === 'thinking' && (
          <div className="space-y-3">
            <div className="flex gap-2 items-start">
              <div className="w-5 h-5 rounded-full bg-[#34E0A1]/10 flex items-center justify-center shrink-0 mt-0.5 animate-flow-pulse">
                <GlassesIcon size={10} />
              </div>
              <p className="text-sm text-[#6B7E78] italic">{thinkLine}</p>
            </div>
            <div className="space-y-1.5 pl-7">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-2.5 bg-[#1D2925] rounded-full animate-pulse" style={{ width: `${60 + i * 15}%`, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          </div>
        )}

        {state === 'answered' && (
          <div className="space-y-3 animate-fade-up">
            <div className="flex gap-2 items-start">
              <div className="w-5 h-5 rounded-full bg-[#34E0A1]/10 border border-[#34E0A1]/30 flex items-center justify-center shrink-0 mt-0.5">
                <GlassesIcon size={10} />
              </div>
              <p className="text-sm text-[#B8C9C2] leading-relaxed">{answer}</p>
            </div>
            <div className="pl-7 flex gap-2">
              <button className="text-[11px] bg-[#34E0A1] text-[#050807] font-semibold rounded-md px-3 py-1.5 hover:bg-[#20B982] transition-colors">
                Use this
              </button>
              <button onClick={reset} className="text-[11px] text-[#6B7E78] hover:text-[#B8C9C2] transition-colors px-2">
                Ask another
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#1D2925]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && input.trim() && ask(input.trim())}
            placeholder="Ask Flow anything…"
            className="flex-1 bg-[#121A17] border border-[#1D2925] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B7E78] focus:outline-none focus:border-[#34E0A1]/50 transition-colors"
          />
          <button
            onClick={() => input.trim() && ask(input.trim())}
            disabled={!input.trim()}
            className="w-8 h-8 rounded-lg bg-[#34E0A1]/10 hover:bg-[#34E0A1]/20 border border-[#34E0A1]/30 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 6h10M6 1l5 5-5 5" stroke="#34E0A1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-[#6B7E78] mt-2 font-mono">Press / to toggle · Enter to send</p>
      </div>
    </div>
  );
}

function GlassesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="7" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <circle cx="17" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <path d="M3 14C3 10 5 7 7 6M21 14C21 10 19 7 17 6M11 14h2" stroke="#34E0A1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
