import { useState, useEffect } from 'react';
import { leads } from '../data/sample';

type Outcome = null | 'no-answer' | 'voicemail' | 'not-interested' | 'follow-up' | 'interested' | 'meeting' | 'wrong-number';
type Feedback = 'up' | 'down' | null;

interface ResponseRecord {
  id: string;
  text: string;
  used: number;
  won: number;
  isTesting?: boolean;
}

interface Objection {
  label: string;
  responses: ResponseRecord[];
}

const objections: Objection[] = [
  {
    label: 'Too expensive',
    responses: [
      { id: 'te1', text: 'Most managers your size spend about the same on one missed guest issue. Can I show you the math in 10 minutes?', used: 11, won: 8 },
      { id: 'te2', text: 'Totally understand -- a lot of tools in this space overpromise. What were you paying before? I want to give you an honest number for your listing count.', used: 9, won: 2 },
      { id: 'te3', text: 'Fair. What would it need to cost to be worth it? I want to know if we\'re even in the right ballpark before pitching anything.', used: 3, won: 2, isTesting: true },
    ],
  },
  {
    label: 'Already have a tool',
    responses: [
      { id: 'at1', text: 'What are you using? If it handles after-hours guest issues automatically, we probably can\'t help. But if your team still picks up calls at 2am -- we can.', used: 14, won: 9 },
      { id: 'at2', text: 'Got it. Does it resolve issues end-to-end, or does it still route things back to you? That\'s the gap we usually fill.', used: 6, won: 3 },
    ],
  },
  {
    label: 'Send me an email',
    responses: [
      { id: 'em1', text: 'Absolutely -- what\'s the best address? I\'ll send something specific to managers your size. Usually takes 2 minutes to read.', used: 8, won: 3 },
      { id: 'em2', text: 'Of course. One quick thing first -- what\'s your biggest guest communication headache right now? I\'ll make the email actually relevant.', used: 4, won: 2, isTesting: true },
    ],
  },
  {
    label: 'Not the decision maker',
    responses: [
      { id: 'nd1', text: 'No problem -- who handles tech decisions for the property side? Happy to set something up with them directly.', used: 11, won: 6 },
    ],
  },
  {
    label: 'Bad time',
    responses: [
      { id: 'bt1', text: 'Of course. When\'s a better moment -- later this week or early next? I\'ll call you exactly then.', used: 16, won: 10 },
    ],
  },
  {
    label: 'Not interested',
    responses: [
      { id: 'ni1', text: 'Fair enough. Can I ask what\'s working well for you right now? I want to make sure we\'re not solving a problem you don\'t have.', used: 7, won: 2 },
    ],
  },
];

function badge(r: ResponseRecord): { label: string; color: string } {
  if (r.used < 10) return { label: r.isTesting ? 'New - Testing' : 'New', color: '#6B7E78' };
  const rate = r.won / r.used;
  if (rate >= 0.6) return { label: `Worked ${r.won} of ${r.used}`, color: '#34E0A1' };
  if (rate >= 0.3) return { label: `Worked ${r.won} of ${r.used}`, color: '#F59E0B' };
  return { label: `Worked ${r.won} of ${r.used}`, color: '#F87171' };
}

