import { useState, useEffect } from 'react';
import { runningLeadGenJobs } from '../data/sample';

export function LeadGeneration() {
  const [showModal, setShowModal] = useState(false);
  const [job, setJob] = useState(runningLeadGenJobs[0]);
  const [liveFeed, setLiveFeed] = useState([
    { id: 1, name: 'Suncoast Vacation Rentals', city: 'Orlando', score: 91, channels: ['phone', 'email', 'instagram'], reason: 'Manages ~50 listings, mentions Guesty, Instagram active' },
    { id: 2, name: 'Palmetto Stays Group', city: 'Orlando', score: 78, channels: ['phone', 'email'], reason: 'Professional ops team, ~30 listings, active website' },
    { id: 3, name: 'Central FL Property Mgmt', city: 'Kissimmee', score: 85, channels: ['phone', 'email', 'linkedin'], reason: '~45 listings, LLC property manager title, Guesty mention found' },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setJob(j => ({
        ...j,
        found: Math.min(j.found + Math.floor(Math.random() * 3), 100),
        enriched: Math.min(j.enriched + Math.floor(Math.random() * 2), 100),
        matched: Math.min(j.matched + 1, 60),
        ready: Math.min(j.ready + 1, 50),
        aiCost: +(j.aiCost + 0.03).toFixed(2),
      }));

      if (Math.random() > 0.6) {
        const names = ['Gulf Wave Hosts', 'Beachside PM Group', 'Orlando Getaway Mgmt', 'Sunshine STR Co', 'Coastal Nest Properties'];
        const cities = ['Orlando', 'Tampa', 'Miami', 'Clearwater', 'Fort Lauderdale'];
        setLiveFeed(f => [{
          id: Date.now(),
          name: names[Math.floor(Math.random() * names.length)],
          city: cities[Math.floor(Math.random() * cities.length)],
          score: 50 + Math.floor(Math.random() * 45),
          channels: ['phone', 'email'].concat(Math.random() > 0.5 ? ['instagram'] : []),
          reason: 'Found via Google search, website has property listings, contact info extracted',
        }, ...f.slice(0, 9)]);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const stages = [
    { label: 'Found', count: job.found },
    { label: 'Enriched', count: job.enriched },
    { label: 'Matched ICP', count: job.matched },
    { label: 'Deduped', count: job.deduped },
    { label: 'Ready', count: job.ready },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 py-5 border-b border-[#1D2925] flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Lead Generation</h1>
          <p className="text-sm text-[#6B7E78] mt-0.5">AI scrapes and scores leads from Google in real time. Runs start automatically when a campaign has fewer than 50 leads ready.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-[#34E0A1] text-[#050807] font-semibold px-4 py-2 rounded-xl hover:bg-[#20B982] transition-colors text-sm">
          + New run
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Active run card */}
        <div className="bg-[#0B1210] border border-[#34E0A1]/20 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#34E0A1] animate-pulse" />
                <span className="text-xs font-mono text-[#34E0A1] uppercase tracking-widest">Running</span>
                {job.autoRun && (
                  <span className="text-[10px] font-bold bg-[#6B7E78]/15 text-[#6B7E78] border border-[#6B7E78]/20 rounded px-1.5 py-0.5 uppercase tracking-wide">Auto</span>
                )}
              </div>
              <h2 className="font-semibold text-white">{job.campaign}</h2>
              <p className="text-sm text-[#6B7E78]">{job.icp}</p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-xs text-[#6B7E78]">Started {Math.floor((Date.now() - job.startedAt.getTime()) / 60000)}m ago</p>
              <p className="text-xs text-[#6B7E78]">ETA ~{job.etaMinutes}m · <span className="text-[#F59E0B]">${job.aiCost} used</span></p>
            </div>
          </div>

          {/* Stage strip */}
          <div className="flex items-center gap-0">
            {stages.map((s, i) => (
              <div key={s.label} className="flex items-center flex-1">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#6B7E78] uppercase tracking-widest">{s.label}</span>
                    <span className="text-sm font-bold text-white">{s.count}</span>
                  </div>
                  <div className="h-1 bg-[#1D2925] rounded-full overflow-hidden">
                    <div className="h-full bg-[#34E0A1] rounded-full transition-all duration-500" style={{ width: `${(s.count / 100) * 100}%` }} />
                  </div>
                </div>
                {i < stages.length - 1 && <div className="w-4 shrink-0" />}
              </div>
            ))}
          </div>

          {/* Flow narration */}
          <div className="flex items-start gap-3 bg-[#34E0A1]/5 border border-[#34E0A1]/15 rounded-xl p-3">
            <span className="text-base shrink-0">◆</span>
            <p className="text-sm text-[#B8C9C2]">{job.flowNarration}</p>
          </div>

          <div className="text-xs text-[#6B7E78] font-mono">📍 {job.location}</div>

          <div className="flex gap-2">
            <button className="text-xs border border-[#1D2925] text-[#6B7E78] px-3 py-1.5 rounded-lg hover:text-[#B8C9C2] transition-colors">Pause</button>
            <button className="text-xs border border-[#F87171]/30 text-[#F87171] px-3 py-1.5 rounded-lg hover:bg-[#F87171]/10 transition-colors">Stop</button>
            <button className="ml-auto text-xs bg-[#34E0A1]/10 text-[#34E0A1] border border-[#34E0A1]/30 px-3 py-1.5 rounded-lg hover:bg-[#34E0A1]/20 transition-colors">
              Review {job.ready} leads →
            </button>
          </div>
        </div>

        {/* Live feed */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-widest">Live feed</h2>
          <div className="space-y-2">
            {liveFeed.map((lead, i) => (
              <div
                key={lead.id}
                className="flex items-center gap-4 bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 animate-lead-appear"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{lead.name}</span>
                    <span className="text-xs text-[#6B7E78] shrink-0">{lead.city}</span>
                  </div>
                  <p className="text-xs text-[#6B7E78] mt-0.5 truncate">{lead.reason}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex gap-1">
                    {lead.channels.includes('phone') && <span title="Phone" className="w-5 h-5 rounded-full bg-[#1D2925] flex items-center justify-center text-[9px] text-[#34E0A1]">📞</span>}
                    {lead.channels.includes('email') && <span title="Email" className="w-5 h-5 rounded-full bg-[#1D2925] flex items-center justify-center text-[9px] text-[#60A5FA]">✉</span>}
                    {lead.channels.includes('instagram') && <span title="Instagram" className="w-5 h-5 rounded-full bg-[#1D2925] flex items-center justify-center text-[9px] text-[#F472B6]">📸</span>}
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lead.score >= 80 ? 'bg-[#34E0A1]/10 text-[#34E0A1]' : lead.score >= 60 ? 'bg-[#F59E0B]/10 text-[#F59E0B]' : 'bg-[#1D2925] text-[#6B7E78]'}`}>
                    {lead.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New run modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0B1210] border border-[#1D2925] rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">New run</h2>
              <button onClick={() => setShowModal(false)} className="text-[#6B7E78] hover:text-white transition-colors">✕</button>
            </div>
            {[
              { label: 'Campaign', type: 'select', opts: ['HostCo — Florida STR Managers', 'ReceptAI — Hotel Front Desks'] },
              { label: 'ICP', type: 'select', opts: ['Mid-size STR managers', 'Small STR managers'] },
            ].map(({ label, opts }) => (
              <div key={label} className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">{label}</label>
                <select className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#34E0A1]/50 appearance-none">
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Max leads</label>
                <input type="number" defaultValue={100} className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#34E0A1]/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Min fit score</label>
                <input type="number" defaultValue={50} className="w-full bg-[#121A17] border border-[#1D2925] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#34E0A1]/50" />
              </div>
            </div>
            <div className="bg-[#121A17] border border-[#1D2925] rounded-xl p-3 flex items-center justify-between">
              <span className="text-xs text-[#6B7E78]">Estimated time: ~40 min · Cost: ~$2.50</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 bg-[#34E0A1] text-[#050807] font-semibold py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">
                Start run
              </button>
              <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border border-[#1D2925] text-[#6B7E78] rounded-xl hover:text-[#B8C9C2] transition-colors text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
