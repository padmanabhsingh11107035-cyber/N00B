import React, { useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { StoreProduct } from '../../types';
import { ShopFilterState, SORT_LABELS, SortKey, activeFilterCount, emptyFilters, optionGroups } from './filterLogic';

interface ShopFiltersProps {
  products: StoreProduct[];
  filters: ShopFilterState;
  onChange: (next: ShopFilterState) => void;
}

// One collapsible block of the filter panel (like the left column in the shop layout).
const Group: React.FC<{ title: string; children: React.ReactNode; startOpen?: boolean }> = ({ title, children, startOpen = true }) => {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="border-b border-zinc-800/80 pb-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between py-2 text-left cursor-pointer" aria-expanded={open}>
        <span className="text-[11px] font-black text-zinc-200 uppercase tracking-wide">{title}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-1.5 pt-1">{children}</div>}
    </div>
  );
};

const Check: React.FC<{ checked: boolean; onChange: () => void; label: string; hint?: string }> = ({ checked, onChange, label, hint }) => (
  <label className="flex items-center gap-2.5 cursor-pointer group">
    <input type="checkbox" checked={checked} onChange={onChange} className="w-3.5 h-3.5 accent-amber-400 cursor-pointer shrink-0" />
    <span className={`text-xs flex-1 min-w-0 truncate ${checked ? 'text-white font-bold' : 'text-zinc-400 group-hover:text-zinc-200'}`}>{label}</span>
    {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
  </label>
);

export const ShopFilters: React.FC<ShopFiltersProps> = ({ products, filters, onChange }) => {
  const groups = useMemo(() => optionGroups(products), [products]);
  const active = activeFilterCount(filters);
  const set = (patch: Partial<ShopFilterState>) => onChange({ ...filters, ...patch });

  const toggleOption = (groupKey: string, valueKey: string) => {
    const now = filters.options[groupKey] || [];
    const next = now.includes(valueKey) ? now.filter((v) => v !== valueKey) : [...now, valueKey];
    onChange({ ...filters, options: { ...filters.options, [groupKey]: next } });
  };

  return (
    <div className="space-y-2" aria-label="Shop filters">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search the shop"
          aria-label="Search the shop"
          className="w-full bg-zinc-900 text-xs text-white pl-8 pr-8 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-amber-400/60"
        />
        {filters.search && (
          <button type="button" onClick={() => set({ search: '' })} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 cursor-pointer" aria-label="Clear search">
            <X className="w-3 h-3 text-zinc-400" />
          </button>
        )}
      </div>

      <Group title="Sort by">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
            <input type="radio" name="shop-sort" checked={filters.sort === key} onChange={() => set({ sort: key })} className="w-3.5 h-3.5 accent-amber-400 cursor-pointer" />
            <span className={`text-xs ${filters.sort === key ? 'text-white font-bold' : 'text-zinc-400 group-hover:text-zinc-200'}`}>{SORT_LABELS[key]}</span>
          </label>
        ))}
      </Group>

      <Group title="Price (₹)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={filters.minPrice}
            onChange={(e) => set({ minPrice: e.target.value })}
            placeholder="Min"
            aria-label="Lowest price"
            className="w-full min-w-0 bg-zinc-900 text-xs text-white px-2.5 py-2 rounded-lg border border-zinc-800 outline-none focus:border-amber-400/60"
          />
          <span className="text-zinc-600 text-xs">–</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={filters.maxPrice}
            onChange={(e) => set({ maxPrice: e.target.value })}
            placeholder="Max"
            aria-label="Highest price"
            className="w-full min-w-0 bg-zinc-900 text-xs text-white px-2.5 py-2 rounded-lg border border-zinc-800 outline-none focus:border-amber-400/60"
          />
        </div>
      </Group>

      <Group title="Availability">
        <Check checked={filters.inStockOnly} onChange={() => set({ inStockOnly: !filters.inStockOnly })} label="In stock only" />
      </Group>

      {groups.map((g) => (
        <Group key={g.key} title={g.name}>
          {g.values.map((v) => (
            <Check key={v.key} checked={(filters.options[g.key] || []).includes(v.key)} onChange={() => toggleOption(g.key, v.key)} label={v.label} hint={String(v.count)} />
          ))}
        </Group>
      ))}

      {active > 0 && (
        <button
          type="button"
          onClick={() => onChange(emptyFilters)}
          className="w-full py-2 rounded-xl border border-zinc-700 text-[11px] font-bold text-zinc-300 hover:text-white hover:border-zinc-500 cursor-pointer"
        >
          Clear all filters ({active})
        </button>
      )}
    </div>
  );
};
