import { loggedReplies, awaitingReply, currentUser } from '../data/sample';

function ProgressRing({ value, max, label, color = '#34E0A1' }: { value: number; max: number; label: string; color?: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(value / max, 1);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} stroke="#1D2925" strokeWidth="4" fill="none" />
          <circle cx="36" cy="36" r={r} stroke={color} strokeWidth="4" fill="none"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '36px 36px', transition: 'stroke-dasharray 0.6s ease-out' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold text-white">{value}</span>
          <span className="text-[9px] text-[#6B7E78] font-mono">/{max}</span>
        </div>
      </div>
      <span className="text-[11px] text-[#6B7E78] font-medium">{label}</span>
    </div>
  );
}

interface TodayProps {
  onStartFocus: () => void;
  onReplies: () => void;
}

export function Today({ onStartFocus, onReplies }: TodayProps) {
  const openReplies = loggedReplies.filter(r => r.status === 'open');
  const replyCount = openReplies.length;
  const awaitingCount = awaitingReply.length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';

  const channels = [
    { label: 'Call', count: 12, color: '#34E0A1' },
    { label: 'Email', count: 8, color: '#60A5FA' },
    { label: 'Instagram', count: 3, color: '#F472B6' },
    { label: 'LinkedIn', count: 1, color: '#93C5FD' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
      {/* Flow greeting */}
      <div className="bg-[#0B1210] border border-[#1D2925] rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-[#34E0A1]/10 border border-[#34E0A1]/30 flex items-center justify-center shrink-0 mt-0.5">
            <GlassesIcon />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-[#34E0A1] font-mono uppercase tracking-widest">Flow · {greeting}</p>
            <p className="text-xl font-semibold text-white leading-snug">
              {greeting}, {currentUser.name}. 24 leads are ready, {replyCount} {replyCount === 1 ? 'person' : 'people'} replied overnight, and you're 2 calls from beating yesterday. Start with replies.
            </p>
          </div>
        </div>
        <div className="flex gap-3 pl-14">
          <button onClick={onStartFocus} className="bg-[#34E0A1] text-[#050807] font-semibold px-5 py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">
            Start a Focus session
          </button>
        </div>
      </div>

      {/* Replies card -- only shown when there are replies */}
      {(replyCount > 0 || awaitingCount > 0) && (
        <button
          onClick={onReplies}
          className="w-full text-left bg-[#0B1210] border border-[#1D2925] rounded-2xl p-5 hover:border-[#34E0A1]/20 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {replyCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#F87171]" />
                  <span className="text-lg font-bold text-white">{replyCount}</span>
                  <span className="text-sm text-[#B8C9C2]">{replyCount === 1 ? 'replied' : 'replied'}</span>
                </div>
              )}
              {replyCount > 0 && awaitingCount > 0 && <span className="text-[#1D2925]">·</span>}
              {awaitingCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">{awaitingCount}</span>
                  <span className="text-sm text-[#B8C9C2]">waiting</span>
                </div>
              )}
            </div>
            <span className="text-xs text-[#34E0A1] group-hover:translate-x-0.5 transition-transform">Check your inboxes →</span>
          </div>
          <p className="text-sm text-[#6B7E78] mt-2">Check your inboxes -- takes 2 minutes. Mark who replied.</p>
        </button>
      )}

      {/* Targets */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-widest">Today's targets</h2>
          <div className="flex items-center gap-1.5">
            <span className="text-base">🔥</span>
            <span className="text-sm font-bold text-[#F59E0B]">{currentUser.streak}-day streak</span>
          </div>
        </div>
        <div className="bg-[#0B1210] border border-[#1D2925] rounded-2xl p-6 flex justify-around">
          <ProgressRing value={13} max={20} label="Calls" />
          <ProgressRing value={7} max={15} label="Emails" color="#60A5FA" />
          <ProgressRing value={3} max={8} label="DMs" color="#F472B6" />
          <ProgressRing value={5} max={8} label="Conversations" color="#F59E0B" />
        </div>
      </div>

      {/* Ready now */}
      <div>
        <h2 className="text-sm font-semibold text-white uppercase tracking-widest mb-4">Ready now</h2>
        <div className="flex flex-wrap gap-3">
          {channels.map(({ label, count, color }) => (
            <button key={label} onClick={onStartFocus} className="flex items-center gap-2.5 bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 hover:border-[#34E0A1]/30 transition-all group">
              <span className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-sm font-medium text-[#B8C9C2] group-hover:text-white transition-colors">{label}</span>
              <span className="text-sm font-bold ml-1" style={{ color }}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Wins strip */}
      <div>
        <h2 className="text-sm font-semibold text-white uppercase tracking-widest mb-4">Yesterday's wins</h2>
        <div className="space-y-2">
          {[
            { user: 'Hadi', win: 'Booked a demo with a 60-listing PM in Miami.', emoji: '🎯' },
            { user: 'You', win: 'Had 3 conversations and moved TropicStay to demo stage.', emoji: '⚡' },
            { user: 'Zara', win: 'Approved 86 leads from the Orlando scraping run.', emoji: '✅' },
          ].map(({ user, win, emoji }) => (
            <div key={user} className="flex items-start gap-3 bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3">
              <span className="text-base mt-0.5">{emoji}</span>
              <p className="text-sm text-[#B8C9C2]"><span className="text-white font-medium">{user}</span> -- {win}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Leads in queue', value: '24', sub: 'across 2 campaigns' },
          { label: 'Open replies', value: String(replyCount), sub: replyCount > 0 ? '1 from 31 hrs ago' : 'All caught up', urgent: replyCount > 0 },
          { label: 'Active deals', value: '2', sub: 'TropicStay is stale' },
        ].map(({ label, value, sub, urgent }) => (
          <div key={label} className={`bg-[#0B1210] border rounded-xl p-4 ${urgent ? 'border-[#F87171]/20' : 'border-[#1D2925]'}`}>
            <p className="text-[11px] text-[#6B7E78] uppercase tracking-widest">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${urgent ? 'text-[#F87171]' : 'text-white'}`}>{value}</p>
            <p className="text-[11px] text-[#6B7E78] mt-1">{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GlassesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="7" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <circle cx="17" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <path d="M3 14C3 10 5 7 7 6M21 14C21 10 19 7 17 6M11 14h2" stroke="#34E0A1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
