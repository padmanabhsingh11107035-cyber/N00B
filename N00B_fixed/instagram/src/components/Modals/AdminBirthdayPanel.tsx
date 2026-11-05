import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, Loader2, Pencil, Plus, RefreshCw, Trash2, X, Check, Cake } from 'lucide-react';
import {
  fetchBirthdayOverview, saveBirthdayGift, deleteBirthdayGift, saveBirthdayAddon, deleteBirthdayAddon,
  type BirthdayItem, type BirthdayOverview, type BirthdayHistoryRow
} from '../../services/api';

// Admin panel -> "Gifts": the birthday gifts people scratch on their birthday. The administrator sees every gift, changes or removes it, adds new ones, chooses the ADD-ONS that come
// with a gift (each with its own chance), and reads the history: who got what, on which date and time, and when they scratched it.
// See supabase/migrations/20261105000002_birthday_gifts_admin.sql.

type Draft = { id?: string; kind: BirthdayItem['kind']; value: string; label: string; weight: string; chance: string; active: boolean };
const KIND_LABEL: Record<string, string> = { points: 'Points', shop_item: 'Shop item', coupon: 'Coupon' };
const num = (v: string | number | null | undefined) => { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString('en-IN') : String(v ?? ''); };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const valueText = (i: { kind: string; value: string | null }) => (i.kind === 'points' ? `${num(i.value)} points` : i.kind === 'coupon' ? `${i.value}% off` : i.value ? 'one fixed shop item' : 'a random shop item');

