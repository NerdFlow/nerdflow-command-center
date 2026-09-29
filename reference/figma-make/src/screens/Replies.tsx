import { useState } from 'react';
import { loggedReplies, awaitingReply, type LoggedReply, type AwaitingReplyLead, type ReplyLabel } from '../data/sample';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAge(date: Date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function urgency(date: Date): { color: string; rank: number } {
  const hrs = (Date.now() - date.getTime()) / 3600000;
  if (hrs > 24) return { color: '#F87171', rank: 0 };
  if (hrs > 4)  return { color: '#F59E0B', rank: 1 };
  return { color: '#34E0A1', rank: 2 };
}

const labelStyle: Record<string, string> = {
  'Interested':      'text-[#34E0A1] bg-[#34E0A1]/10 border-[#34E0A1]/20',
  'Asked a question':'text-[#60A5FA] bg-[#60A5FA]/10 border-[#60A5FA]/20',
  'Objection':       'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20',
  'Not now':         'text-[#B8C9C2] bg-[#1D2925]/80 border-[#1D2925]',
  'Not interested':  'text-[#F87171] bg-[#F87171]/10 border-[#F87171]/20',
  'Wrong person':    'text-[#A78BFA] bg-[#A78BFA]/10 border-[#A78BFA]/20',
};

const channelIcon: Record<string, string> = { Email: '✉', Instagram: '📸', LinkedIn: '💼' };
const channelColor: Record<string, string> = { Email: '#60A5FA', Instagram: '#F472B6', LinkedIn: '#93C5FD' };
const channelOpen: Record<string, string> = { Email: 'Open Gmail', Instagram: 'Open Instagram', LinkedIn: 'Open LinkedIn' };

const LABELS: ReplyLabel[] = ['Interested', 'Asked a question', 'Objection', 'Not now', 'Not interested', 'Wrong person'];

function flowDraft(r: LoggedReply): string {
  const name = r.contact.split(' ')[0];
  switch (r.label) {
    case 'Interested':
      return `Hi ${name}, great to hear -- and ${r.business} managing 35 properties with after-hours calls sounds exhausting.\n\nOur pricing is per listing. Most managers your size pay $8-12/listing/month -- less than one midnight callback incident.\n\nHappy to run the exact number and do a 5-minute demo. Does Thursday morning work?`;
    case 'Asked a question':
      return `Great question. Auto-replies just acknowledge the message. HostCo actually resolves the issue. If a guest says the WiFi is down at 1am, we troubleshoot it, contact the host if needed, and follow up until it's fixed.\n\nMost managers describe it as a night manager without the headcount. Worth a 10-min call to see if it fits?`;
    case 'Objection':
      return `Totally fair -- a lot of tools in this space are expensive and under-deliver. Two things are different here:\n\n1. Per-listing pricing. At your property count you'd pay around $200-300/month.\n2. We handle the issue end-to-end, not just route the message.\n\nI can show you the exact cost in 10 minutes. When works?`;
    case 'Not now':
      return `Completely understand. I'll circle back in January when things have settled.\n\nOne thing worth noting: Q1 is peak booking season, so that's when guest communication volume spikes. Happy to time a conversation for when it's actually useful.`;
    case 'Not interested':
      return `Thanks for getting back to me -- I appreciate the directness. I'll take ${r.business} off the list. Good luck!`;
    default:
      return r.draftResponse;
  }
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0B1210] border border-[#34E0A1]/40 text-[#34E0A1] text-sm font-medium px-5 py-2.5 rounded-xl shadow-xl animate-fade-up flex items-center gap-2">
      <span>✓</span> {msg}
    </div>
  );
}

// ─── Inline Log Form (for Did They Reply section) ───────────────────────────

