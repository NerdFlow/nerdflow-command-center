import { useState } from 'react';
import { type AwaitingReplyLead, type ReplyLabel } from '../data/sample';

const LABELS: ReplyLabel[] = [
  'Interested',
  'Asked a question',
  'Objection',
  'Not now',
  'Not interested',
  'Wrong person',
];

const labelColors: Record<ReplyLabel, string> = {
  'Interested': 'bg-[#34E0A1]/15 text-[#34E0A1] border-[#34E0A1]/30',
  'Asked a question': 'bg-[#60A5FA]/15 text-[#60A5FA] border-[#60A5FA]/30',
  'Objection': 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30',
  'Not now': 'bg-[#6B7E78]/15 text-[#B8C9C2] border-[#6B7E78]/30',
  'Not interested': 'bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30',
  'Wrong person': 'bg-[#A78BFA]/15 text-[#A78BFA] border-[#A78BFA]/30',
};

function guessLabel(text: string): ReplyLabel | null {
  const t = text.toLowerCase();
  if (t.includes('interested') || t.includes('pricing') || t.includes('demo') || t.includes('tell me more')) return 'Interested';
  if (t.includes('?') || t.includes('how does') || t.includes('what does') || t.includes('different')) return 'Asked a question';
  if (t.includes('expensive') || t.includes('too much') || t.includes('already have') || t.includes('not sure')) return 'Objection';
  if (t.includes('not now') || t.includes('not the right time') || t.includes('maybe later') || t.includes('q1') || t.includes('next year')) return 'Not now';
  if (t.includes('not interested') || t.includes('no thanks') || t.includes('remove me') || t.includes('unsubscribe')) return 'Not interested';
  if (t.includes('wrong') || t.includes('not me') || t.includes('you want') || t.includes('reach out to')) return 'Wrong person';
  return null;
}

interface LogReplySheetProps {
  leads: AwaitingReplyLead[];
  onDone: () => void;
}

export function LogReplySheet({ leads, onDone }: LogReplySheetProps) {
  const [idx, setIdx] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [label, setLabel] = useState<ReplyLabel | null>(null);
  const [flowGuess, setFlowGuess] = useState<ReplyLabel | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [referredName, setReferredName] = useState('');
  const [referredTitle, setReferredTitle] = useState('');

  const lead = leads[idx];

  function handleTextChange(text: string) {
    setReplyText(text);
    if (text.length > 10) {
      const guess = guessLabel(text);
      setFlowGuess(guess);
      if (guess && !label) setLabel(guess);
    } else {
      setFlowGuess(null);
    }
  }

  function saveAndNext() {
    if (idx < leads.length - 1) {
      setIdx(i => i + 1);
      setReplyText('');
      setLabel(null);
      setFlowGuess(null);
      setFollowUpDate('');
      setReferredName('');
      setReferredTitle('');
    } else {
      onDone();
    }
  }

  const channelColor: Record<string, string> = {
    Email: '#60A5FA',
    Instagram: '#F472B6',
    LinkedIn: '#93C5FD',
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center py-10 px-6">
      <div className="w-full max-w-xl space-y-5">
        {/* Progress */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{idx + 1} of {leads.length}</span>
            <span className="text-sm text-[#6B7E78]">replies to log</span>
          </div>
          <div className="flex gap-1">
            {leads.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all ${i < idx ? 'w-6 bg-[#34E0A1]' : i === idx ? 'w-6 bg-[#34E0A1]/60' : 'w-4 bg-[#1D2925]'}`} />
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#0B1210] border border-[#1D2925] rounded-2xl overflow-hidden animate-fade-up">
          {/* Lead info header */}
          <div className="px-6 py-4 border-b border-[#1D2925] flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-[#34E0A1]/10 border border-[#34E0A1]/20 flex items-center justify-center text-[11px] font-bold text-[#34E0A1]">
              {lead.business.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{lead.business}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-[#6B7E78]">{lead.contact}</span>
                <span className="text-xs" style={{ color: channelColor[lead.channel] }}>· {lead.channel}</span>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Paste area */}
            <div className="space-y-2">
              <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Paste their reply</label>
              <textarea
                value={replyText}
                onChange={e => handleTextChange(e.target.value)}
                placeholder="Optional — paste their message here and Flow will label it for you"
                rows={4}
                className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6B7E78] resize-none focus:outline-none focus:border-[#34E0A1]/40 transition-colors leading-relaxed"
              />
              {flowGuess && (
                <div className="flex items-center gap-2 animate-fade-up">
                  <span className="text-[10px] text-[#34E0A1] font-mono">◆ Flow thinks:</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${labelColors[flowGuess]}`}>{flowGuess}</span>
                  <span className="text-[10px] text-[#6B7E78]">— change below if wrong</span>
                </div>
              )}
            </div>

            {/* Label chips */}
            <div className="space-y-2">
              <p className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Label this reply</p>
              <div className="flex flex-wrap gap-2">
                {LABELS.map(l => (
                  <button
                    key={l}
                    onClick={() => setLabel(label === l ? null : l)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${label === l ? labelColors[l] : 'bg-transparent border-[#1D2925] text-[#6B7E78] hover:border-[#34E0A1]/20 hover:text-[#B8C9C2]'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional fields */}
            {label === 'Not now' && (
              <div className="space-y-2 animate-fade-up">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Follow up on</label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={e => setFollowUpDate(e.target.value)}
                  className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#34E0A1]/40 transition-colors"
                />
              </div>
            )}

            {label === 'Wrong person' && (
              <div className="space-y-3 animate-fade-up">
                <p className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Who should we contact instead?</p>
                <input
                  value={referredName}
                  onChange={e => setReferredName(e.target.value)}
                  placeholder="Referred name"
                  className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#6B7E78] focus:outline-none focus:border-[#34E0A1]/40 transition-colors"
                />
                <input
                  value={referredTitle}
                  onChange={e => setReferredTitle(e.target.value)}
                  placeholder="Title (e.g. Operations Manager)"
                  className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#6B7E78] focus:outline-none focus:border-[#34E0A1]/40 transition-colors"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#1D2925] flex gap-3">
            <button
              onClick={saveAndNext}
              className="flex-1 bg-[#34E0A1] text-[#050807] font-semibold py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm"
            >
              {idx < leads.length - 1 ? 'Save & next →' : 'Save & start session →'}
            </button>
            <button
              onClick={saveAndNext}
              className="px-5 py-2.5 border border-[#1D2925] text-[#6B7E78] rounded-xl hover:text-[#B8C9C2] transition-colors text-sm"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
