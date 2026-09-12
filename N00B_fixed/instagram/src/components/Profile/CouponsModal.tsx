import React, { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Check, Ticket, Plus, X, Trash2, BadgeCheck } from 'lucide-react';
import { User } from '../../types';
import { Coupon, fetchMyCoupons, createCoupon, deleteCoupon, redeemCouponCode } from '../../services/api';

interface CouponsModalProps {
  currentUser: User;
  onClose: () => void;
  allUsers?: User[];
}

const isMasterAdmin = (user: User) =>
  !!user.isAdmin || user.username.toLowerCase() === 'noob' || user.id === 'u_noob_admin';

export const CouponsModal: React.FC<CouponsModalProps> = ({ currentUser, onClose, allUsers = [] }) => {
  const admin = isMasterAdmin(currentUser);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [applyMsg, setApplyMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchMyCoupons();
      setCoupons(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyCode = async () => {
    if (!codeInput.trim()) return;
    const res = await redeemCouponCode(codeInput.trim());
    if (res.success && res.coupon) {
      setApplyMsg({ type: 'success', text: `"${res.coupon.title}" is ready to use below!` });
      setCodeInput('');
      load();
    } else {
      setApplyMsg({ type: 'error', text: res.error || 'Invalid coupon code.' });
    }
  };

  const handleCopy = (code: string) => {
    try {
      navigator.clipboard?.writeText(code);
    } catch (e) {}
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-900 shrink-0">
        <button onClick={onClose} className="p-1.5 -ml-1.5 rounded-full hover:bg-zinc-900 text-white cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-white flex-1 text-center pr-8">Coupons</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg w-full mx-auto">
        {/* Code Input */}
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-1.5">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value);
              setApplyMsg(null);
            }}
            placeholder="Type coupon code here"
            className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            onClick={handleApplyCode}
            disabled={!codeInput.trim()}
            className="px-5 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold text-sm cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            Apply
          </button>
        </div>
        {applyMsg && (
          <p className={`text-xs mt-2 px-1 ${applyMsg.type === 'success' ? 'text-[#00FF66]' : 'text-rose-400'}`}>
            {applyMsg.text}
          </p>
        )}

        {admin && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full mt-4 py-2.5 rounded-2xl border border-dashed border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" /> Create New Coupon
          </button>
        )}

        <div className="mt-6">
          <h2 className="text-sm font-bold text-zinc-400 mb-3">Available Offers</h2>

          {loading ? (
            <p className="text-xs text-zinc-500 text-center py-10">Loading coupons...</p>
          ) : coupons.length === 0 ? (
            <div className="flex flex-col items-center text-center py-14 gap-2">
              <Ticket className="w-10 h-10 text-zinc-700" />
              <p className="text-sm font-bold text-zinc-400">No coupons</p>
              <p className="text-xs text-zinc-600 max-w-[240px]">
                Coupons issued by NOOB will show up here immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {coupons.map((c) => (
                <CouponCard
                  key={c.id}
                  coupon={c}
                  expanded={expandedId === c.id}
                  onToggle={() => setExpandedId((id) => (id === c.id ? null : c.id))}
                  onCopy={() => handleCopy(c.code)}
                  copied={copiedCode === c.code}
                  isAdmin={admin}
                  onDelete={async () => {
                    await deleteCoupon(c.id);
                    load();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateCouponModal
          allUsers={allUsers}
          currentUserId={currentUser.id}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
};

const CouponCard: React.FC<{
  coupon: Coupon;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  isAdmin: boolean;
  onDelete: () => void;
}> = ({ coupon, expanded, onToggle, onCopy, copied, isAdmin, onDelete }) => {
  const isVerification = coupon.type === 'verification';

  return (
    <div className={`rounded-2xl bg-zinc-900 border overflow-hidden ${isVerification ? 'border-blue-500/40' : 'border-zinc-800'}`}>
      <div className="p-4 flex items-center gap-3">
        <div
          className={`w-11 h-11 rounded-xl border flex items-center justify-center font-black text-xs shrink-0 ${
            isVerification
              ? 'bg-gradient-to-br from-blue-500/20 to-cyan-600/10 border-blue-500/30 text-blue-400'
              : 'bg-gradient-to-br from-[#00FF66]/20 to-emerald-600/10 border-[#00FF66]/30 text-[#00FF66]'
          }`}
        >
          {isVerification ? <BadgeCheck className="w-5 h-5" /> : `${coupon.discountPercent}%`}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-white truncate">{coupon.title}</h3>
            {isVerification && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-bold uppercase border border-blue-500/30 shrink-0">
                Verification
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Use code <span className="font-bold text-white tracking-wide">{coupon.code}</span>
          </p>
        </div>
        <button
          onClick={onCopy}
          className="shrink-0 px-3.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        {isAdmin && (
          <button
            onClick={onDelete}
            className="shrink-0 p-2 text-zinc-500 hover:text-rose-400 cursor-pointer"
            title="Retire coupon"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {coupon.terms.length > 0 && (
        <>
          <div className="border-t border-dashed border-zinc-700 mx-4" />
          <div className="px-4 pb-3 pt-2.5">
            {expanded && (
              <ul className="space-y-1 mb-2">
                {coupon.terms.map((t, i) => (
                  <li key={i} className="text-[11px] text-zinc-400 flex items-start gap-1.5">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-500 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={onToggle}
              className="text-[11px] font-bold text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              {expanded ? '− Read less' : '+ Read more'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const CreateCouponModal: React.FC<{
  onClose: () => void;
  onCreated: () => void;
  allUsers: User[];
  currentUserId: string;
}> = ({ onClose, onCreated, allUsers, currentUserId }) => {
  const [couponType, setCouponType] = useState<'discount' | 'verification'>('discount');
  const [title, setTitle] = useState('');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [terms, setTerms] = useState('');
  const [targetMode, setTargetMode] = useState<'all' | 'specific'>('all');
  const [targetUsername, setTargetUsername] = useState('');
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectableUsers = allUsers.filter((u) => u.id !== currentUserId);
  const filteredPickerUsers = selectableUsers.filter(
    (u) =>
      !targetUsername.trim() ||
      u.username.toLowerCase().includes(targetUsername.trim().toLowerCase()) ||
      u.displayName?.toLowerCase().includes(targetUsername.trim().toLowerCase())
  );

  // A verification coupon grants the badge outright, not a discount, and
  // must always be tied to one specific account — a global "free
  // verification for everyone" coupon would hand out fake-verified badges
  // at scale.
  const isVerification = couponType === 'verification';
  useEffect(() => {
    if (isVerification) setTargetMode('specific');
  }, [isVerification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    const pct = Number(discountPercent);
    if (!isVerification && (!Number.isFinite(pct) || pct <= 0 || pct > 100)) {
      setError('Enter a discount between 1 and 100.');
      return;
    }
    if ((targetMode === 'specific' || isVerification) && !targetUsername.trim()) {
      setError(isVerification ? 'A verification coupon must target one specific user.' : 'Enter the username to target.');
      return;
    }

    setSubmitting(true);
    const res = await createCoupon({
      title: title.trim(),
      discountPercent: pct,
      terms,
      targetUsername: targetMode === 'specific' || isVerification ? targetUsername.trim() : undefined,
      type: couponType
    });
    setSubmitting(false);
    if (res.success) onCreated();
    else setError(res.error || 'Failed to create coupon.');
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Create Coupon</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-300 block">Coupon Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCouponType('discount')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                couponType === 'discount' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
              }`}
            >
              Discount Coupon
            </button>
            <button
              type="button"
              onClick={() => setCouponType('verification')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                couponType === 'verification' ? 'bg-blue-500 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
              }`}
            >
              <BadgeCheck className="w-3.5 h-3.5" /> Verification Badge
            </button>
          </div>
          {isVerification && (
            <p className="text-[11px] text-blue-400/80">
              Grants the verified checkmark to one account for free, one-time use. It won't work as a discount anywhere else.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-300 block">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isVerification ? 'e.g. Free Verification for @friend' : 'e.g. Flat 20% Off NOOB Pro'}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00FF66]"
          />
        </div>

        {!isVerification && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300 block">Discount (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00FF66]"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-300 block">
            Terms &amp; Conditions <span className="text-zinc-500 font-normal">(one per line)</span>
          </label>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={4}
            placeholder={'Applicable only on NOOB Pro upgrades\nMaximum discount is 500 points'}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00FF66] resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-zinc-300 block">Applies To</label>
          {isVerification ? (
            <p className="text-[11px] text-zinc-500">
              Verification coupons always target one specific user — enter their username below.
            </p>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTargetMode('all')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  targetMode === 'all' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                All Users
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('specific')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  targetMode === 'specific' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                Specific User
              </button>
            </div>
          )}
          {(targetMode === 'specific' || isVerification) && (
            <div className="relative mt-1.5">
              <input
                value={targetUsername}
                onChange={(e) => {
                  setTargetUsername(e.target.value);
                  setShowUserPicker(true);
                }}
                onFocus={() => setShowUserPicker(true)}
                onBlur={() => setTimeout(() => setShowUserPicker(false), 150)}
                placeholder="Search or type a username..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#00FF66]"
              />
              {showUserPicker && filteredPickerUsers.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-44 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl">
                  {filteredPickerUsers.slice(0, 30).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setTargetUsername(u.username);
                        setShowUserPicker(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800 text-left cursor-pointer"
                    >
                      <img
                        src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                        alt={u.username}
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-white block truncate">{u.displayName || u.username}</span>
                        <span className="text-[10px] text-zinc-500 block truncate">@{u.username}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-2xl bg-[#00FF66] text-black font-bold text-xs cursor-pointer disabled:opacity-50 hover:bg-[#00FF66]/90 transition-colors"
        >
          {submitting ? 'Creating...' : 'Create Coupon'}
        </button>
      </form>
    </div>
  );
};
