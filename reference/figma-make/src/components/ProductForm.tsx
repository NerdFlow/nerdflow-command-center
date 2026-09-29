import { useState } from 'react';
import type { Product, ProductFeature, CaseStudy, Competitor } from '../data/sample';

const PRICING_MODELS = ['Per seat', 'Per listing', 'Flat monthly', 'Custom'];

interface ProductFormProps {
  initial?: Partial<Product>;
  onSave: (p: Product) => void;
  onCancel: () => void;
  isPanel?: boolean; // true = side panel mode (narrower, for campaign wizard)
}

function ChipInput({ chips, onChange, placeholder }: { chips: string[]; onChange: (c: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('');
  function add(val: string) {
    const v = val.trim();
    if (v && !chips.includes(v)) onChange([...chips, v]);
    setInput('');
  }
  return (
    <div className="flex flex-wrap gap-2 p-2.5 bg-[#0B1210] border border-[#1D2925] rounded-xl min-h-[44px] focus-within:border-[#34E0A1]/40 transition-colors">
      {chips.map(c => (
        <span key={c} className="flex items-center gap-1.5 text-xs bg-[#34E0A1]/10 text-[#34E0A1] border border-[#34E0A1]/20 rounded-full px-2.5 py-1">
          {c}
          <button onClick={() => onChange(chips.filter(x => x !== c))} className="text-[#34E0A1]/60 hover:text-[#34E0A1] transition-colors leading-none">x</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input); } }}
        placeholder={placeholder ?? 'Add...'}
        className="bg-transparent text-xs text-white placeholder-[#6B7E78] focus:outline-none min-w-[100px]"
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[#6B7E78] uppercase tracking-widest font-medium">{children}</p>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] text-[#6B7E78] uppercase tracking-widest mb-1.5">{children}</label>;
}

function TextInput({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#6B7E78] focus:outline-none focus:border-[#34E0A1]/40 transition-colors ${className}`}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#6B7E78] resize-none focus:outline-none focus:border-[#34E0A1]/40 transition-colors"
    />
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 pt-2">
      <div className="flex-1 h-px bg-[#1D2925]" />
      <span className="text-xs font-semibold text-[#6B7E78] uppercase tracking-widest shrink-0">{label}</span>
      <div className="flex-1 h-px bg-[#1D2925]" />
    </div>
  );
}

// Flow pitch card shown after save
function FlowPitchCard({ product, onAccept, onRevise }: { product: Product; onAccept: () => void; onRevise: () => void }) {
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const opener = `"Hi [first name], I noticed [Business] ${product.idealCustomer.toLowerCase().includes('hotel') ? 'runs a hotel' : 'manages properties'} in [City]. We work with ${product.idealCustomer.split('.')[0].toLowerCase()} who ${product.features[0]?.problem.toLowerCase() ?? 'struggle with guest communication'}. ${product.name} handles that automatically. Worth 10 minutes?"`;
  const expensive = product.caseStudies[0]
    ? `"Totally fair. ${product.caseStudies[0].customer ? `${product.caseStudies[0].customer} said '${product.caseStudies[0].result.toLowerCase()}' after one month` : `Most managers see results in the first 30 days`}. What would it need to cost to be worth a look?"`
    : `"Most managers your size spend about the same on one missed issue. Can I show you the math in 10 minutes?"`;
  const email = `Subject: [Business] + ${product.name}\n\nHi [first name],\n\n${product.features[0]?.problem ?? 'Guest communication issues'} is one of the most common headaches I hear about from managers like you.\n\n${product.name} handles it automatically -- ${product.features[0]?.feature.toLowerCase() ?? 'so you don\'t have to'}.\n\n${product.priceRange ? `It runs ${product.priceRange} -- most pay less than the cost of one missed issue.` : ''}\n\nWorth a quick look? Here's a 2-min demo: [link]\n\n-- [Name]`;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="bg-[#34E0A1]/5 border border-[#34E0A1]/25 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#34E0A1]/10 border border-[#34E0A1]/30 flex items-center justify-center">
            <GlassesIcon />
          </div>
          <div>
            <p className="text-xs font-mono text-[#34E0A1] uppercase tracking-widest">Flow</p>
            <p className="text-sm font-semibold text-white">Here's how I'd pitch {product.name}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Call opener</p>
            <p className="text-sm text-[#B8C9C2] leading-relaxed bg-[#0B1210] border border-[#1D2925] rounded-xl p-3">{opener}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">"Too expensive" response</p>
            <p className="text-sm text-[#B8C9C2] leading-relaxed bg-[#0B1210] border border-[#1D2925] rounded-xl p-3">{expensive}</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] text-[#6B7E78] uppercase tracking-widest">First email</p>
            <pre className="text-xs text-[#B8C9C2] leading-relaxed bg-[#0B1210] border border-[#1D2925] rounded-xl p-3 whitespace-pre-wrap font-sans">{email}</pre>
          </div>
        </div>

        {!submitted ? (
          <div className="space-y-3">
            {!showFeedback ? (
              <div className="flex gap-3">
                <button onClick={onAccept} className="flex-1 bg-[#34E0A1] text-[#050807] font-semibold py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">
                  Looks right
                </button>
                <button onClick={() => setShowFeedback(true)} className="flex-1 border border-[#1D2925] text-[#6B7E78] py-2.5 rounded-xl hover:text-[#B8C9C2] transition-colors text-sm">
                  Not quite -- tell Flow what's off
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <TextArea
                  value={feedback}
                  onChange={setFeedback}
                  placeholder="e.g. The opener is too salesy. Leads respond better when we lead with the pain, not the product name."
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSubmitted(true); onAccept(); }}
                    className="flex-1 bg-[#34E0A1] text-[#050807] font-semibold py-2 rounded-xl hover:bg-[#20B982] transition-colors text-sm"
                  >
                    Send to Flow
                  </button>
                  <button onClick={() => setShowFeedback(false)} className="px-4 py-2 border border-[#1D2925] text-[#6B7E78] rounded-xl hover:text-[#B8C9C2] transition-colors text-sm">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[#34E0A1] text-center font-medium">Flow will update its pitch next time.</p>
        )}
      </div>
    </div>
  );
}

export function ProductForm({ initial, onSave, onCancel, isPanel = false }: ProductFormProps) {
  const [saved, setSaved] = useState(false);
  const [savedProduct, setSavedProduct] = useState<Product | null>(null);

  // Form state
  const [name, setName] = useState(initial?.name ?? '');
  const [logoInitials, setLogoInitials] = useState(initial?.logoInitials ?? '');
  const [logoColor, setLogoColor] = useState(initial?.logoColor ?? '#34E0A1');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [idealCustomer, setIdealCustomer] = useState(initial?.idealCustomer ?? '');
  const [decisionMakers, setDecisionMakers] = useState<string[]>(initial?.decisionMakers ?? []);
  const [features, setFeatures] = useState<ProductFeature[]>(initial?.features ?? [{ feature: '', problem: '' }]);
  const [pricingModel, setPricingModel] = useState(initial?.pricingModel ?? 'Per listing');
  const [priceRange, setPriceRange] = useState(initial?.priceRange ?? '');
  const [freeTrial, setFreeTrial] = useState(initial?.freeTrial ?? false);
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>(initial?.caseStudies ?? [{ customer: '', result: '', quote: '', okToName: true }]);
  const [competitors, setCompetitors] = useState<Competitor[]>(initial?.competitors ?? [{ name: '', howWeDiffer: '' }]);
  const [knowledgeFiles, setKnowledgeFiles] = useState<string[]>(initial?.knowledgeFiles ?? []);
  const [knowledgePaste, setKnowledgePaste] = useState('');
  const [donts, setDonts] = useState(initial?.donts ?? '');

  function addFeature() { setFeatures(f => [...f, { feature: '', problem: '' }]); }
  function updateFeature(i: number, k: keyof ProductFeature, v: string) { setFeatures(f => f.map((x, j) => j === i ? { ...x, [k]: v } : x)); }
  function removeFeature(i: number) { setFeatures(f => f.filter((_, j) => j !== i)); }

  function addCaseStudy() { setCaseStudies(c => [...c, { customer: '', result: '', quote: '', okToName: true }]); }
  function updateCS(i: number, k: keyof CaseStudy, v: string | boolean) { setCaseStudies(c => c.map((x, j) => j === i ? { ...x, [k]: v } : x)); }
  function removeCS(i: number) { setCaseStudies(c => c.filter((_, j) => j !== i)); }

  function addCompetitor() { setCompetitors(c => [...c, { name: '', howWeDiffer: '' }]); }
  function updateComp(i: number, k: keyof Competitor, v: string) { setCompetitors(c => c.map((x, j) => j === i ? { ...x, [k]: v } : x)); }
  function removeComp(i: number) { setCompetitors(c => c.filter((_, j) => j !== i)); }

  function handleFakeUpload() {
    const names = ['Product_Deck.pdf', 'Pricing_Guide.pdf', 'Case_Studies.pdf', 'FAQ.pdf'];
    const pick = names.find(n => !knowledgeFiles.includes(n)) ?? `File_${knowledgeFiles.length + 1}.pdf`;
    setKnowledgeFiles(f => [...f, pick]);
  }

  function handleSave() {
    const p: Product = {
      id: initial?.id ?? `p${Date.now()}`,
      name: name || 'Unnamed product',
      logoInitials: logoInitials || name.slice(0, 2).toUpperCase() || 'PR',
      logoColor,
      website,
      description,
      idealCustomer,
      decisionMakers,
      features: features.filter(f => f.feature),
      pricingModel,
      priceRange,
      freeTrial,
      caseStudies: caseStudies.filter(c => c.customer),
      competitors: competitors.filter(c => c.name),
      knowledgeFiles,
      donts,
      lastUpdated: 'Today',
      campaignCount: initial?.campaignCount ?? 0,
    };
    setSavedProduct(p);
    setSaved(true);
  }

  const gap = isPanel ? 'space-y-5' : 'space-y-6';
  const padding = isPanel ? 'p-5' : 'p-8';
  const maxW = isPanel ? '' : 'max-w-2xl mx-auto w-full';

  if (saved && savedProduct) {
    return (
      <div className={`flex-1 overflow-y-auto ${padding} ${maxW} ${gap}`}>
        <div className="flex items-center justify-between">
          <button onClick={onCancel} className="text-sm text-[#6B7E78] hover:text-[#B8C9C2] transition-colors">
            Back
          </button>
        </div>
        <FlowPitchCard
          product={savedProduct}
          onAccept={() => onSave(savedProduct)}
          onRevise={() => {}} // feedback collected inline
        />
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-y-auto ${padding} ${gap}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className={`font-bold text-white ${isPanel ? 'text-base' : 'text-xl'}`}>{initial?.id ? `Edit ${initial.name}` : 'Add product'}</h2>
          {!isPanel && <p className="text-sm text-[#6B7E78] mt-0.5">Flow reads this to write openers, objection responses, and emails.</p>}
        </div>
        <button onClick={onCancel} className="text-sm text-[#6B7E78] hover:text-[#B8C9C2] transition-colors">Cancel</button>
      </div>

      {/* ── Basics ── */}
      <div className="space-y-4">
        <Divider label="Basics" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Product name</FieldLabel>
            <TextInput value={name} onChange={setName} placeholder="HostCo" />
          </div>
          <div>
            <FieldLabel>Logo initials</FieldLabel>
            <div className="flex gap-2">
              <TextInput value={logoInitials} onChange={setLogoInitials} placeholder="HC" className="w-20" />
              <div className="flex items-center gap-2 flex-1">
                {['#34E0A1', '#60A5FA', '#F472B6', '#F59E0B', '#A78BFA'].map(c => (
                  <button
                    key={c}
                    onClick={() => setLogoColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${logoColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <FieldLabel>Website URL</FieldLabel>
            <TextInput value={website} onChange={setWebsite} placeholder="https://hostco.io" />
          </div>
          <div>
            <FieldLabel>One-line description</FieldLabel>
            <TextInput value={description} onChange={setDescription} placeholder="AI guest comms for STR managers" />
          </div>
        </div>
      </div>

      {/* ── Who it's for ── */}
      <div className="space-y-4">
        <Divider label="Who it's for" />
        <div>
          <FieldLabel>Ideal customer</FieldLabel>
          <TextArea value={idealCustomer} onChange={setIdealCustomer} placeholder="Vacation rental management companies with 10-200 listings..." rows={2} />
        </div>
        <div>
          <FieldLabel>Usual decision-maker titles</FieldLabel>
          <ChipInput chips={decisionMakers} onChange={setDecisionMakers} placeholder="Add title, press Enter" />
        </div>
      </div>

      {/* ── What it does ── */}
      <div className="space-y-4">
        <Divider label="What it does" />
        <div className="space-y-3">
          {features.map((f, i) => (
            <div key={i} className="bg-[#0B1210] border border-[#1D2925] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Feature {i + 1}</span>
                {features.length > 1 && (
                  <button onClick={() => removeFeature(i)} className="text-[#6B7E78] hover:text-[#F87171] text-xs transition-colors">Remove</button>
                )}
              </div>
              <TextInput value={f.feature} onChange={v => updateFeature(i, 'feature', v)} placeholder="24/7 AI guest messaging" />
              <TextInput value={f.problem} onChange={v => updateFeature(i, 'problem', v)} placeholder="Problem it solves: Owners get woken up at 2am..." />
            </div>
          ))}
          <button onClick={addFeature} className="text-xs text-[#34E0A1] border border-[#34E0A1]/30 rounded-xl px-3 py-2 hover:bg-[#34E0A1]/10 transition-colors">+ Add feature</button>
        </div>
      </div>

      {/* ── Pricing ── */}
      <div className="space-y-4">
        <Divider label="Pricing" />
        <div className="grid grid-cols-3 gap-4">
          <div>
            <FieldLabel>Pricing model</FieldLabel>
            <select value={pricingModel} onChange={e => setPricingModel(e.target.value)} className="w-full bg-[#0B1210] border border-[#1D2925] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#34E0A1]/40 transition-colors appearance-none">
              {PRICING_MODELS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Price range</FieldLabel>
            <TextInput value={priceRange} onChange={setPriceRange} placeholder="$8-12/listing/month" />
          </div>
          <div>
            <FieldLabel>Free trial?</FieldLabel>
            <div className="flex gap-2 mt-1">
              {[true, false].map(v => (
                <button key={String(v)} onClick={() => setFreeTrial(v)} className={`flex-1 text-sm py-2 rounded-xl border transition-all ${freeTrial === v ? 'border-[#34E0A1]/40 bg-[#34E0A1]/10 text-[#34E0A1]' : 'border-[#1D2925] text-[#6B7E78] hover:text-[#B8C9C2]'}`}>
                  {v ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Proof ── */}
      <div className="space-y-4">
        <Divider label="Proof" />
        <div className="space-y-3">
          {caseStudies.map((cs, i) => (
            <div key={i} className="bg-[#0B1210] border border-[#1D2925] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Case study {i + 1}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-[#6B7E78] cursor-pointer">
                    <input type="checkbox" checked={cs.okToName} onChange={e => updateCS(i, 'okToName', e.target.checked)} className="accent-[#34E0A1]" />
                    OK to name
                  </label>
                  {caseStudies.length > 1 && (
                    <button onClick={() => removeCS(i)} className="text-[#6B7E78] hover:text-[#F87171] text-xs transition-colors">Remove</button>
                  )}
                </div>
              </div>
              <TextInput value={cs.customer} onChange={v => updateCS(i, 'customer', v)} placeholder="Customer name" />
              <TextInput value={cs.result} onChange={v => updateCS(i, 'result', v)} placeholder="40% fewer after-hours calls in first 30 days" />
              <TextArea value={cs.quote} onChange={v => updateCS(i, 'quote', v)} placeholder="Quote from the customer" rows={2} />
            </div>
          ))}
          <button onClick={addCaseStudy} className="text-xs text-[#34E0A1] border border-[#34E0A1]/30 rounded-xl px-3 py-2 hover:bg-[#34E0A1]/10 transition-colors">+ Add case study</button>
        </div>
      </div>

      {/* ── Competitors ── */}
      <div className="space-y-4">
        <Divider label="Competitors" />
        <div className="space-y-3">
          {competitors.map((c, i) => (
            <div key={i} className="bg-[#0B1210] border border-[#1D2925] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#6B7E78] uppercase tracking-widest">Competitor {i + 1}</span>
                {competitors.length > 1 && (
                  <button onClick={() => removeComp(i)} className="text-[#6B7E78] hover:text-[#F87171] text-xs transition-colors">Remove</button>
                )}
              </div>
              <TextInput value={c.name} onChange={v => updateComp(i, 'name', v)} placeholder="Competitor name" />
              <TextArea value={c.howWeDiffer} onChange={v => updateComp(i, 'howWeDiffer', v)} placeholder="How we differ..." rows={2} />
            </div>
          ))}
          <button onClick={addCompetitor} className="text-xs text-[#34E0A1] border border-[#34E0A1]/30 rounded-xl px-3 py-2 hover:bg-[#34E0A1]/10 transition-colors">+ Add competitor</button>
        </div>
      </div>

      {/* ── Knowledge ── */}
      <div className="space-y-4">
        <Divider label="Knowledge" />
        <div
          className="border-2 border-dashed border-[#1D2925] rounded-xl p-6 flex flex-col items-center justify-center gap-3 hover:border-[#34E0A1]/30 transition-colors cursor-pointer"
          onClick={handleFakeUpload}
        >
          <UploadIcon />
          <p className="text-sm text-[#6B7E78] text-center">Drop PDFs or decks here, or <span className="text-[#34E0A1] underline">click to upload</span></p>
          <p className="text-xs text-[#6B7E78]">Flow will read everything you upload</p>
        </div>
        {knowledgeFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {knowledgeFiles.map(f => (
              <span key={f} className="flex items-center gap-2 text-xs bg-[#0B1210] border border-[#1D2925] rounded-xl px-3 py-1.5 text-[#B8C9C2]">
                <span className="text-[#34E0A1]">✓</span>
                {f}
                <span className="text-[10px] text-[#34E0A1] font-mono">Flow has read this</span>
                <button onClick={() => setKnowledgeFiles(files => files.filter(x => x !== f))} className="text-[#6B7E78] hover:text-[#F87171] transition-colors ml-1">x</button>
              </span>
            ))}
          </div>
        )}
        <div>
          <FieldLabel>Or paste text directly</FieldLabel>
          <TextArea value={knowledgePaste} onChange={setKnowledgePaste} placeholder="Paste any notes, talking points, or product details..." rows={4} />
        </div>
      </div>

      {/* ── Don'ts ── */}
      <div className="space-y-4">
        <Divider label="Don'ts" />
        <TextArea value={donts} onChange={setDonts} placeholder="Things reps must never say or promise. e.g. Never promise a specific SLA..." rows={3} />
      </div>

      {/* Save */}
      <div className="flex gap-3 pb-4">
        <button onClick={handleSave} className="bg-[#34E0A1] text-[#050807] font-semibold px-6 py-2.5 rounded-xl hover:bg-[#20B982] transition-colors text-sm">
          Save product
        </button>
        <button onClick={onCancel} className="border border-[#1D2925] text-[#6B7E78] px-6 py-2.5 rounded-xl hover:text-[#B8C9C2] transition-colors text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function GlassesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="7" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <circle cx="17" cy="14" r="4" stroke="#34E0A1" strokeWidth="1.5" />
      <path d="M3 14C3 10 5 7 7 6M21 14C21 10 19 7 17 6M11 14h2" stroke="#34E0A1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7E78" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}