const Switch: React.FC<{ on: boolean; busy?: boolean; label: string; onChange: () => void }> = ({ on, busy, label, onChange }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={busy} className="shrink-0 cursor-pointer disabled:opacity-50">
    <span className={`relative block w-10 h-[22px] rounded-full transition-colors ${on ? 'bg-emerald-400' : 'bg-zinc-700'}`}>
      <span className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${on ? 'left-[20px]' : 'left-0.5'}`} />
    </span>
  </button>
);

const ItemForm: React.FC<{ draft: Draft; setDraft: (d: Draft) => void; shopItems: BirthdayOverview['shopItems']; withChance: boolean; busy: boolean; onSave: () => void; onCancel: () => void }> = ({ draft, setDraft, shopItems, withChance, busy, onSave, onCancel }) => {
  const field = 'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-amber-400/60';
  return (
    <div className="rounded-xl border border-amber-400/30 bg-zinc-900/70 p-3 space-y-2.5" data-testid="birthday-form">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">What is it
          <select className={field} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'], value: '' })} data-testid="birthday-kind">
            <option value="points">Points</option>
            <option value="shop_item">A shop item</option>
            <option value="coupon">A coupon (% off)</option>
          </select>
        </label>
        <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          {draft.kind === 'points' ? 'How many points' : draft.kind === 'coupon' ? 'Percent off (1-100)' : 'Which item'}
          {draft.kind === 'shop_item' ? (
            <select className={field} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} data-testid="birthday-value">
              <option value="">A random item of the shop</option>
              {shopItems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <input className={field} inputMode="numeric" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value.replace(/[^0-9]/g, '') })} placeholder={draft.kind === 'points' ? '10000000' : '25'} data-testid="birthday-value" />
          )}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Name shown to the person (optional)
          <input className={field} value={draft.label} maxLength={80} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="made from the value if empty" data-testid="birthday-label" />
        </label>
        <label className="space-y-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">{withChance ? 'Chance (1-100 %)' : 'How often (weight)'}
          <input className={field} inputMode="numeric" value={withChance ? draft.chance : draft.weight} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setDraft(withChance ? { ...draft, chance: v } : { ...draft, weight: v }); }} data-testid="birthday-weight" />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] text-zinc-300"><Switch on={draft.active} label="Active" onChange={() => setDraft({ ...draft, active: !draft.active })} /> Active</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs font-bold cursor-pointer flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
          <button type="button" onClick={onSave} disabled={busy} className="px-3 py-1.5 rounded-lg bg-amber-400 text-black text-xs font-black cursor-pointer disabled:opacity-50 flex items-center gap-1" data-testid="birthday-save">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save</button>
        </div>
      </div>
    </div>
  );
};

export const AdminBirthdayPanel: React.FC = () => {
  const [data, setData] = useState<BirthdayOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [editing, setEditing] = useState<{ section: 'gift' | 'addon'; draft: Draft } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchBirthdayOverview(200);
    if (res.success && res.overview) { setData(res.overview); setMessage(null); } else setMessage({ ok: false, text: res.error || 'Could not load the birthday gifts.' });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const totalWeight = useMemo(() => (data?.gifts || []).filter((g) => g.active).reduce((s, g) => s + (g.weight || 0), 0), [data]);

  const run = async (job: Promise<{ success: boolean; overview?: BirthdayOverview; error?: string }>, ok: string) => {
    setBusy(true);
    const res = await job;
    if (res.success) { setMessage({ ok: true, text: ok }); setEditing(null); await load(); } else setMessage({ ok: false, text: res.error || 'Could not save.' });
    setBusy(false);
  };
  const blank = (): Draft => ({ kind: 'points', value: '', label: '', weight: '5', chance: '100', active: true });
  const toDraft = (i: BirthdayItem): Draft => ({ id: i.id, kind: i.kind, value: i.value ?? '', label: i.label, weight: String(i.weight ?? 1), chance: String(i.chance ?? 100), active: i.active });
  const payload = (d: Draft, addon: boolean) => ({ id: d.id, kind: d.kind, value: d.value, label: d.label, active: d.active, ...(addon ? { chance: Number(d.chance) } : { weight: Number(d.weight) }) } as Partial<BirthdayItem>);

  // (plain functions that return the markup, not components: a component made inside another one is a new component on every draw and would lose the typing focus of the form)
  const renderRow = (item: BirthdayItem, addon: boolean) => {
    const share = !addon && item.active && totalWeight > 0 ? ((item.weight || 0) / totalWeight) * 100 : null;
    return (
      <div className={`rounded-xl border p-2.5 flex items-center gap-2.5 ${item.active ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-800/60 bg-zinc-900/20 opacity-60'}`} data-testid={addon ? 'birthday-addon-row' : 'birthday-gift-row'}>
        <Gift className={`w-4 h-4 shrink-0 ${addon ? 'text-sky-400' : 'text-pink-400'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">{item.label}</p>
          <p className="text-[10px] text-zinc-400">
            {KIND_LABEL[item.kind]} · {valueText(item)} · {addon ? `${item.chance}% chance` : `weight ${item.weight}${share !== null ? ` (${share < 1 ? share.toFixed(2) : share.toFixed(1)}% of gifts)` : ''}`}
          </p>
        </div>
        <Switch on={item.active} busy={busy} label={`${item.label}: ${item.active ? 'on' : 'off'}`}
          onChange={() => void run((addon ? saveBirthdayAddon : saveBirthdayGift)({ ...item, active: !item.active } as Partial<BirthdayItem>), item.active ? 'Switched off.' : 'Switched on.')} />
        <button type="button" onClick={() => setEditing({ section: addon ? 'addon' : 'gift', draft: toDraft(item) })} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer" aria-label={`Edit ${item.label}`}><Pencil className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => { if (window.confirm(`Remove "${item.label}"?`)) void run((addon ? deleteBirthdayAddon : deleteBirthdayGift)(item.id), 'Removed.'); }} className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 cursor-pointer" aria-label={`Remove ${item.label}`}><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    );
  };

  const renderSection = (title: string, blurb: string, addon: boolean, items: BirthdayItem[]) => {
    const sec = addon ? 'addon' : 'gift';
    return (
      <section className="space-y-2" data-testid={addon ? 'birthday-addons' : 'birthday-gifts'}>
        <div className="flex items-start justify-between gap-2">
          <div><h3 className="text-sm font-black text-white">{title}</h3><p className="text-[11px] text-zinc-400">{blurb}</p></div>
          <button type="button" onClick={() => setEditing({ section: sec, draft: blank() })} className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-400 text-black text-xs font-black cursor-pointer flex items-center gap-1" data-testid={addon ? 'birthday-add-addon' : 'birthday-add-gift'}><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
        {editing && editing.section === sec && !editing.draft.id && (
          <ItemForm draft={editing.draft} setDraft={(d) => setEditing({ section: sec, draft: d })} shopItems={data?.shopItems || []} withChance={addon} busy={busy} onCancel={() => setEditing(null)}
            onSave={() => void run((addon ? saveBirthdayAddon : saveBirthdayGift)(payload(editing.draft, addon)), 'Added.')} />
        )}
        {items.length === 0 && <p className="text-[11px] text-zinc-500 py-3 text-center border border-dashed border-zinc-800 rounded-xl">{addon ? 'No add-ons: every gift comes alone.' : 'No gifts: people get 10,000,000 points.'}</p>}
        {items.map((i) => (
          editing && editing.section === sec && editing.draft.id === i.id
            ? <ItemForm key={i.id} draft={editing.draft} setDraft={(d) => setEditing({ section: sec, draft: d })} shopItems={data?.shopItems || []} withChance={addon} busy={busy} onCancel={() => setEditing(null)}
                onSave={() => void run((addon ? saveBirthdayAddon : saveBirthdayGift)(payload(editing.draft, addon)), 'Saved.')} />
            : <React.Fragment key={i.id}>{renderRow(i, addon)}</React.Fragment>
        ))}
      </section>
    );
  };

  const renderHistory = (h: BirthdayHistoryRow) => (
    <div key={h.cardId} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 flex items-start gap-2.5" data-testid="birthday-history-row">
      <img src={h.avatar || '/noob-logo-circle.png'} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-white truncate">{h.displayName || h.username || 'Deleted account'} <span className="text-zinc-400 font-medium">@{h.username || '—'}</span></p>
        <p className="text-[11px] text-amber-300 font-semibold">{h.gift?.label}{(h.gift?.addons || []).map((a, i) => <span key={i} className="text-sky-300"> + {a.label}</span>)}</p>
        <p className="text-[10px] text-zinc-500">Given {when(h.givenAt)} · {h.revealed ? `scratched ${when(h.revealedAt)}` : 'not scratched yet'}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="admin-birthday-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Cake className="w-5 h-5 text-pink-400" /><div><h2 className="text-base font-black text-white">Birthday gifts</h2><p className="text-[11px] text-zinc-400">What people scratch on their birthday: the gifts, the add-ons that come with them, and who got what.</p></div></div>
        <button type="button" onClick={() => void load()} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white cursor-pointer" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      {message && <p className={`text-xs font-semibold px-3 py-2 rounded-lg ${message.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`} role="status">{message.text}</p>}
      {loading && !data ? <div className="py-10 text-center text-zinc-500"><Loader2 className="w-5 h-5 animate-spin inline" /></div> : data && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['Gifts given', data.totals.given], ['Scratched', data.totals.revealed], ['Active gifts', data.gifts.filter((g) => g.active).length]].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border border-zinc-800 bg-zinc-900/50 py-2"><p className="text-lg font-black text-white">{num(v as number)}</p><p className="text-[10px] uppercase tracking-wider text-zinc-400">{k}</p></div>
            ))}
          </div>
          {renderSection('Gifts', 'One of these is picked for each birthday. A higher weight comes up more often.', false, data.gifts)}
          {renderSection('Add-ons', 'Extra rewards that come with the gift, each with its own chance.', true, data.addons)}
          <section className="space-y-2" data-testid="birthday-history">
            <div><h3 className="text-sm font-black text-white">History</h3><p className="text-[11px] text-zinc-400">Who got what, and when (newest first).</p></div>
            {data.history.length === 0 ? <p className="text-[11px] text-zinc-500 py-3 text-center border border-dashed border-zinc-800 rounded-xl">Nobody has had a birthday gift yet.</p> : data.history.map((h) => renderHistory(h))}
          </section>
        </>
      )}
    </div>
  );
};
