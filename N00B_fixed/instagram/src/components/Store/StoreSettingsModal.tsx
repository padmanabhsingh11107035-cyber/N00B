import React, { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { AppSettings } from '../../types';
import { updateSettings } from '../../services/api';

interface StoreSettingsModalProps {
  settings: AppSettings;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
}

export const StoreSettingsModal: React.FC<StoreSettingsModalProps> = ({ settings, onClose, onSaved }) => {
  // A settings document persisted before this field existed won't have it
  // yet — treat that as "enabled" (the real default), not as "disabled".
  const [storeEnabled, setStoreEnabled] = useState(settings.storeEnabled !== false);
  const [deliveryFee, setDeliveryFee] = useState(String(settings.storeDeliveryFee ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const fee = Number(deliveryFee);
    if (!Number.isFinite(fee) || fee < 0) {
      setError('Enter a valid delivery charge.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSettings({ storeEnabled, storeDeliveryFee: fee });
      onSaved(updated);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error && err.message ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-[#0e0e0e] border border-zinc-800 sm:rounded-3xl rounded-t-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white">Shop Settings</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <label className="flex items-center justify-between gap-4 cursor-pointer text-xs text-zinc-300">
          <div>
            <span className="block font-bold text-white">Accept orders</span>
            <span className="block text-[10px] text-zinc-500 leading-snug">
              Turn off to stop orders for a while. Customers can still browse and fill their cart, but when they press Checkout they see &ldquo;We are not accepting orders for a while.&rdquo;
            </span>
          </div>
          <input type="checkbox" checked={storeEnabled} onChange={(e) => setStoreEnabled(e.target.checked)} className="w-5 h-5 shrink-0 accent-[#00FF66] cursor-pointer" />
        </label>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase">Delivery Charge (₹)</label>
          <input
            type="number"
            min="0"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(e.target.value)}
            className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
          />
          <p className="text-[10px] text-zinc-500">Applied only when a buyer chooses Delivery over Pickup.</p>
        </div>

        {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};
