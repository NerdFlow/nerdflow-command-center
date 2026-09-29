import { deals } from '../data/sample';

const stages = ['Interested', 'Demo booked', 'Demo done', 'Proposal', 'Won'];

export function Deals() {
  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      <h1 className="text-xl font-bold text-white">Deals</h1>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {stages.map(stage => {
          const stageDeals = deals.filter(d => d.stage === stage);
          return (
            <div key={stage} className="w-64 shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#6B7E78] uppercase tracking-widest">{stage}</span>
                <span className="text-xs text-[#6B7E78]">{stageDeals.length}</span>
              </div>
              <div className="space-y-2">
                {stageDeals.map(deal => (
                  <div key={deal.id} className={`bg-[#0B1210] border rounded-xl p-4 space-y-3 ${deal.stale ? 'border-[#F87171]/20' : 'border-[#1D2925]'}`}>
                    {deal.stale && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F87171]" />
                        <span className="text-[10px] text-[#F87171] font-medium">Stale — {deal.daysInStage} days</span>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-white text-sm">{deal.business}</p>
                      <p className="text-xs text-[#6B7E78]">{deal.contact}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#34E0A1]">${deal.value}/mo</span>
                      <span className="text-[10px] text-[#6B7E78] font-mono">{deal.daysInStage}d in stage</span>
                    </div>
                    <div className="bg-[#34E0A1]/5 border border-[#34E0A1]/15 rounded-lg p-2.5">
                      <p className="text-[10px] text-[#34E0A1] font-medium mb-1">Flow's next move</p>
                      <p className="text-xs text-[#B8C9C2] leading-relaxed">{deal.flowMove}</p>
                    </div>
                    <p className="text-[10px] text-[#6B7E78]">Next: {deal.nextStep}</p>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <div className="border border-dashed border-[#1D2925] rounded-xl p-4 flex items-center justify-center">
                    <span className="text-xs text-[#6B7E78]">Empty</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {/* Won / Lost */}
        <div className="w-64 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#6B7E78] uppercase tracking-widest">Won / Lost</span>
            <span className="text-xs text-[#6B7E78]">0</span>
          </div>
          <div className="border border-dashed border-[#1D2925] rounded-xl p-4 flex items-center justify-center">
            <span className="text-xs text-[#6B7E78]">No closed deals yet</span>
          </div>
        </div>
      </div>
    </div>
  );
}
