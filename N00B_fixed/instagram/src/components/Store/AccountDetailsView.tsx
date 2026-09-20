import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, UserRound } from 'lucide-react';
import { ShopDetails, User } from '../../types';
import { getShopDetails, saveShopDetails } from '../../services/api';
import { ContactFields, prefillFromProfile, withDefaults } from './ContactFields';

interface AccountDetailsViewProps {
  currentUser: User;
  onOpenOrders: () => void;
}

// "Account details": the contact details and address the shop uses for your orders. Saved once, used at every checkout.
export const AccountDetailsView: React.FC<AccountDetailsViewProps> = ({ currentUser, onOpenOrders }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState<ShopDetails>(withDefaults());
  const [usedProfile, setUsedProfile] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getShopDetails();
      if (!alive) return;
      if (res.success) {
        const filled = prefillFromProfile(currentUser, res.details);
        const differs = JSON.stringify(filled) !== JSON.stringify(withDefaults(res.details));
        setUsedProfile(differs);
        setDirty(differs);   // filled in from the profile: nothing is saved yet, so allow saving straight away
        setDetails(filled);
      } else {
        setMessage({ ok: false, text: res.error || 'Could not load your details.' });
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await saveShopDetails(details);
    setSaving(false);
    if (res.success) {
      if (res.details) setDetails(withDefaults(res.details));
      setDirty(false);
      setUsedProfile(false);
      setMessage({ ok: true, text: 'Saved. These will be used the next time you check out.' });
    } else {
      setMessage({ ok: false, text: res.error || 'Could not save your details.' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3">
        {currentUser.avatar ? (
          <img src={currentUser.avatar} alt="" className="w-12 h-12 rounded-full object-cover bg-zinc-800" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
            <UserRound className="w-6 h-6 text-zinc-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{currentUser.displayName || currentUser.username}</p>
          <p className="text-[11px] text-zinc-500 truncate">@{currentUser.username}</p>
        </div>
        <button onClick={onOpenOrders} className="text-[11px] font-bold text-[#00FF66] px-3 py-1.5 rounded-full border border-[#00FF66]/40 hover:bg-[#00FF66]/10 cursor-pointer shrink-0">
          My orders
        </button>
      </div>

      {usedProfile && (
        <p className="text-[11px] text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
          We filled in what your NOOB profile already had. Check it, add your address, and press Save.
        </p>
      )}

      <ContactFields
        value={details}
        onChange={(next) => {
          setDetails(next);
          setDirty(true);
          setMessage(null);
        }}
      />

      {message && (
        <div
          role="status"
          className={`flex items-start gap-2 text-xs font-semibold rounded-xl p-3 border ${
            message.ok ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-red-300 bg-red-500/10 border-red-500/30'
          }`}
        >
          {message.ok && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <button
        onClick={save}
        disabled={saving || !dirty}
        className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving…' : 'Save details'}
      </button>
      <p className="text-[10px] text-zinc-600 text-center">Only you and the shop (for your orders) can see these details.</p>
    </div>
  );
};
