import { useState } from 'react';
import { teamMembers, currentUser } from '../data/sample';
import { objections } from './FocusMode';
import type { ResponseRecord } from './FocusMode';

// Sample track-record data for "What's working" — seeded per response id
const trackData: Record<string, { used: number; won: number; lastUsed: string; campaign: string }> = {
  te1: { used: 11, won: 8,  lastUsed: 'Today',      campaign: 'HostCo' },
  te2: { used: 9,  won: 2,  lastUsed: 'Yesterday',  campaign: 'HostCo' },
  te3: { used: 3,  won: 2,  lastUsed: '2 days ago', campaign: 'HostCo' },
  at1: { used: 14, won: 9,  lastUsed: 'Today',      campaign: 'HostCo' },
  at2: { used: 6,  won: 3,  lastUsed: '3 days ago', campaign: 'HostCo' },
  em1: { used: 8,  won: 3,  lastUsed: 'Yesterday',  campaign: 'HostCo' },
  em2: { used: 4,  won: 2,  lastUsed: '4 days ago', campaign: 'HostCo' },
  nd1: { used: 11, won: 6,  lastUsed: 'Today',      campaign: 'HostCo' },
  bt1: { used: 16, won: 10, lastUsed: 'Today',      campaign: 'HostCo' },
  ni1: { used: 7,  won: 2,  lastUsed: '2 days ago', campaign: 'HostCo' },
};

function badgeColor(used: number, won: number): string {
  if (used < 10) return '#6B7E78';
  const rate = won / used;
  if (rate >= 0.6) return '#34E0A1';
  if (rate >= 0.3) return '#F59E0B';
  return '#F87171';
}

function RateBar({ used, won }: { used: number; won: number }) {
  const pct = used === 0 ? 0 : Math.round((won / used) * 100);
  const color = badgeColor(used, won);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-[#1D2925] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono" style={{ color }}>{pct}%</span>
    </div>
  );
}

function ResponseRow({ resp, track, onRetire }: { resp: ResponseRecord; track: typeof trackData[string] | undefined; onRetire: () => void }) {
  if (!track) return null;
  const { used, won, lastUsed } = track;
  const color = badgeColor(used, won);
  const label = used < 10 ? 'New' : `${won}/${used}`;
  const isWeak = used >= 10 && won / used < 0.3;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[#1D2925] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#B8C9C2] leading-relaxed">"{resp.text}"</p>
        <p className="text-[10px] text-[#6B7E78] mt-1">Last used {lastUsed}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-2 min-w-[120px]">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold font-mono" style={{ color }}>{label}</span>
          {resp.isTesting && (
            <span className="text-[9px] bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 rounded px-1.5 py-0.5 uppercase font-bold">Testing</span>
          )}
        </div>
        <RateBar used={used} won={won} />
        {isWeak && (
          <button onClick={onRetire} className="text-[10px] text-[#F87171] border border-[#F87171]/20 rounded px-2 py-0.5 hover:bg-[#F87171]/10 transition-colors">
            Retire?
          </button>
        )}
      </div>
    </div>
  );
}

type TeamTab = 'scoreboard' | 'whats-working';

