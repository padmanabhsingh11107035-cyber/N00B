import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ShopAddress, ShopDetails } from '../../types';
import { saveShopAddress } from '../../services/api';
import { ContactFields, EMPTY_DETAILS, inputClass } from './ContactFields';
import { AddressForm, MAX_LABEL, emptyAddressForm, validateAddress } from './addressBook';

interface AddressEditorModalProps {
  // the address being changed; leave out to add a new one
  address?: ShopAddress;
  // saved addresses so far: the very first one always becomes the default
  hasAddresses: boolean;
  // name / phone to start a NEW address from (from the contact details)
  startWith?: Partial<AddressForm>;
  onClose: () => void;
  onSaved: (result: { address?: ShopAddress; addresses: ShopAddress[] }) => void;
}

const QUICK_NAMES = ['Home', 'Work'];

// Add a new address, or change an existing one. Opens over whatever screen it was called from.
export const AddressEditorModal: React.FC<AddressEditorModalProps> = ({ address, hasAddresses, startWith, onClose, onSaved }) => {
  const editing = !!address;
  const [form, setForm] = useState<AddressForm>(() => {
    if (address) {
      const { id: _id, isDefault: _d, updatedAt: _u, ...rest } = address;
      return { ...emptyAddressForm(), ...rest };
    }
    return { ...emptyAddressForm(), ...startWith };
  });
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  // ContactFields works with the full contact record; the address form is a part of it
  const asDetails = { ...EMPTY_DETAILS, ...form } as ShopDetails;
  const setFromDetails = (next: ShopDetails) => setForm((prev) => ({ ...prev, ...next, label: prev.label }));

  const isDefaultAlready = !!address?.isDefault;
  const mustBeDefault = !hasAddresses && !editing; // the first address is the default automatically

  const save = async () => {
    const problem = validateAddress(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveShopAddress({ ...form, id: address?.id, makeDefault: makeDefault || mustBeDefault });
    setSaving(false);
    if (res.success) onSaved({ address: res.address, addresses: res.addresses });
    else setError(res.error || 'Could not save the address.');
  };

  return (
    <div className="fixed inset-0 z-[115] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={editing ? 'Edit address' : 'Add a new address'}>
      <div className="w-full sm:max-w-md bg-[#0e0e0e] border border-zinc-800 sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <h3 className="text-sm font-black text-white">{editing ? 'Edit address' : 'Add a new address'}</h3>
          <button onClick={onClose} disabled={saving} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-2 space-y-5">
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-zinc-400">Name this address (optional)</span>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={MAX_LABEL} placeholder="e.g. Home, Work" className={inputClass} />
            </label>
            <div className="flex gap-2">
              {QUICK_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setForm({ ...form, label: name })}
                  className={`px-3 py-1 rounded-full border text-[11px] font-bold cursor-pointer ${form.label === name ? 'border-[#00FF66] text-[#00FF66] bg-[#00FF66]/10' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <ContactFields value={asDetails} onChange={setFromDetails} email={false} />

          {!isDefaultAlready && !mustBeDefault && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="w-4 h-4 accent-[#00FF66] cursor-pointer" />
              <span className="text-xs text-zinc-300">Make this my default address</span>
            </label>
          )}
          {mustBeDefault && <p className="text-[11px] text-zinc-500">This will be your default address.</p>}

          {error && (
            <div role="alert" className="text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              {error}
            </div>
          )}
        </div>

        <div className="p-5 pt-3 shrink-0 border-t border-zinc-800/80">
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {saving ? 'Saving…' : editing ? 'Save changes' : 'Save address'}
          </button>
        </div>
      </div>
    </div>
  );
};
