import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, MapPin, UserRound } from 'lucide-react';
import { ShopAddress, ShopDetails, User } from '../../types';
import { getShopDetails, saveShopDetails, setDefaultShopAddress, deleteShopAddress } from '../../services/api';
import { ContactFields, prefillFromProfile, withDefaults } from './ContactFields';
import { AddressCard } from './AddressCard';
import { AddressEditorModal } from './AddressEditorModal';
import { MAX_ADDRESSES } from './addressBook';
import { useAddressBook } from './useAddressBook';

interface AccountDetailsViewProps {
  currentUser: User;
  onOpenOrders: () => void;
}

type Notice = { ok: boolean; text: string };

// "Account": your saved delivery addresses (one of them the default, shown first) and your contact details. Everything here is
// used at checkout. The address cards show a short version; the full details are in the editor.
export const AccountDetailsView: React.FC<AccountDetailsViewProps> = ({ currentUser, onOpenOrders }) => {
  const book = useAddressBook();
  const [editor, setEditor] = useState<{ address?: ShopAddress } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // contact details (name, phone, email): the person the shop reaches for pickup orders and the start of every new address
  const [contact, setContact] = useState<ShopDetails>(withDefaults());
  const [contactLoading, setContactLoading] = useState(true);
  const [contactFromProfile, setContactFromProfile] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getShopDetails();
      if (!alive) return;
      const saved = res.success ? res.details : {};
      const filled = prefillFromProfile(currentUser, saved);
      setContactFromProfile(JSON.stringify(filled) !== JSON.stringify(withDefaults(saved)));
      setContact(filled);
      setContactLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const say = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice((n) => (n && n.text === text ? null : n)), 4000);
  };

  const remove = async (a: ShopAddress) => {
    if (!window.confirm('Remove this address?')) return;
    setBusyId(a.id);
    const res = await deleteShopAddress(a.id);
    setBusyId(null);
    if (res.success) {
      book.setAddresses(res.addresses);
      say(true, 'Address removed.');
    } else say(false, res.error || 'Could not remove the address.');
  };

  const makeDefault = async (a: ShopAddress) => {
    setBusyId(a.id);
    const res = await setDefaultShopAddress(a.id);
    setBusyId(null);
    if (res.success) {
      book.setAddresses(res.addresses);
      say(true, 'Default address changed.');
    } else say(false, res.error || 'Could not change the default address.');
  };

  const saveContact = async () => {
    setSavingContact(true);
    const res = await saveShopDetails({ fullName: contact.fullName, phone: contact.phone, altPhone: contact.altPhone, email: contact.email });
    setSavingContact(false);
    if (res.success) {
      if (res.details) setContact(withDefaults(res.details));
      setContactFromProfile(false);
      setEditingContact(false);
      say(true, 'Contact details saved.');
    } else say(false, res.error || 'Could not save your contact details.');
  };

  const full = book.addresses.length >= MAX_ADDRESSES;

  return (
    <div className="max-w-lg mx-auto space-y-6">
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

      {notice && (
        <div
          role="status"
          className={`flex items-start gap-2 text-xs font-semibold rounded-xl p-3 border ${
            notice.ok ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-red-300 bg-red-500/10 border-red-500/30'
          }`}
        >
          {notice.ok && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* ---- Your Addresses ---- */}
      <section className="space-y-3" aria-labelledby="your-addresses">
        <h2 id="your-addresses" className="text-2xl font-black text-white tracking-tight">
          Your Addresses
        </h2>

        <button
          onClick={() => setEditor({})}
          disabled={full || book.loading}
          className="w-full flex items-center justify-between px-4 py-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className="text-sm font-bold text-white">Add a new address</span>
          <ChevronRight className="w-5 h-5 text-zinc-400" />
        </button>
        {full && <p className="text-[11px] text-zinc-500">You can save up to {MAX_ADDRESSES} addresses. Remove one to add another.</p>}

        <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-wide pt-2">Personal Addresses</h3>

        {book.loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : book.error ? (
          <div role="alert" className="text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
            <span>{book.error}</span>
            <button onClick={book.reload} className="underline font-bold cursor-pointer shrink-0">
              Try again
            </button>
          </div>
        ) : book.addresses.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-8 rounded-2xl border border-dashed border-zinc-800">
            <MapPin className="w-8 h-8 text-zinc-700" />
            <p className="text-sm font-bold text-zinc-400">You haven&apos;t saved an address yet</p>
            <p className="text-xs text-zinc-600 max-w-xs">Add one and pick it at checkout when you want your order delivered.</p>
          </div>
        ) : (
          book.addresses.map((a) => (
            <AddressCard key={a.id} address={a} mode="manage" busy={busyId === a.id} onEdit={(x) => setEditor({ address: x })} onRemove={remove} onMakeDefault={makeDefault} />
          ))
        )}
      </section>

      {/* ---- Contact details ---- */}
      <section className="space-y-3" aria-labelledby="contact-details">
        <h2 id="contact-details" className="text-2xl font-black text-white tracking-tight">
          Contact details
        </h2>
        {contactLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : editingContact ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
            <ContactFields value={contact} onChange={setContact} address={false} notes={false} />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={saveContact}
                disabled={savingContact}
                className="py-2.5 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-xl cursor-pointer hover:opacity-90 disabled:opacity-60"
              >
                {savingContact ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditingContact(false)} disabled={savingContact} className="py-2.5 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-zinc-500 cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
            <div className="space-y-0.5">
              <p className="text-sm font-black text-white">{contact.fullName || 'No name yet'}</p>
              <p className="text-xs text-zinc-300">Phone: {contact.phone || '—'}{contact.altPhone ? `  ·  ${contact.altPhone}` : ''}</p>
              <p className="text-xs text-zinc-300">Email: {contact.email || '—'}</p>
            </div>
            {contactFromProfile && <p className="text-[10px] text-zinc-500">Filled in from your NOOB profile. Press Edit to check it and save.</p>}
            <button onClick={() => setEditingContact(true)} className="w-full py-2 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800/60 cursor-pointer">
              Edit
            </button>
          </div>
        )}
        <p className="text-[10px] text-zinc-600">Only you and the shop (for your orders) can see these details.</p>
      </section>

      {editor && (
        <AddressEditorModal
          address={editor.address}
          hasAddresses={book.addresses.length > 0}
          startWith={{ fullName: contact.fullName, phone: contact.phone, altPhone: contact.altPhone }}
          onClose={() => setEditor(null)}
          onSaved={({ addresses }) => {
            book.setAddresses(addresses);
            setEditor(null);
            say(true, editor.address ? 'Address updated.' : 'Address saved.');
          }}
        />
      )}
    </div>
  );
};