export function Team() {
  const [tab, setTab] = useState<TeamTab>('scoreboard');
  const [campaignFilter, setCampaignFilter] = useState('All');
  const [retired, setRetired] = useState<Set<string>>(new Set());
  const isLead = (currentUser.role as string) === 'lead';

  const cols = ['Rep', 'Calls', 'Emails', 'DMs', 'Convos', 'Meetings', 'Deals', 'Streak', 'Target'];

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Team</h1>
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-[#0B1210] border border-[#1D2925] rounded-xl p-1">
          <button
            onClick={() => setTab('scoreboard')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${tab === 'scoreboard' ? 'bg-[#34E0A1]/10 text-[#34E0A1]' : 'text-[#6B7E78] hover:text-[#B8C9C2]'}`}
          >
            Scoreboard
          </button>
          <button
            onClick={() => setTab('whats-working')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${tab === 'whats-working' ? 'bg-[#34E0A1]/10 text-[#34E0A1]' : 'text-[#6B7E78] hover:text-[#B8C9C2]'}`}
          >
            What&apos;s working
            {!isLead && <span className="text-[9px] opacity-60">(Lead)</span>}
          </button>
        </div>
      </div>

      {tab === 'scoreboard' && (
        <>
          <div className="bg-[#0B1210] border border-[#1D2925] rounded-2xl overflow-hidden">
            <div className="grid grid-cols-9 px-5 py-3 border-b border-[#1D2925]">
              {cols.map(c => (
                <span key={c} className="text-[10px] text-[#6B7E78] uppercase tracking-widest font-medium">{c}</span>
              ))}
            </div>
            {teamMembers.map((m, i) => (
              <div key={m.id} className={`grid grid-cols-9 px-5 py-4 items-center hover:bg-[#121A17] transition-colors ${i < teamMembers.length - 1 ? 'border-b border-[#1D2925]' : ''}`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#34E0A1]/10 border border-[#34E0A1]/20 flex items-center justify-center text-[10px] font-bold text-[#34E0A1]">
                    {m.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{m.name.split(' ')[0]}</p>
                    <p className="text-[10px] text-[#6B7E78] capitalize">{m.role}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-white">{m.calls}</span>
                <span className="text-sm font-semibold text-white">{m.emails}</span>
                <span className="text-sm font-semibold text-white">{m.dms}</span>
                <span className="text-sm font-semibold text-white">{m.conversations}</span>
                <span className="text-sm font-semibold text-white">{m.meetings}</span>
                <span className="text-sm font-semibold text-white">{m.deals}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm">🔥</span>
                  <span className="text-sm font-bold text-[#F59E0B]">{m.streak}</span>
                </div>
                <div className="pr-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-white">{m.targetPct}%</span>
                  </div>
                  <div className="h-1.5 bg-[#1D2925] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${m.targetPct}%`, background: m.targetPct >= 80 ? '#34E0A1' : m.targetPct >= 50 ? '#F59E0B' : '#F87171' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Team calls this week', value: '45', delta: '+12 vs last week' },
              { label: 'Meetings booked', value: '7', delta: '2 from new leads' },
              { label: 'Best streak', value: '12 days', sub: 'Hadi Nazari' },
            ].map(({ label, value, delta, sub }) => (
              <div key={label} className="bg-[#0B1210] border border-[#1D2925] rounded-xl p-4">
                <p className="text-[11px] text-[#6B7E78] uppercase tracking-widest">{label}</p>
                <p className="text-2xl font-bold text-white mt-1">{value}</p>
                <p className="text-xs text-[#34E0A1] mt-1">{delta ?? sub}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'whats-working' && (
        <div className="space-y-6">
          {/* Campaign filter */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Campaign</span>
            {['All', 'HostCo', 'ReceptAI'].map(c => (
              <button
                key={c}
                onClick={() => setCampaignFilter(c)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${campaignFilter === c ? 'border-[#34E0A1]/40 bg-[#34E0A1]/10 text-[#34E0A1]' : 'border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2]'}`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px] text-[#6B7E78]">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#34E0A1]" /> 60%+ success</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#F59E0B]" /> 30-59%</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#F87171]" /> Under 30%</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#6B7E78]" /> New (under 10 uses)</span>
          </div>

          {/* Per-objection blocks */}
          {objections.map(obj => {
            const filtered = obj.responses.filter(r => {
              if (retired.has(r.id)) return false;
              const td = trackData[r.id];
              if (!td) return false;
              return campaignFilter === 'All' || td.campaign === campaignFilter;
            });
            if (filtered.length === 0) return null;

            // Sort: best win rate first
            const sorted = [...filtered].sort((a, b) => {
              const ta = trackData[a.id];
              const tb = trackData[b.id];
              if (!ta || !tb) return 0;
              const rateA = ta.used < 10 ? -1 : ta.won / ta.used;
              const rateB = tb.used < 10 ? -1 : tb.won / tb.used;
              return rateB - rateA;
            });

            return (
              <div key={obj.label} className="bg-[#0B1210] border border-[#1D2925] rounded-2xl p-5">
                <p className="text-xs font-bold text-white uppercase tracking-wide mb-1">{obj.label}</p>
                <p className="text-[11px] text-[#6B7E78] mb-4">
                  {sorted.length} response{sorted.length !== 1 ? 's' : ''} · best on top
                </p>
                <div>
                  {sorted.map(resp => (
                    <ResponseRow
                      key={resp.id}
                      resp={resp}
                      track={trackData[resp.id]}
                      onRetire={() => setRetired(prev => new Set([...prev, resp.id]))}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <p className="text-xs text-[#6B7E78] text-center pb-4">
            Success = rep tapped "Kept them talking" or call ended in Interested / Meeting booked.
          </p>
        </div>
      )}
    </div>
  );
}
