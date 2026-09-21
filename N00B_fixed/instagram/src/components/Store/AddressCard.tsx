import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { ShopAddress } from '../../types';
import { addressSummary } from './addressBook';
import { pinOf } from './orderTracking';

interface AddressCardProps {
  address: ShopAddress;
  // 'manage': the Account page (Edit / Remove / Set as default). 'select': checkout (tap the card to deliver there).
  mode: 'manage' | 'select';
  selected?: boolean;
  busy?: boolean;
  onSelect?: (a: ShopAddress) => void;
  onEdit: (a: ShopAddress) => void;
  onRemove?: (a: ShopAddress) => void;
  onMakeDefault?: (a: ShopAddress) => void;
}

// The short version of an address: who, street, place, and a phone number with all but the last four digits hidden.
// Everything else (landmark, delivery notes, second phone number) is only shown when editing.
export const AddressCard: React.FC<AddressCardProps> = ({ address, mode, selected, busy, onSelect, onEdit, onRemove, onMakeDefault }) => {
  const s = addressSummary(address);

  const body = (
    <div className="min-w-0 flex-1 space-y-0.5 text-left">
      <div className="flex items-center gap-2 flex-wrap">
        {address.isDefault && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#00FF66]/15 text-[#00FF66] border border-[#00FF66]/30">Default</span>}
        {address.label && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">{address.label}</span>}
      </div>
      <p className="text-sm font-black text-white truncate">{s.name}</p>
      {s.street && <p className="text-xs text-zinc-300 truncate">{s.street}</p>}
      {s.place && <p className="text-xs text-zinc-300 truncate">{s.place}</p>}
      {s.phone && <p className="text-[11px] text-zinc-500">Phone: {s.phone}</p>}
      {pinOf(address) ? (
        <p className="text-[11px] font-semibold text-[#00FF66]">📍 Exact location pinned</p>
      ) : (
        <p className="text-[11px] text-zinc-500">No map pin yet: edit this address to add one.</p>
      )}
    </div>
  );

  if (mode === 'select') {
    return (
      <div className={`rounded-2xl border p-3 transition-colors ${selected ? 'border-[#00FF66] bg-[#00FF66]/5' : 'border-zinc-800 bg-zinc-900/60'}`}>
        <button type="button" onClick={() => onSelect?.(address)} aria-pressed={!!selected} className="w-full flex items-start gap-3 cursor-pointer">
          {selected ? <CheckCircle2 className="w-5 h-5 text-[#00FF66] shrink-0 mt-0.5" /> : <Circle className="w-5 h-5 text-zinc-600 shrink-0 mt-0.5" />}
          {body}
        </button>
        <div className="pl-8 pt-1.5">
          <button type="button" onClick={() => onEdit(address)} className="text-[11px] font-bold text-cyan-300 hover:underline cursor-pointer">
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      {body}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onEdit(address)}
          disabled={busy}
          className="py-2 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800/60 cursor-pointer disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onRemove?.(address)}
          disabled={busy}
          className="py-2 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-red-500/60 hover:text-red-300 cursor-pointer disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      {!address.isDefault && (
        <button type="button" onClick={() => onMakeDefault?.(address)} disabled={busy} className="text-[11px] font-bold text-cyan-300 hover:underline cursor-pointer disabled:opacity-50">
          Set as default
        </button>
      )}
    </div>
  );
};