function InlineLogForm({ lead, onSave, onSkip }: {
  lead: AwaitingReplyLead;
  onSave: (label: ReplyLabel, text: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState('');
  const [label, setLabel] = useState<ReplyLabel | null>(null);
  const [flowGuess, setFlowGuess] = useState<ReplyLabel | null>(null);

  function handleText(t: string) {
    setText(t);
    if (t.length > 10) {
      const tl = t.toLowerCase();
      let g: ReplyLabel | null = null;
      if (tl.includes('interested') || tl.includes('pricing') || tl.includes('demo')) g = 'Interested';
      else if (tl.includes('?') || tl.includes('how') || tl.includes('what') || tl.includes('different')) g = 'Asked a question';
      else if (tl.includes('expensive') || tl.includes('already have') || tl.includes('not sure')) g = 'Objection';
      else if (tl.includes('not now') || tl.includes('not the right') || tl.includes('maybe later')) g = 'Not now';
      else if (tl.includes('not interested') || tl.includes('no thanks') || tl.includes('remove')) g = 'Not interested';
      setFlowGuess(g);
      if (g && !label) setLabel(g);
    } else {
      setFlowGuess(null);
    }
  }

  return (
    <div className="mt-3 space-y-3 animate-fade-up">
      <textarea
        value={text}
        onChange={e => handleText(e.target.value)}
        placeholder="Paste their reply (optional) — Flow will label it for you"
        rows={3}
        className="w-full bg-[#050807] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6B7E78] resize-none focus:outline-none focus:border-[#34E0A1]/40 transition-colors leading-relaxed"
      />
      {flowGuess && (
        <div className="flex items-center gap-2 animate-fade-up">
          <span className="text-[10px] text-[#34E0A1] font-mono">◆ Flow thinks:</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${labelStyle[flowGuess]}`}>{flowGuess}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {LABELS.map(l => (
          <button
            key={l}
            onClick={() => setLabel(label === l ? null : l)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${label === l ? labelStyle[l] : 'border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2]'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => label && onSave(label, text)}
          disabled={!label}
          className="bg-[#34E0A1] disabled:opacity-40 text-[#050807] font-semibold px-4 py-2 rounded-xl hover:bg-[#20B982] transition-colors text-xs"
        >
          Save reply
        </button>
        <button onClick={onSkip} className="px-4 py-2 border border-[#1D2925] text-[#6B7E78] rounded-xl hover:text-[#B8C9C2] transition-colors text-xs">
          Not yet
        </button>
      </div>
    </div>
  );
}

// ─── Waiting Row + Detail (stacked vertically) ──────────────────────────────

function WaitingRow({ reply, onDismiss }: { reply: LoggedReply; onDismiss: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(flowDraft(reply));
  const [showBook, setShowBook] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const u = urgency(reply.receivedAt);

  return (
    <div className={`bg-[#0B1210] border rounded-xl overflow-hidden transition-all ${open ? 'border-[#34E0A1]/20' : 'border-[#1D2925] hover:border-[#34E0A1]/15'}`}>
      {/* Row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left flex items-center gap-4 px-5 py-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white">{reply.business}</span>
            <span className="text-[11px]" style={{ color: channelColor[reply.channel] }}>{channelIcon[reply.channel]} {reply.channel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${labelStyle[reply.label]}`}>{reply.label}</span>
            <span className="text-xs text-[#6B7E78] truncate">{reply.text.slice(0, 60)}…</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ color: u.color, background: `${u.color}18` }}>
            {formatAge(reply.receivedAt)}
          </span>
          <span className="text-[#6B7E78] text-xs">{open ? '↑' : '↓'}</span>
        </div>
      </button>

      {/* Detail (stacked, not side-by-side) */}
      {open && (
        <div className="border-t border-[#1D2925] divide-y divide-[#1D2925] animate-fade-up">
          {/* Their reply */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Their reply</p>
            <p className="text-sm text-[#B8C9C2] leading-relaxed">{reply.text}</p>
          </div>

          {/* Flow draft */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <GlassesIcon size={14} />
              <span className="text-[10px] text-[#34E0A1] uppercase tracking-widest font-medium">Flow's draft</span>
            </div>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={6}
              className="w-full bg-[#050807] border border-[#34E0A1]/15 rounded-xl px-4 py-3 text-sm text-[#B8C9C2] resize-none focus:outline-none focus:border-[#34E0A1]/40 transition-colors leading-relaxed"
            />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => navigator.clipboard.writeText(draft)} className="text-[11px] bg-[#34E0A1] text-[#050807] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#20B982] transition-colors">Copy</button>
              {['Shorter', 'More casual', 'Different angle'].map(v => (
                <button key={v} className="text-[11px] border border-[#34E0A1]/20 text-[#34E0A1] px-2.5 py-1.5 rounded-lg hover:bg-[#34E0A1]/10 transition-colors">{v}</button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onDismiss('Marked as sent')} className="bg-[#34E0A1] text-[#050807] font-semibold px-4 py-2 rounded-xl hover:bg-[#20B982] transition-colors text-sm">Mark as sent</button>
              <button onClick={() => { setShowBook(b => !b); setShowSnooze(false); }} className={`border px-4 py-2 rounded-xl text-sm transition-all ${showBook ? 'border-[#34E0A1]/40 text-[#34E0A1] bg-[#34E0A1]/5' : 'border-[#1D2925] text-[#B8C9C2] hover:border-[#34E0A1]/30'}`}>Book meeting</button>
              <button onClick={() => { setShowSnooze(s => !s); setShowBook(false); }} className={`border px-4 py-2 rounded-xl text-sm transition-all ${showSnooze ? 'border-[#34E0A1]/40 text-[#34E0A1] bg-[#34E0A1]/5' : 'border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2]'}`}>Snooze</button>
            </div>
            {showBook && (
              <div className="space-y-2 pt-1 animate-fade-up">
                <input type="datetime-local" className="w-full bg-[#050807] border border-[#1D2925] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#34E0A1]/40" />
                <input placeholder="What do they care about?" className="w-full bg-[#050807] border border-[#1D2925] rounded-xl px-3 py-2 text-sm text-white placeholder-[#6B7E78] focus:outline-none focus:border-[#34E0A1]/40" />
                <button onClick={() => onDismiss('Meeting booked -- moved to Deals')} className="bg-[#34E0A1] text-[#050807] font-semibold px-4 py-2 rounded-xl hover:bg-[#20B982] transition-colors text-sm">Confirm booking</button>
              </div>
            )}
            {showSnooze && (
              <div className="flex gap-2 pt-1 animate-fade-up">
                <input type="date" className="bg-[#050807] border border-[#1D2925] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#34E0A1]/40" />
                <button onClick={() => onDismiss('Snoozed')} className="bg-[#121A17] border border-[#34E0A1]/30 text-[#34E0A1] px-4 py-2 rounded-xl hover:bg-[#34E0A1]/10 transition-colors text-sm font-medium">Set snooze</button>
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <select value={closeReason} onChange={e => setCloseReason(e.target.value)} className="bg-[#050807] border border-[#1D2925] rounded-xl px-3 py-2 text-xs text-[#6B7E78] focus:outline-none appearance-none">
                <option value="">Close lead -- choose reason</option>
                <option>Not a fit</option><option>Wrong timing</option><option>Has a competitor tool</option><option>No budget</option><option>Ghost</option>
              </select>
              {closeReason && <button onClick={() => onDismiss('Lead closed')} className="border border-[#F87171]/30 text-[#F87171] px-3 py-2 rounded-xl hover:bg-[#F87171]/10 transition-colors text-xs font-medium">Confirm</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Replies Screen ─────────────────────────────────────────────────────

export function Replies() {
  const [waiting, setWaiting] = useState<LoggedReply[]>(loggedReplies);
  const [pending, setPending] = useState<AwaitingReplyLead[]>(awaitingReply);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [savedCount, setSavedCount] = useState(0);

  const open = waiting.filter(r => r.status === 'open').sort((a, b) => urgency(a.receivedAt).rank - urgency(b.receivedAt).rank);
  const totalMessaged = pending.length + savedCount;
  const repliedCount = savedCount + (waiting.length - loggedReplies.length);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }

  function dismissWaiting(id: string, msg: string) {
    setWaiting(prev => prev.map(r => r.id === id ? { ...r, status: 'handled' as const } : r));
    showToast(msg);
  }

  function logReply(lead: AwaitingReplyLead, label: ReplyLabel, text: string) {
    const newReply: LoggedReply = {
      id: `lr-${lead.id}`,
      business: lead.business,
      contact: lead.contact,
      channel: lead.channel,
      label,
      text: text || `[Reply logged without pasting text]`,
      receivedAt: new Date(),
      status: 'open',
      campaign: lead.campaign,
      email: lead.email,
      instagram: lead.instagram,
      linkedin: lead.linkedin,
      touchHistory: [
        { channel: lead.channel, outcome: 'Sent', date: new Date(Date.now() - lead.messagedDaysAgo * 86400000) },
        { channel: lead.channel, outcome: 'Replied', date: new Date() },
      ],
      draftResponse: '',
    };
    setWaiting(prev => [newReply, ...prev]);
    setPending(prev => prev.filter(l => l.id !== lead.id));
    setSavedCount(c => c + 1);
    setExpanded(null);
    showToast(`${lead.business} moved to Waiting on You`);
  }

  const byChannel: Record<string, AwaitingReplyLead[]> = {};
  for (const l of pending) {
    if (!byChannel[l.channel]) byChannel[l.channel] = [];
    byChannel[l.channel].push(l);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

        {/* ── 1. Summary strip ───────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{totalMessaged + loggedReplies.length}</p>
              <p className="text-xs text-[#6B7E78] mt-0.5">Messaged this week</p>
            </div>
            <div className="w-px h-10 bg-[#1D2925]" />
            <div className="text-center">
              <p className="text-3xl font-bold text-[#34E0A1]">{open.length + savedCount}</p>
              <p className="text-xs text-[#6B7E78] mt-0.5">Replied</p>
            </div>
            <div className="w-px h-10 bg-[#1D2925]" />
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{pending.length}</p>
              <p className="text-xs text-[#6B7E78] mt-0.5">Waiting</p>
            </div>
          </div>

          <div className="bg-[#0B1210] border border-[#1D2925] rounded-xl px-5 py-4 space-y-3">
            <div className="flex items-start gap-3">
              <GlassesIcon size={16} />
              <p className="text-sm text-[#B8C9C2]">Check your inboxes -- takes 2 minutes. Mark who replied below.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(channelOpen).map(ch => (
                <a key={ch} href="#" onClick={e => e.preventDefault()} className="text-xs border border-[#1D2925] rounded-lg px-3 py-1.5 hover:border-[#34E0A1]/30 transition-colors" style={{ color: channelColor[ch] }}>
                  {channelIcon[ch]} {channelOpen[ch]}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* ── 2. Waiting on you ─────────────────────────────────────────── */}
        {open.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white uppercase tracking-widest">Waiting on you</h2>
              <span className="text-xs font-bold text-[#050807] bg-[#F87171] px-1.5 py-0.5 rounded-full">{open.length}</span>
            </div>
            <div className="space-y-2">
              {open.map(r => (
                <WaitingRow key={r.id} reply={r} onDismiss={(msg) => dismissWaiting(r.id, msg)} />
              ))}
            </div>
          </div>
        )}

        {open.length === 0 && (
          <div className="bg-[#0B1210] border border-[#1D2925] rounded-xl px-5 py-6 flex items-center gap-4">
            <GlassesIcon size={18} />
            <div>
              <p className="text-sm font-semibold text-white">All caught up.</p>
              <p className="text-xs text-[#6B7E78]">Nobody's waiting on you.</p>
            </div>
          </div>
        )}

        {/* ── 3. Did they reply? ─────────────────────────────────────────── */}
        {pending.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-widest">Did they reply?</h2>
              <p className="text-xs text-[#6B7E78]">{pending.length} people you messaged</p>
            </div>

            {Object.entries(byChannel).map(([channel, leads]) => (
              <div key={channel} className="bg-[#0B1210] border border-[#1D2925] rounded-xl overflow-hidden">
                {/* Channel header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#1D2925]">
                  <div className="flex items-center gap-2">
                    <span style={{ color: channelColor[channel] }}>{channelIcon[channel]}</span>
                    <span className="text-sm font-semibold text-white">{channel}</span>
                    <span className="text-xs text-[#6B7E78]">{leads.length}</span>
                  </div>
                  <a href="#" onClick={e => e.preventDefault()} className="text-xs font-medium hover:opacity-80 transition-opacity" style={{ color: channelColor[channel] }}>
                    {channelOpen[channel]} →
                  </a>
                </div>

                {/* Lead rows */}
                <div className="divide-y divide-[#1D2925]">
                  {leads.map(lead => (
                    <div key={lead.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-white">{lead.business}</span>
                            <span className="text-xs text-[#6B7E78]">· {lead.contact}</span>
                          </div>
                          <p className="text-[11px] text-[#6B7E78] mb-1">Messaged {lead.messagedDaysAgo} day{lead.messagedDaysAgo !== 1 ? 's' : ''} ago</p>
                          <p className="text-xs text-[#4B5E58] italic truncate">"{lead.preview}"</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${expanded === lead.id ? 'bg-[#34E0A1]/10 border-[#34E0A1]/30 text-[#34E0A1]' : 'bg-[#121A17] border-[#1D2925] text-[#B8C9C2] hover:border-[#34E0A1]/20 hover:text-white'}`}
                          >
                            Replied
                          </button>
                          <button className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2] transition-colors">
                            Not yet
                          </button>
                        </div>
                      </div>
                      {expanded === lead.id && (
                        <InlineLogForm
                          lead={lead}
                          onSave={(label, text) => logReply(lead, label, text)}
                          onSkip={() => setExpanded(null)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <p className="text-xs text-[#6B7E78] text-center">
              No reply after the wait period? They go back into Focus mode for the next follow-up automatically.
            </p>
          </div>
        )}
      </div>

      {toast && <Toast msg={toast} />}
    </div>
  );
}

function GlassesIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <circle cx="7" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <circle cx="17" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <path d="M3 14C3 10 5 7 7 6M21 14C21 10 19 7 17 6M11 14h2" stroke="#34E0A1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
