import React, { useEffect, useState } from 'react';
import { X, HeartHandshake, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Timer } from 'lucide-react';
import { User } from '../../types';
import { PaymentRequestSummary, fetchMyPaymentRequests, respondPaymentRequest } from '../../services/api';
import { formatNoobPoints } from '../../utils/formatPoints';

function formatCountdown(expiresAt: string, now: number): string {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return 'Expired';
  const totalSeconds = Math.floor(remainingMs / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

interface PaymentRequestsModalProps {
  currentUser: User;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

const PURCHASE_LABEL: Record<string, string> = { live_lounge: 'NOOB Live Lounge' };

export const PaymentRequestsModal: React.FC<PaymentRequestsModalProps> = ({ currentUser, onClose, onUserUpdated }) => {
  const [requests, setRequests] = useState<PaymentRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');
  const isMasterAdmin = currentUser.username?.toLowerCase() === 'noob';
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetchMyPaymentRequests().then((res) => { if (res.success) setRequests(res.requests); setLoading(false); });
  }, []);

  // Ticks the countdown and quietly drops a request the moment its 7 minutes run out — approving it
  // past that point fails server-side anyway, so there's no point leaving a dead "Approve" button up.
  useEffect(() => {
    const interval = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setRequests((prev) => prev.filter((r) => new Date(r.expiresAt).getTime() > t));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDecline = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await respondPaymentRequest(id, false);
      if (res.success) setRequests((prev) => prev.filter((r) => r.id !== id));
      else setError(res.error || 'Could not decline that request.');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!isMasterAdmin && !password) return;
    setBusy(true);
    setError('');
    try {
      const res = await respondPaymentRequest(id, true, isMasterAdmin ? undefined : password);
      if (res.success) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
        setActiveId(null);
        setPassword('');
        setDoneMessage('Payment approved — they can use it now.');
        setTimeout(() => setDoneMessage(''), 3000);
      } else {
        setError(res.error || 'Could not approve that payment.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <HeartHandshake className="w-4.5 h-4.5" />
            </div>
            <h2 className="text-base font-bold text-white">Payment Requests</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-900 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {doneMessage && (
          <p className="text-[11px] text-noob flex items-center gap-1.5 bg-noob/10 border border-noob/30 rounded-xl p-2.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {doneMessage}
          </p>
        )}

        {loading ? (
          <p className="text-xs text-zinc-500 text-center py-6">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-6">No pending payment requests.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="p-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-3">
                <div className="flex items-center gap-3">
                  <img src={r.requester.avatar || '/noob-logo.svg.jpeg'} alt={r.requester.username} className="w-10 h-10 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white"><span className="font-bold">@{r.requester.username}</span> is asking you to pay for</p>
                    <p className="text-xs font-bold text-amber-400">{PURCHASE_LABEL[r.purchaseType] || r.purchaseType}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-black text-white block">{formatNoobPoints(r.amount)} pts</span>
                    <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 justify-end"><Timer className="w-3 h-3" /> {formatCountdown(r.expiresAt, now)}</span>
                  </div>
                </div>

                {activeId === r.id ? (
                  <div className="space-y-2">
                    {!isMasterAdmin && (
                      <>
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Lock className="w-3 h-3" /> Password to confirm
                          </label>
                          <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer">
                            {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {showPassword ? 'HIDE' : 'SHOW'}
                          </button>
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setError(''); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && password && !busy) handleApprove(r.id); }}
                          placeholder="Password"
                          autoFocus
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-base tracking-widest text-white placeholder:text-xs placeholder:tracking-normal placeholder:text-zinc-600 focus:outline-none focus:border-noob/60"
                        />
                      </>
                    )}
                    {error && <p className="text-[11px] text-rose-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { setActiveId(null); setPassword(''); setError(''); }} className="flex-1 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold cursor-pointer">Cancel</button>
                      <button
                        onClick={() => handleApprove(r.id)}
                        disabled={busy || (!isMasterAdmin && !password)}
                        className="flex-1 py-2 rounded-xl bg-noob text-black text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {busy ? 'Confirming…' : 'Confirm & Pay'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => handleDecline(r.id)} disabled={busy} className="flex-1 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs font-bold cursor-pointer disabled:opacity-40">Decline</button>
                    <button onClick={() => setActiveId(r.id)} disabled={busy} className="flex-1 py-2 rounded-xl bg-noob text-black text-xs font-bold cursor-pointer disabled:opacity-40">Approve</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