function getLeadLocalTime(city: string): { time: string; isBusinessHours: boolean } {
  const now = new Date();
  const cityLower = city.toLowerCase();
  let tz = 'America/New_York';
  if (cityLower.includes('los angeles') || cityLower.includes('san francisco') || cityLower.includes('seattle') || cityLower.includes('portland')) tz = 'America/Los_Angeles';
  else if (cityLower.includes('chicago') || cityLower.includes('dallas') || cityLower.includes('houston') || cityLower.includes('denver')) tz = 'America/Chicago';
  else if (cityLower.includes('phoenix')) tz = 'America/Phoenix';
  const timeStr = now.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
  const hourInTz = parseInt(now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
  return { time: timeStr, isBusinessHours: hourInTz >= 8 && hourInTz < 18 };
}

interface FocusModeProps {
  onEnd: () => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  onFlowToggle: () => void;
  flowVisible: boolean;
}

export function FocusMode({ onEnd, onSessionStart, onSessionEnd: _onSessionEnd, onFlowToggle, flowVisible }: FocusModeProps) {
  const [started, setStarted] = useState(false);
  const [channel, setChannel] = useState('Call');
  const [leadIdx, setLeadIdx] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [activeObjection, setActiveObjection] = useState<Objection | null>(null);
  // Per-objection: which response variant index is showing
  const [variantIdx, setVariantIdx] = useState<Record<string, number>>({});
  // Feedback per response id
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  // Toast
  const [toast, setToast] = useState('');
  // Which response ids were used this call (for the outcome signal)
  const [usedResponses, setUsedResponses] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(3600);
  const [coachLine, setCoachLine] = useState('');
  const [showCoach, setShowCoach] = useState(false);
  const [followUpAction, setFollowUpAction] = useState('Call again');
  const [followUpWhen, setFollowUpWhen] = useState('Tomorrow');
  const [followUpNote, setFollowUpNote] = useState('');
  const [meetingDt, setMeetingDt] = useState('');
  const [meetingCares, setMeetingCares] = useState('');

  const lead = leads[leadIdx % leads.length];
  const firstName = lead.contact?.split(' ')[0] ?? 'there';
  const localTime = started ? getLeadLocalTime(lead.city) : null;

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [started]);

  const coachLines = [
    'Nice pace on that opener. Keep leading with the pain point.',
    'Good move asking about their listing count early. That qualifies fast.',
    'Strong close on the time-slot. You didn\'t leave it open-ended.',
    'You handled the price objection clean. That\'ll stick.',
    'Discovery questions landed well. Keep that up.',
  ];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function giveFeedback(responseId: string, val: Feedback) {
    setFeedback(prev => ({ ...prev, [responseId]: val }));
    showToast('Thanks -- Flow will learn from this.');
  }

  function getActiveResponse(obj: Objection): ResponseRecord {
    const idx = variantIdx[obj.label] ?? 0;
    return obj.responses[Math.min(idx, obj.responses.length - 1)];
  }

  function tryAnother(obj: Objection) {
    const current = variantIdx[obj.label] ?? 0;
    const next = (current + 1) % obj.responses.length;
    setVariantIdx(prev => ({ ...prev, [obj.label]: next }));
    const nextResp = obj.responses[next];
    if (nextResp && !usedResponses.includes(nextResp.id)) {
      setUsedResponses(prev => [...prev, nextResp.id]);
    }
  }

  function selectObjection(obj: Objection) {
    if (activeObjection?.label === obj.label) {
      setActiveObjection(null);
      return;
    }
    setActiveObjection(obj);
    const resp = getActiveResponse(obj);
    if (!usedResponses.includes(resp.id)) setUsedResponses(prev => [...prev, resp.id]);
  }

  function handleOutcome(o: Outcome) {
    setOutcome(o);
    setActiveObjection(null);
    if (o === 'follow-up' || o === 'meeting' || o === 'not-interested' || o === 'voicemail' || o === 'no-answer') {
      setCoachLine(coachLines[Math.floor(Math.random() * coachLines.length)]);
    }
  }

  function saveAndNext() {
    setShowCoach(true);
    setTimeout(() => {
      setShowCoach(false);
      setLeadIdx(i => i + 1);
      setOutcome(null);
      setActiveObjection(null);
      setNotes('');
      setFollowUpNote('');
      setMeetingDt('');
      setMeetingCares('');
      setProgress(p => p + 1);
      setUsedResponses([]);
      setFeedback({});
    }, 3000);
  }

  const didUseObjection = usedResponses.length > 0;
  const positiveOutcome = outcome === 'interested' || outcome === 'meeting';
  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, '0');

  if (!started) {
    return <SessionSetup onStart={(ch) => { setChannel(ch); setStarted(true); onSessionStart?.(); }} onCancel={onEnd} />;
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Toast */}
      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0B1210] border border-[#34E0A1]/30 text-[#34E0A1] text-xs font-medium px-4 py-2 rounded-full shadow-lg animate-fade-up">
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#0B1210] border-b border-[#1D2925] shrink-0 z-10">
        <div className="flex items-center gap-4">
          <PhoneIcon />
          <span className="text-sm font-semibold text-white">{channel} session</span>
          <span className="text-xs font-mono text-[#6B7E78] bg-[#121A17] px-2 py-1 rounded-md">{mins}:{secs}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#B8C9C2]"><span className="font-semibold text-white">{progress}</span> / 15 calls</span>
          <span className="text-sm text-[#B8C9C2]"><span className="text-[#34E0A1] font-semibold">2</span> conversations</span>
          <button
            onClick={onFlowToggle}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${flowVisible ? 'border-[#34E0A1]/40 text-[#34E0A1] bg-[#34E0A1]/5' : 'border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2]'}`}
          >
            <GlassesIcon size={12} /> Flow
          </button>
          <button onClick={onEnd} className="text-xs text-[#6B7E78] hover:text-[#B8C9C2] border border-[#1D2925] rounded-lg px-3 py-1.5 transition-colors">
            End session
          </button>
        </div>
      </div>

      {/* 3 columns */}
      <div className="flex-1 grid grid-cols-3 overflow-hidden">
        {/* Left: Who */}
        <div className="border-r border-[#1D2925] overflow-y-auto p-5 space-y-5 pb-28">
          {localTime && (
            <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ${localTime.isBusinessHours ? 'bg-[#34E0A1]/8 text-[#34E0A1]' : 'bg-[#F59E0B]/8 text-[#F59E0B]'}`}>
              <span>{localTime.isBusinessHours ? '🟢' : '🟡'}</span>
              <span>{localTime.time} in {lead.city.split(',')[0]} · {localTime.isBusinessHours ? 'Good time to call' : 'Outside business hours'}</span>
            </div>
          )}
          <div>
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest mb-2">Calling</p>
            <h2 className="text-xl font-bold text-white">{lead.business}</h2>
            <p className="text-sm text-[#6B7E78] mt-0.5">{lead.city} · {lead.contact ?? 'Ask for the owner'}</p>
            {lead.title && <p className="text-xs text-[#6B7E78]">{lead.title}</p>}
          </div>
          {lead.phone && (
            <div className="bg-[#121A17] border border-[#1D2925] rounded-xl p-4">
              <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest mb-2">Phone</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xl font-bold text-white font-mono tracking-wide">{lead.phone}</span>
                <button onClick={() => navigator.clipboard.writeText(lead.phone!)} className="shrink-0 text-[10px] text-[#34E0A1] border border-[#34E0A1]/30 rounded-md px-2 py-1 hover:bg-[#34E0A1]/10 transition-colors font-mono">C</button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex justify-between">
              <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Fit</p>
              <span className={`text-xs font-bold ${lead.fitScore >= 80 ? 'text-[#34E0A1]' : 'text-[#F59E0B]'}`}>{lead.fitScore}/100</span>
            </div>
            <div className="h-1.5 bg-[#1D2925] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${lead.fitScore}%`, background: lead.fitScore >= 80 ? '#34E0A1' : '#F59E0B' }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lead.signals.map(s => <span key={s} className="text-[11px] bg-[#34E0A1]/10 text-[#34E0A1] border border-[#34E0A1]/20 rounded-full px-2.5 py-0.5">{s}</span>)}
            {lead.gaps.map(g => <span key={g} className="text-[11px] bg-[#1D2925] text-[#6B7E78] rounded-full px-2.5 py-0.5">{g}</span>)}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Notes</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Type during the call..." rows={3} className="w-full bg-[#121A17] border border-[#1D2925] rounded-lg p-2.5 text-sm text-white placeholder-[#6B7E78] resize-none focus:outline-none focus:border-[#34E0A1]/40 transition-colors" />
          </div>
        </div>

        {/* Center: Plan + outcome fields */}
        <div className="border-r border-[#1D2925] overflow-y-auto p-5 space-y-5 pb-28">
          <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Why this lead</p>
          <p className="text-sm text-[#B8C9C2] leading-relaxed">{lead.flowReason}</p>
          <div className="bg-[#34E0A1]/5 border border-[#34E0A1]/20 rounded-xl p-4 space-y-2">
            <p className="text-[10px] text-[#34E0A1] uppercase tracking-widest font-medium">Opener</p>
            <p className="text-sm text-white leading-relaxed">
              "Hi {firstName}, I noticed {lead.business} manages properties in {lead.city.split(',')[0]} -- we work with managers there who were struggling with after-hours guest issues. We built something that handles that without hiring staff. Worth 10 minutes?"
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Discovery questions</p>
            {['How many listings are you managing right now?', 'What happens when a guest has an issue at midnight -- who picks it up?', 'Are you using any tools for guest communication, or is it still manual?'].map(q => (
              <label key={q} className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="mt-0.5 accent-[#34E0A1] shrink-0" />
                <span className="text-sm text-[#B8C9C2] group-hover:text-white transition-colors">{q}</span>
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Talk track</p>
            {['HostCo handles guest escalations 24/7 -- no staff required', 'Integrates with Guesty', 'Per-listing pricing -- scales as they grow', 'Most managers see fewer complaints in week one'].map(b => (
              <div key={b} className="flex gap-2"><span className="text-[#34E0A1] shrink-0 mt-1">·</span><p className="text-sm text-[#B8C9C2]">{b}</p></div>
            ))}
          </div>
          <div className="bg-[#121A17] border border-[#1D2925] rounded-xl p-4">
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest mb-1">The ask</p>
            <p className="text-sm font-semibold text-white">"Book a 15-min demo this week"</p>
          </div>

          {/* Outcome signal when positive outcome + objection used */}
          {positiveOutcome && didUseObjection && !showCoach && (
            <div className="flex items-center gap-2 text-xs text-[#34E0A1] bg-[#34E0A1]/5 border border-[#34E0A1]/15 rounded-lg px-3 py-2 animate-fade-up">
              <span>◆</span>
              <span>Flow noted which responses helped on this call.</span>
            </div>
          )}

          {outcome === 'follow-up' && !showCoach && (
            <div className="space-y-3 animate-fade-up border-t border-[#1D2925] pt-4">
              <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Schedule follow-up</p>
              <div className="space-y-2">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Next action</label>
                <div className="flex gap-2">
                  {['Call again', 'Send email', 'Send DM'].map(opt => (
                    <button key={opt} onClick={() => setFollowUpAction(opt)} className={`flex-1 text-xs py-2 rounded-xl border transition-all ${followUpAction === opt ? 'border-[#34E0A1]/40 bg-[#34E0A1]/10 text-[#34E0A1]' : 'border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2]'}`}>{opt}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">When</label>
                <div className="flex gap-2">
                  {['Later today', 'Tomorrow', 'Pick date'].map(opt => (
                    <button key={opt} onClick={() => setFollowUpWhen(opt)} className={`flex-1 text-xs py-2 rounded-xl border transition-all ${followUpWhen === opt ? 'border-[#34E0A1]/40 bg-[#34E0A1]/10 text-[#34E0A1]' : 'border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2]'}`}>{opt}</button>
                  ))}
                </div>
                {followUpWhen === 'Pick date' && <input type="datetime-local" className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#34E0A1]/40" />}
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Note for next time</label>
                <textarea value={followUpNote} onChange={e => setFollowUpNote(e.target.value)} rows={2} placeholder="What did you learn?" className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-3 py-2 text-sm text-white placeholder-[#6B7E78] resize-none focus:outline-none focus:border-[#34E0A1]/40 transition-colors" />
              </div>
              <button onClick={saveAndNext} className="w-full bg-[#34E0A1] text-[#050807] font-semibold py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">Save & next lead</button>
            </div>
          )}

          {outcome === 'interested' && !showCoach && (
            <div className="border-t border-[#1D2925] pt-4 space-y-3 animate-fade-up">
              <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Follow-up for interested lead</p>
              <div className="space-y-2">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Next action</label>
                <div className="flex gap-2">
                  {['Send email', 'Call again', 'Send DM'].map(opt => (
                    <button key={opt} onClick={() => setFollowUpAction(opt)} className={`flex-1 text-xs py-2 rounded-xl border transition-all ${followUpAction === opt ? 'border-[#34E0A1]/40 bg-[#34E0A1]/10 text-[#34E0A1]' : 'border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2]'}`}>{opt}</button>
                  ))}
                </div>
              </div>
              <textarea value={followUpNote} onChange={e => setFollowUpNote(e.target.value)} rows={2} placeholder="Note for follow-up..." className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-3 py-2 text-sm text-white placeholder-[#6B7E78] resize-none focus:outline-none focus:border-[#34E0A1]/40 transition-colors" />
              <button onClick={saveAndNext} className="w-full bg-[#34E0A1] text-[#050807] font-semibold py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">Save & next lead</button>
            </div>
          )}

          {outcome === 'meeting' && !showCoach && (
            <div className="space-y-3 animate-fade-up border-t border-[#1D2925] pt-4">
              <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Book the meeting</p>
              <input type="datetime-local" value={meetingDt} onChange={e => setMeetingDt(e.target.value)} className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#34E0A1]/40" />
              <input value={meetingCares} onChange={e => setMeetingCares(e.target.value)} placeholder="What do they care about most?" className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-3 py-2 text-sm text-white placeholder-[#6B7E78] focus:outline-none focus:border-[#34E0A1]/40" />
              <button onClick={saveAndNext} className="w-full bg-[#34E0A1] text-[#050807] font-semibold py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">Confirm meeting & next lead</button>
            </div>
          )}

          {(outcome === 'no-answer' || outcome === 'voicemail' || outcome === 'not-interested' || outcome === 'wrong-number') && !showCoach && (
            <div className="border-t border-[#1D2925] pt-4">
              <button onClick={saveAndNext} className="w-full bg-[#34E0A1] text-[#050807] font-semibold py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">Next lead</button>
            </div>
          )}

          {showCoach && (
            <div className="flex items-start gap-3 bg-[#34E0A1]/5 border border-[#34E0A1]/20 rounded-xl p-4 animate-fade-up mt-4">
              <span className="text-lg">⚡</span>
              <div>
                <p className="text-sm text-white font-medium">{coachLine}</p>
                <p className="text-xs text-[#6B7E78] mt-1">Loading next lead...</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Live objections */}
        <div className="overflow-y-auto p-5 space-y-4 pb-28">
          <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Live objections</p>
          <div className="space-y-2">
            {objections.map(obj => {
              const resp = getActiveResponse(obj);
              const b = badge(resp);
              const isActive = activeObjection?.label === obj.label;
              const fb = feedback[resp.id];
              return (
                <div key={obj.label}>
                  <button
                    onClick={() => selectObjection(obj)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${isActive ? 'bg-[#34E0A1]/10 border-[#34E0A1]/30 text-[#34E0A1]' : 'bg-[#121A17] border-[#1D2925] text-[#B8C9C2] hover:border-[#34E0A1]/20 hover:text-white'}`}
                  >
                    {obj.label}
                  </button>

                  {isActive && (
                    <div className="mt-2 bg-[#34E0A1]/5 border border-[#34E0A1]/20 rounded-xl p-4 space-y-3 animate-fade-up">
                      {/* Badge */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: b.color }}>{b.label}</span>
                        {resp.isTesting && (
                          <span className="text-[9px] bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 rounded px-1.5 py-0.5 uppercase tracking-wide font-bold">Testing</span>
                        )}
                      </div>
                      {/* Response text */}
                      <p className="text-sm text-white leading-relaxed">"{resp.text}"</p>

                      {/* Feedback buttons */}
                      {fb === null || fb === undefined ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => giveFeedback(resp.id, 'up')}
                            className="flex items-center gap-1.5 text-xs text-[#6B7E78] border border-[#1D2925] rounded-lg px-3 py-1.5 hover:border-[#34E0A1]/40 hover:text-[#34E0A1] transition-colors"
                          >
                            👍 Kept them talking
                          </button>
                          <button
                            onClick={() => giveFeedback(resp.id, 'down')}
                            className="flex items-center gap-1.5 text-xs text-[#6B7E78] border border-[#1D2925] rounded-lg px-3 py-1.5 hover:border-[#F87171]/40 hover:text-[#F87171] transition-colors"
                          >
                            👎 Lost them
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={fb === 'up' ? 'text-[#34E0A1]' : 'text-[#F87171]'}>
                            {fb === 'up' ? '👍 Kept them talking' : '👎 Lost them'}
                          </span>
                          <span className="text-[#1D2925]">·</span>
                          <span className="text-[#6B7E78]">Flow noted</span>
                        </div>
                      )}

                      {/* Try another */}
                      {obj.responses.length > 1 && (
                        <button
                          onClick={() => tryAnother(obj)}
                          className="text-xs text-[#6B7E78] hover:text-[#B8C9C2] transition-colors underline underline-offset-2"
                        >
                          Try another response
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-[#1D2925] pt-4 space-y-2">
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">They said...</p>
            <textarea placeholder="Type what the lead said..." rows={3} className="w-full bg-[#121A17] border border-[#1D2925] rounded-lg p-2.5 text-sm text-white placeholder-[#6B7E78] resize-none focus:outline-none focus:border-[#34E0A1]/40" />
            <button className="text-xs text-[#34E0A1] border border-[#34E0A1]/30 rounded-lg px-3 py-1.5 hover:bg-[#34E0A1]/10 transition-colors">Get response</button>
          </div>
        </div>
      </div>

      {/* Pinned outcome bar */}
      {!showCoach && (
        <div className="absolute bottom-0 left-0 right-0 bg-[#0B1210] border-t border-[#1D2925] px-5 py-3 z-20">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#6B7E78] uppercase tracking-widest mr-2">Log outcome</span>
            {([
              ['no-answer',     'No answer',     '1'],
              ['voicemail',     'Voicemail',     '2'],
              ['not-interested','Not interested','3'],
              ['follow-up',     'Follow-up',     '4'],
              ['interested',    'Interested',    '5'],
              ['meeting',       'Meeting booked','6'],
              ['wrong-number',  'Wrong number',  '7'],
            ] as [Outcome, string, string][]).map(([id, label, key]) => (
              <button
                key={id}
                onClick={() => handleOutcome(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  outcome === id
                    ? id === 'meeting'
                      ? 'bg-[#34E0A1] border-[#34E0A1] text-[#050807]'
                      : id === 'interested'
                      ? 'bg-[#34E0A1]/20 border-[#34E0A1]/50 text-[#34E0A1]'
                      : 'bg-[#121A17] border-[#34E0A1]/30 text-[#34E0A1]'
                    : 'bg-[#121A17] border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2] hover:border-[#34E0A1]/20'
                }`}
              >
                <span>{label}</span>
                <span className="font-mono text-[9px] opacity-50">{key}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Session Setup ────────────────────────────────────────────────────────────

function SessionSetup({ onStart, onCancel }: { onStart: (ch: string) => void; onCancel: () => void }) {
  const [channel, setChannel] = useState('Call');
  const [length, setLength] = useState('1 hr');
  const channels = [
    { label: 'Call', count: 12, color: '#34E0A1' },
    { label: 'Email', count: 8, color: '#60A5FA' },
    { label: 'Instagram DM', count: 3, color: '#F472B6' },
    { label: 'LinkedIn DM', count: 1, color: '#93C5FD' },
  ];
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-lg bg-[#0B1210] border border-[#1D2925] rounded-2xl p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white">Start a Focus session</h2>
          <p className="text-sm text-[#6B7E78] mt-1">Flow will guide you through every lead.</p>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Channel</p>
          <div className="grid grid-cols-2 gap-2">
            {channels.map(({ label, count, color }) => (
              <button key={label} onClick={() => setChannel(label)} className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all ${channel === label ? 'border-[#34E0A1]/50 bg-[#34E0A1]/10 text-white' : 'border-[#1D2925] bg-[#121A17] text-[#B8C9C2] hover:text-white'}`}>
                <span>{label}</span><span className="font-bold" style={{ color }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Session length</p>
          <div className="flex gap-2">
            {['30 min', '1 hr', '2 hr', 'Until empty'].map(opt => (
              <button key={opt} onClick={() => setLength(opt)} className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-all ${length === opt ? 'border-[#34E0A1]/50 bg-[#34E0A1]/10 text-[#34E0A1]' : 'border-[#1D2925] bg-[#121A17] text-[#6B7E78] hover:text-[#B8C9C2]'}`}>{opt}</button>
            ))}
          </div>
        </div>
        <div className="bg-[#34E0A1]/5 border border-[#34E0A1]/20 rounded-xl p-4">
          <p className="text-[10px] text-[#34E0A1] uppercase tracking-widest mb-1">Flow's goal</p>
          <p className="text-sm text-white font-medium">15 calls · 3 conversations · 1 meeting</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => onStart(channel)} className="flex-1 bg-[#34E0A1] text-[#050807] font-semibold py-3 rounded-xl hover:bg-[#20B982] transition-colors">Start session</button>
          <button onClick={onCancel} className="px-5 py-3 border border-[#1D2925] text-[#6B7E78] rounded-xl hover:text-[#B8C9C2] transition-colors text-sm">Cancel</button>
        </div>
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

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34E0A1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6A16 16 0 0 0 16 16.69l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

// Export objections for the Team "What's working" view
export { objections };
export type { Objection, ResponseRecord };
