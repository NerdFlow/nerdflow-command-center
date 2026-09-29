import { useState } from 'react';
import { products as initialProducts } from '../data/sample';
import type { Product } from '../data/sample';
import { ProductForm } from '../components/ProductForm';

type SettingsTab = 'products' | 'team' | 'integrations';

export function Settings() {
  const [tab, setTab] = useState<SettingsTab>('products');
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [editing, setEditing] = useState<Product | null | 'new'>(null);

  function handleSave(p: Product) {
    setProducts(prev => {
      const exists = prev.find(x => x.id === p.id);
      return exists ? prev.map(x => x.id === p.id ? p : x) : [...prev, p];
    });
    setEditing(null);
  }

  if (editing !== null) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 py-5 border-b border-[#1D2925] shrink-0">
          <button onClick={() => setEditing(null)} className="flex items-center gap-2 text-sm text-[#6B7E78] hover:text-[#B8C9C2] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back to Settings
          </button>
        </div>
        <ProductForm
          initial={editing === 'new' ? {} : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[#0B1210] border border-[#1D2925] rounded-xl p-1 w-fit">
        {([['products', 'Products'], ['team', 'Team & roles'], ['integrations', 'Integrations']] as [SettingsTab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-all ${tab === id ? 'bg-[#34E0A1]/10 text-[#34E0A1]' : 'text-[#6B7E78] hover:text-[#B8C9C2]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Products tab */}
      {tab === 'products' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Products</h2>
              <p className="text-sm text-[#6B7E78] mt-0.5">Flow uses this to write openers, objection responses, and emails for every campaign.</p>
            </div>
            <button
              onClick={() => setEditing('new')}
              className="bg-[#34E0A1] text-[#050807] font-semibold px-4 py-2 rounded-xl hover:bg-[#20B982] transition-colors text-sm"
            >
              + Add product
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {products.map(p => (
              <ProductCard key={p.id} product={p} onEdit={() => setEditing(p)} />
            ))}
          </div>
        </div>
      )}

      {/* Team tab (stub) */}
      {tab === 'team' && (
        <div className="bg-[#0B1210] border border-[#1D2925] rounded-2xl p-8 text-center space-y-2">
          <p className="text-white font-medium">Team & roles</p>
          <p className="text-sm text-[#6B7E78]">Invite reps, set roles (Lead or Rep), and manage access.</p>
          <p className="text-xs text-[#6B7E78] mt-4">Coming soon</p>
        </div>
      )}

      {/* Integrations tab (stub) */}
      {tab === 'integrations' && (
        <div className="space-y-3">
          {[
            { name: 'Gmail', status: 'Connected', color: '#34E0A1', desc: 'Sending emails from your Gmail account' },
            { name: 'Instagram', status: 'Connected', color: '#34E0A1', desc: 'DMs via your Instagram business account' },
            { name: 'LinkedIn', status: 'Not connected', color: '#F59E0B', desc: 'Connect to send LinkedIn messages from Focus' },
            { name: 'Guesty', status: 'Not connected', color: '#6B7E78', desc: 'Pull property data for better lead context' },
          ].map(({ name, status, color, desc }) => (
            <div key={name} className="flex items-center justify-between bg-[#0B1210] border border-[#1D2925] rounded-xl px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">{name}</p>
                <p className="text-xs text-[#6B7E78] mt-0.5">{desc}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium" style={{ color }}>{status}</span>
                <button className="text-xs border border-[#1D2925] text-[#6B7E78] px-3 py-1.5 rounded-lg hover:text-[#B8C9C2] transition-colors">
                  {status === 'Connected' ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, onEdit }: { product: Product; onEdit: () => void }) {
  return (
    <div className="bg-[#0B1210] border border-[#1D2925] rounded-2xl p-5 hover:border-[#34E0A1]/20 transition-colors group">
      <div className="flex items-start gap-4 mb-4">
        {/* Logo */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: `${product.logoColor}18`, color: product.logoColor, border: `1px solid ${product.logoColor}30` }}
        >
          {product.logoInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-white">{product.name}</h3>
            <button
              onClick={onEdit}
              className="text-[10px] text-[#6B7E78] border border-[#1D2925] rounded-lg px-2 py-1 hover:text-[#B8C9C2] hover:border-[#34E0A1]/20 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            >
              Edit
            </button>
          </div>
          <p className="text-xs text-[#6B7E78] mt-0.5 leading-relaxed">{product.description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-[#6B7E78] border-t border-[#1D2925] pt-3">
        <span>
          <span className="text-white font-medium">{product.campaignCount}</span> campaign{product.campaignCount !== 1 ? 's' : ''}
        </span>
        <span>Updated {product.lastUpdated}</span>
      </div>
    </div>
  );
}
