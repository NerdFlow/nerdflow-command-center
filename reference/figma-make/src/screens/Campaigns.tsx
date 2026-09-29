import { useState, useEffect } from 'react';
import { campaigns, products as initialProducts } from '../data/sample';
import type { Product } from '../data/sample';
import { ProductForm } from '../components/ProductForm';

type WizardStep = 'brief' | 'research' | 'icp' | 'playbook';

const researchSteps = [
  { label: 'Sizing the market', duration: 800 },
  { label: 'Finding who buys', duration: 700 },
  { label: 'Reading reviews and forums', duration: 900 },
  { label: 'Checking competitors', duration: 700 },
  { label: 'Writing summary', duration: 600 },
];

function useResearchAnimation(running: boolean) {
  const [stepsDone, setStepsDone] = useState(0);
  useEffect(() => {
    if (!running) { setStepsDone(0); return; }
    let idx = 0;
    function tick() {
      if (idx >= researchSteps.length) return;
      const delay = researchSteps[idx].duration;
      setTimeout(() => { setStepsDone(i => i + 1); idx++; tick(); }, delay);
    }
    tick();
  }, [running]);
  return stepsDone;
}

export function Campaigns() {
  const [view, setView] = useState<'list' | 'wizard'>('list');
  const [step, setStep] = useState<WizardStep>('brief');
  const [researchRunning, setResearchRunning] = useState(false);
  const [researchDone, setResearchDone] = useState(false);
  const [productList, setProductList] = useState<Product[]>(initialProducts);
  const [brief, setBrief] = useState({ name: '', product: 'HostCo', market: '', goal: 'Book demo', target: '300' });
  const [geoChips, setGeoChips] = useState<string[]>(['Florida', 'Orlando', 'Miami', 'Tampa']);
  const [geoInput, setGeoInput] = useState('');
  const [addProductOpen, setAddProductOpen] = useState(false);

  const stepsDone = useResearchAnimation(researchRunning);

  useEffect(() => {
    if (researchRunning && stepsDone >= researchSteps.length) {
      setTimeout(() => { setResearchRunning(false); setResearchDone(true); }, 400);
    }
  }, [stepsDone, researchRunning]);

  const steps: WizardStep[] = ['brief', 'research', 'icp', 'playbook'];
  const stepIdx = steps.indexOf(step);

  function addGeo(val: string) {
    const trimmed = val.trim();
    if (trimmed && !geoChips.includes(trimmed)) setGeoChips(c => [...c, trimmed]);
    setGeoInput('');
  }

  if (view === 'wizard') {
    return (
      <div className="flex-1 flex overflow-hidden relative">
      {/* Add product side panel */}
      {addProductOpen && (
        <div className="absolute inset-0 flex z-30">
          <div className="flex-1 bg-black/40" onClick={() => setAddProductOpen(false)} />
          <div className="w-[480px] bg-[#0B1210] border-l border-[#1D2925] flex flex-col overflow-hidden animate-slide-in-right">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1D2925] shrink-0">
              <h3 className="text-sm font-semibold text-white">Add product</h3>
              <button onClick={() => setAddProductOpen(false)} className="text-[#6B7E78] hover:text-[#B8C9C2] transition-colors text-lg leading-none">x</button>
            </div>
            <ProductForm
              isPanel
              onSave={p => {
                setProductList(prev => [...prev, p]);
                setBrief(b => ({ ...b, product: p.name }));
                setAddProductOpen(false);
              }}
              onCancel={() => setAddProductOpen(false)}
            />
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto w-full space-y-8">
        {/* Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">New campaign</h1>
            <button onClick={() => { setView('list'); setStep('brief'); setResearchDone(false); setResearchRunning(false); }} className="text-sm text-[#6B7E78] hover:text-[#B8C9C2] transition-colors">
              Back to campaigns
            </button>
          </div>
          <div className="flex items-center gap-0">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                <button
                  onClick={() => (i <= stepIdx || researchDone) ? setStep(s) : null}
                  className={`flex items-center gap-2 text-xs font-medium transition-colors ${i <= stepIdx ? 'text-[#34E0A1]' : 'text-[#6B7E78]'}`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${i < stepIdx ? 'bg-[#34E0A1] border-[#34E0A1] text-[#050807]' : i === stepIdx ? 'border-[#34E0A1] text-[#34E0A1]' : 'border-[#1D2925] text-[#6B7E78]'}`}>
                    {i < stepIdx ? '✓' : i + 1}
                  </span>
                  <span className="capitalize">{s}</span>
                </button>
                {i < steps.length - 1 && <div className={`flex-1 h-px mx-3 ${i < stepIdx ? 'bg-[#34E0A1]' : 'bg-[#1D2925]'}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Brief */}
        {step === 'brief' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Campaign name</label>
                <input value={brief.name} onChange={e => setBrief(b => ({ ...b, name: e.target.value }))} placeholder="HostCo -- Florida STR managers" className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6B7E78] focus:outline-none focus:border-[#34E0A1]/50 transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Product</label>
                <select
                  value={brief.product}
                  onChange={e => {
                    if (e.target.value === '__add__') { setAddProductOpen(true); }
                    else { setBrief(b => ({ ...b, product: e.target.value })); }
                  }}
                  className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#34E0A1]/50 transition-colors appearance-none"
                >
                  {productList.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  <option value="__add__">+ Add product...</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Goal</label>
                <select value={brief.goal} onChange={e => setBrief(b => ({ ...b, goal: e.target.value }))} className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#34E0A1]/50 transition-colors appearance-none">
                  <option>Book demo</option><option>Free trial</option><option>Reply</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Target market</label>
                <textarea value={brief.market} onChange={e => setBrief(b => ({ ...b, market: e.target.value }))} placeholder="Short-term rental property managers in Florida using Guesty" rows={3} className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6B7E78] resize-none focus:outline-none focus:border-[#34E0A1]/50 transition-colors" />
              </div>

              {/* Geography */}
              <div className="col-span-2 space-y-2">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Geography</label>
                <div className="flex flex-wrap gap-2">
                  {geoChips.map(chip => (
                    <span key={chip} className="flex items-center gap-1.5 text-xs bg-[#34E0A1]/10 text-[#34E0A1] border border-[#34E0A1]/20 rounded-full px-2.5 py-1">
                      {chip}
                      <button onClick={() => setGeoChips(c => c.filter(x => x !== chip))} className="text-[#34E0A1]/60 hover:text-[#34E0A1] transition-colors leading-none">×</button>
                    </span>
                  ))}
                  <input
                    value={geoInput}
                    onChange={e => setGeoInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addGeo(geoInput); } }}
                    placeholder="Add city or state..."
                    className="bg-[#0B1210] border border-[#1D2925] rounded-full px-3 py-1 text-xs text-white placeholder-[#6B7E78] focus:outline-none focus:border-[#34E0A1]/50 transition-colors"
                  />
                </div>
                <p className="text-[10px] text-[#6B7E78]">Press Enter to add. Include country, state, or specific cities.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Lead target</label>
                <input value={brief.target} onChange={e => setBrief(b => ({ ...b, target: e.target.value }))} type="number" className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#34E0A1]/50 transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Channels</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['Call', 'Email', 'Instagram', 'LinkedIn'].map(ch => (
                    <span key={ch} className="text-xs bg-[#34E0A1]/10 text-[#34E0A1] border border-[#34E0A1]/20 rounded-full px-3 py-1 cursor-pointer hover:bg-[#34E0A1]/20 transition-colors">{ch}</span>
                  ))}
                </div>
              </div>
              <div className="col-span-2 space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">Anything Flow should know</label>
                <textarea placeholder="We charge per listing; strong in after-hours guest messaging" rows={2} className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white placeholder-[#6B7E78] resize-none focus:outline-none focus:border-[#34E0A1]/50 transition-colors" />
              </div>
            </div>
            <button onClick={() => { setStep('research'); setResearchRunning(true); }} className="bg-[#34E0A1] text-[#050807] font-semibold px-6 py-3 rounded-xl hover:bg-[#20B982] transition-colors text-sm">
              Let Flow research this
            </button>
          </div>
        )}

        {/* Research */}
        {step === 'research' && (
          <div className="space-y-5">
            {!researchDone ? (
              <div className="bg-[#0B1210] border border-[#1D2925] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[#34E0A1]/10 border border-[#34E0A1]/30 flex items-center justify-center animate-flow-pulse">
                    <GlassesIcon size={12} />
                  </div>
                  <span className="text-sm text-[#B8C9C2]">Flow is researching the market...</span>
                </div>
                {researchSteps.map((s, i) => (
                  <div key={s.label} className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${i < stepsDone ? 'border-[#34E0A1] bg-[#34E0A1]' : 'border-[#1D2925]'}`}>
                      {i < stepsDone && <span className="text-[8px] text-[#050807] font-bold">✓</span>}
                      {i === stepsDone && <span className="w-1.5 h-1.5 rounded-full bg-[#34E0A1] animate-pulse" />}
                    </div>
                    <span className={`text-sm transition-colors ${i < stepsDone ? 'text-[#34E0A1]' : i === stepsDone ? 'text-white' : 'text-[#6B7E78]'}`}>{s.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4 animate-fade-up">
                {[
                  { title: 'Market snapshot', content: 'Florida has ~8,400 active STR management companies. Market grew 23% in 2025. Top players include Vacasa, Evolve, and local co-hosts with 10-200 listings.', source: 'AirDNA Market Report 2025' },
                  { title: 'Who buys and why', content: 'Owner-operators with 15-80 listings tired of picking up guest calls. They want 24/7 coverage without hiring a night team. Decision made by founder or ops manager.', source: 'Linkedin Sales Nav data, 120 profiles' },
                  { title: 'Top 5 pain points', content: '"Guests call me at 2am about the WiFi." "We lose bookings because we respond slow." "I can\'t afford a night manager." "Our reviews mention slow response." "Guest emergencies stress me out."', source: 'Reddit r/airbnb, Trustpilot, G2 reviews' },
                  { title: 'Competitors & how we differ', content: 'Superhog (insurance-focused, no messaging). Hostfully (PMS, no live support). NoiseAware (hardware, not communication). We are the only tool that resolves guest issues end-to-end, not just routes them.', source: 'Competitor websites, G2 comparisons' },
                  { title: '3 angles to try', content: '1. "No more 2am calls" -- lead with the personal cost. 2. "Your Guesty, but with a night manager" -- for Guesty users. 3. "One bad review costs more than a year of HostCo" -- ROI angle.', source: 'Based on ICP pain points above' },
                ].map(({ title, content, source }) => (
                  <div key={title} className="bg-[#0B1210] border border-[#1D2925] rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-white uppercase tracking-wide">{title}</p>
                    <p className="text-sm text-[#B8C9C2] leading-relaxed">{content}</p>
                    <p className="text-[10px] text-[#34E0A1] font-mono">Source: {source}</p>
                  </div>
                ))}
                <div className="flex gap-3">
                  <button onClick={() => setStep('icp')} className="bg-[#34E0A1] text-[#050807] font-semibold px-5 py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">Approve research</button>
                  <button className="border border-[#1D2925] text-[#6B7E78] px-5 py-2.5 rounded-xl hover:text-[#B8C9C2] transition-colors text-sm">Ask Flow a follow-up</button>
                  <button onClick={() => { setResearchDone(false); setResearchRunning(true); }} className="border border-[#1D2925] text-[#6B7E78] px-5 py-2.5 rounded-xl hover:text-[#B8C9C2] transition-colors text-sm">Redo</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ICP */}
        {step === 'icp' && (
          <div className="space-y-5">
            <p className="text-sm text-[#6B7E78]">Flow built this ICP from the research. Edit any field before approving.</p>
            {[
              { label: 'Business type', value: 'Vacation rental management company' },
              { label: 'Search keywords', value: 'vacation rental management, Airbnb management, STR co-host' },
              { label: 'Size signals', value: '10-200 listings; 3-50 staff' },
              { label: 'Must-have signals', value: 'Has website; lists properties; operates in target city' },
              { label: 'Disqualifiers', value: 'Single-owner host; hotel chain; franchise HQ' },
              { label: 'Decision-maker titles', value: 'Owner, Founder, Operations Manager' },
            ].map(({ label, value }) => (
              <div key={label} className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">{label}</label>
                <input defaultValue={value} className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#34E0A1]/50 transition-colors" />
              </div>
            ))}
            <div className="flex gap-3">
              <button onClick={() => setStep('playbook')} className="bg-[#34E0A1] text-[#050807] font-semibold px-5 py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">Approve ICP</button>
              <button className="border border-[#1D2925] text-[#6B7E78] px-5 py-2.5 rounded-xl hover:text-[#B8C9C2] transition-colors text-sm">Save as reusable ICP</button>
            </div>
          </div>
        )}

        {/* Playbook */}
        {step === 'playbook' && (
          <div className="space-y-5">
            <div className="bg-[#34E0A1]/5 border border-[#34E0A1]/20 rounded-xl p-4">
              <p className="text-xs text-[#34E0A1] font-medium mb-1">Flow wrote this playbook. All sections are editable.</p>
            </div>
            {[
              { title: 'Call opener', content: '"Hi [first name], I noticed [Business] manages properties in [City]. We work with managers there who struggle with after-hours guest issues -- built something that handles it without hiring staff. Worth 10 minutes?"' },
              { title: 'Cadence', content: 'Day 1: Call. Day 2: Email. Day 4: Instagram DM. Day 7: Call again. Day 10: Final email. Stop after 5 touches with no reply.' },
              { title: 'Top objections', content: '"Too expensive" -- show per-listing cost vs one missed guest refund.\n"Already have a tool" -- ask what happens at 2am.\n"Not interested" -- ask what\'s working now.' },
            ].map(({ title, content }) => (
              <div key={title} className="space-y-1.5">
                <label className="text-[11px] text-[#6B7E78] uppercase tracking-widest">{title}</label>
                <textarea defaultValue={content} rows={4} className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:border-[#34E0A1]/50 transition-colors" />
              </div>
            ))}
            <button onClick={() => setView('list')} className="bg-[#34E0A1] text-[#050807] font-semibold px-5 py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">
              Go live
            </button>
          </div>
        )}
      </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Campaigns</h1>
        <button onClick={() => setView('wizard')} className="bg-[#34E0A1] text-[#050807] font-semibold px-4 py-2 rounded-xl hover:bg-[#20B982] transition-colors text-sm">
          + New campaign
        </button>
      </div>
      <div className="space-y-3">
        {campaigns.map(c => (
          <div key={c.id} className="bg-[#0B1210] border border-[#1D2925] rounded-2xl p-5 hover:border-[#34E0A1]/20 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-white">{c.name}</h2>
                <p className="text-sm text-[#6B7E78] mt-0.5">{c.product} · {c.geography} · {c.goal}</p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c.status === 'live' ? 'bg-[#34E0A1]/10 text-[#34E0A1]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>
                {c.status}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[{ label: 'Leads', value: c.leads, max: c.leadTarget }, { label: 'Touched', value: c.touched }, { label: 'Replies', value: c.replies }, { label: 'Meetings', value: c.meetings }].map(({ label, value, max }) => (
                <div key={label}>
                  <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">{label}</p>
                  <p className="text-lg font-bold text-white mt-0.5">{value}{max ? <span className="text-xs text-[#6B7E78] font-normal">/{max}</span> : ''}</p>
                </div>
              ))}
            </div>
            {c.leads > 0 && <div className="mt-4 h-1 bg-[#1D2925] rounded-full overflow-hidden"><div className="h-full bg-[#34E0A1] rounded-full" style={{ width: `${(c.leads / c.leadTarget) * 100}%` }} /></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GlassesIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="7" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <circle cx="17" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <path d="M3 14C3 10 5 7 7 6M21 14C21 10 19 7 17 6M11 14h2" stroke="#34E0A1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
