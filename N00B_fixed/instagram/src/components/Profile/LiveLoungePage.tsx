import React, { useEffect, useState } from 'react';
import { ArrowLeft, Sparkles, Ticket, Coins, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Users, Search, HeartHandshake, Radio, KeyRound, History, Bell } from 'lucide-react';
import { User } from '../../types';
import { LIVE_LOUNGE_PRICE, purchaseLiveLounge, redeemLiveLoungeCoupon, requestFriendPayment, fetchPendingLiveLoungeInvites, fetchLiveLoungeHistory } from '../../services/api';
import type { LiveLoungePendingInvite, LiveLoungeHistoryEntry } from '../../services/api';
import { formatNoobPoints } from '../../utils/formatPoints';
import { LiveLoungeRoomView } from '../LiveStream/LiveLoungeRoomView';
import confetti from 'canvas-confetti';

interface LiveLoungePageProps {
  currentUser: User;
  allUsers: User[];
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
  initialRoomId?: string;
}

type Mode = 'menu' | 'purchase' | 'coupon' | 'ask-friend' | 'history';

export const LiveLoungePage: React.FC<LiveLoungePageProps> = ({ currentUser, allUsers, onClose, onUserUpdated, initialRoomId }) => {
  const alreadyUnlocked = !!currentUser.hasLiveLounge;
  const [mode, setMode] = useState<Mode>('menu');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  // "Ask a friend" step
  const [friendQuery, setFriendQuery] = useState('');
  const [friend, setFriend] = useState<User | null>(null);
  const [askSent, setAskSent] = useState(false);
  const [roomFlow, setRoomFlow] = useState<'host' | 'join' | null>(initialRoomId ? 'join' : null);
  const [resumeRoomId, setResumeRoomId] = useState<string | undefined>(initialRoomId);
  const [pendingInvites, setPendingInvites] = useState<LiveLoungePendingInvite[]>([]);
  const [history, setHistory] = useState<LiveLoungeHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (alreadyUnlocked && !roomFlow) fetchPendingLiveLoungeInvites().then(setPendingInvites);
  }, [alreadyUnlocked, roomFlow]);

  useEffect(() => {
    if (mode === 'history') { setLoadingHistory(true); fetchLiveLoungeHistory().then((h) => { setHistory(h); setLoadingHistory(false); }); }
  }, [mode]);

  const balance = currentUser.noobPoints || 0;
  const candidates = allUsers
    .filter((u) => u.id !== currentUser.id && !u.isAi)
    .filter((u) => (friendQuery.trim() ? u.username.toLowerCase().includes(friendQuery.trim().toLowerCase()) : true))
    .slice(0, 30);

  const handlePurchase = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await purchaseLiveLounge(password);
      if (res.success && res.user) {
        onUserUpdated?.(res.user);
        confetti({ particleCount: 80, spread: 90, origin: { y: 0.5 } });
        setUnlocked(true);
      } else {
        setError(res.error || 'Could not complete the purchase.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    if (!couponCode.trim() || !password || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await redeemLiveLoungeCoupon(couponCode.trim(), password);
      if (res.success && res.user) {
        onUserUpdated?.(res.user);
        confetti({ particleCount: 80, spread: 90, origin: { y: 0.5 } });
        setUnlocked(true);
      } else {
        setError(res.error || 'Could not redeem that coupon.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAskFriend = async () => {
    if (!friend || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await requestFriendPayment(friend.id, 'live_lounge');
      if (res.success) {
        setAskSent(true);
      } else {
        setError(res.error || 'Could not send that request.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (roomFlow) {
    return (
      <LiveLoungeRoomView
        currentUser={currentUser}
        mode={roomFlow}
        allUsers={allUsers}
        initialRoomId={resumeRoomId}
        onClose={() => { setRoomFlow(null); setResumeRoomId(undefined); }}
      />
    );
  }

  if (mode === 'history') {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <button onClick={() => setMode('menu')} aria-label="Back" className="p-2 -ml-2 rounded-full hover:bg-zinc-900 text-white cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
          <h2 className="text-sm font-bold text-white">Meeting history</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 max-w-lg w-full mx-auto space-y-2">
          {loadingHistory ? (
            <p className="text-xs text-zinc-500 text-center py-8">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-8">No Live Lounge rooms hosted or joined yet.</p>
          ) : (
            history.map((h) => (
              <div key={h.roomId + h.joinedAt} className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{h.title || 'Live Lounge room'}</p>
                  <p className="text-[10px] text-zinc-500">{h.role === 'host' ? 'You hosted' : 'You joined'} · {new Date(h.joinedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${h.roomStatus === 'active' ? 'bg-emerald-500/20 text-[#00FF66]' : 'bg-zinc-800 text-zinc-400'}`}>
                  {h.roomStatus === 'active' ? 'Live' : 'Ended'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (unlocked || alreadyUnlocked) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center px-6 text-center gap-4">
        <button onClick={onClose} className="absolute top-4 left-4 text-zinc-400 hover:text-white p-2"><ArrowLeft className="w-5 h-5" /></button>
        <button onClick={() => setMode('history')} className="absolute top-4 right-4 text-zinc-400 hover:text-white p-2" aria-label="Meeting history"><History className="w-5 h-5" /></button>
        <div className="w-16 h-16 rounded-full bg-purple-500/15 border border-purple-500/40 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-white text-lg font-bold">NOOB Live Lounge is unlocked!</h2>
        <p className="text-zinc-400 text-xs max-w-xs">
          Go live from the + page any time, or start/join a Live Lounge meeting room below — this unlock is forever, so you won't need to pay again.
        </p>
        {pendingInvites.length > 0 && (
          <div className="w-full max-w-sm space-y-2">
            {pendingInvites.map((inv) => (
              <button
                key={inv.roomId}
                onClick={() => { setResumeRoomId(inv.roomId); setRoomFlow('join'); }}
                className="w-full flex items-center gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-left animate-pulse"
              >
                <Bell className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="flex-1 text-xs text-amber-300"><b>@{inv.hostUsername}</b> invited you to "{inv.title || 'a Live Room'}"</span>
                <span className="text-[10px] font-bold text-amber-300">Join →</span>
              </button>
            ))}
          </div>
        )}
        <div className="w-full max-w-sm grid grid-cols-2 gap-3 mt-2">
          <button onClick={() => { setResumeRoomId(undefined); setRoomFlow('host'); }} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-purple-500/15 border border-purple-500/30">
            <Radio className="w-5 h-5 text-purple-300" />
            <span className="text-xs font-bold text-white">Start a Room</span>
          </button>
          <button onClick={() => { setResumeRoomId(undefined); setRoomFlow('join'); }} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <KeyRound className="w-5 h-5 text-zinc-300" />
            <span className="text-xs font-bold text-white">Join with Code</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col animate-in fade-in duration-150">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <button
          onClick={() => (mode === 'menu' ? onClose() : setMode('menu'))}
          aria-label="Go back"
          className="p-2 -ml-2 rounded-full hover:bg-zinc-900 text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-sm font-bold text-white">NOOB Live Lounge</h2>
          <p className="text-[10px] text-zinc-500">Unlock Go Live + the Live Lounge meeting room, forever</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 max-w-lg w-full mx-auto space-y-5">
        {mode === 'menu' && (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-purple-600/15 via-fuchsia-600/10 to-zinc-900 border border-purple-500/30 p-5">
              <Sparkles className="w-7 h-7 text-purple-400 mb-2" />
              <p className="text-white text-base font-bold">One-time unlock, yours forever</p>
              <p className="text-zinc-400 text-xs mt-1">
                Go live to your followers with real-time chat, likes &amp; gifts — plus the Live Lounge meeting room (host up to 30+ people, screen share, whiteboard).
              </p>
              <p className="text-2xl font-black text-white mt-3">{formatNoobPoints(LIVE_LOUNGE_PRICE)} <span className="text-xs font-bold text-zinc-400">NOOB Points</span></p>
              <p className="text-[10px] text-zinc-500 mt-0.5">Your balance: {formatNoobPoints(balance)} pts</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMode('purchase')}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#00FF66]/10 hover:bg-[#00FF66]/15 border border-[#00FF66]/30 transition-colors cursor-pointer"
              >
                <Coins className="w-6 h-6 text-[#00FF66]" />
                <span className="text-xs font-bold text-white">Pay &amp; Purchase</span>
              </button>
              <button
                onClick={() => setMode('coupon')}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/30 transition-colors cursor-pointer"
              >
                <Ticket className="w-6 h-6 text-blue-400" />
                <span className="text-xs font-bold text-white">Use a Coupon</span>
              </button>
            </div>

            <button
              onClick={() => setMode('ask-friend')}
              className="w-full p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-3 transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <HeartHandshake className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold text-white block">Ask a friend to pay</span>
                <span className="text-[10px] text-zinc-400 block">They approve it from their Wallet — you get Live Lounge free</span>
              </div>
            </button>
          </>
        )}

        {mode === 'purchase' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-400">You'll pay</span>
              <span className="text-white font-black">{formatNoobPoints(LIVE_LOUNGE_PRICE)} pts</span>
            </div>
            {balance < LIVE_LOUNGE_PRICE && (
              <p className="text-[11px] text-amber-400 flex items-center gap-1.5 bg-amber-950/30 border border-amber-900/40 rounded-xl p-2.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> You only have {formatNoobPoints(balance)} points — try "Ask a friend to pay" instead, or use a coupon.
              </p>
            )}
            <div className="space-y-2">
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
                onKeyDown={(e) => { if (e.key === 'Enter' && password && !busy) handlePurchase(); }}
                placeholder="Password"
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-3 text-lg tracking-widest text-white placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-600 focus:outline-none focus:border-[#00FF66]/60"
              />
            </div>
            {error && <p className="text-[11px] text-rose-400 flex items-center gap-1.5 bg-rose-950/30 border border-rose-900/40 rounded-xl p-2.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}</p>}
            <button
              onClick={handlePurchase}
              disabled={!password || busy || balance < LIVE_LOUNGE_PRICE}
              className="w-full py-3 rounded-xl bg-[#00FF66] text-black font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {busy ? 'Processing…' : 'Confirm & Unlock'}
            </button>
          </div>
        )}

        {mode === 'coupon' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Coupon code</label>
              <input
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setError(''); }}
                placeholder="LOUNGE-XXXXXXXX"
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-3 text-sm font-bold tracking-wider text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60"
              />
            </div>
            <div className="space-y-2">
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
                onKeyDown={(e) => { if (e.key === 'Enter' && couponCode.trim() && password && !busy) handleRedeem(); }}
                placeholder="Password"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-3 text-lg tracking-widest text-white placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60"
              />
            </div>
            {error && <p className="text-[11px] text-rose-400 flex items-center gap-1.5 bg-rose-950/30 border border-rose-900/40 rounded-xl p-2.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}</p>}
            <button
              onClick={handleRedeem}
              disabled={!couponCode.trim() || !password || busy}
              className="w-full py-3 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {busy ? 'Redeeming…' : 'Redeem Coupon'}
            </button>
          </div>
        )}

        {mode === 'ask-friend' && (
          askSent ? (
            <div className="flex flex-col items-center text-center gap-3 py-8">
              <CheckCircle2 className="w-10 h-10 text-[#00FF66]" />
              <p className="text-white text-sm font-bold">Request sent to @{friend?.username}</p>
              <p className="text-zinc-400 text-xs max-w-xs">They'll see it in their Wallet's Payment Requests. Live Lounge unlocks the moment they approve it.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {friend ? (
                <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-amber-500/40 rounded-2xl">
                  <img src={friend.avatar || '/noob-logo.svg.jpeg'} alt={friend.username} className="w-10 h-10 rounded-full object-cover border border-zinc-700" referrerPolicy="no-referrer" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-white block truncate">{friend.displayName}</span>
                    <span className="text-[10px] text-zinc-400 block truncate">@{friend.username}</span>
                  </div>
                  <button onClick={() => setFriend(null)} className="text-[11px] font-bold text-zinc-400 hover:text-white px-2 py-1 cursor-pointer">Change</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
                    <Search className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      value={friendQuery}
                      onChange={(e) => setFriendQuery(e.target.value)}
                      placeholder="Search by username"
                      autoFocus
                      className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-zinc-900 divide-y divide-zinc-900">
                    {candidates.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-4 text-center">No matching users.</p>
                    ) : (
                      candidates.map((u) => (
                        <button key={u.id} onClick={() => setFriend(u)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900 transition-colors cursor-pointer text-left">
                          <img src={u.avatar || '/noob-logo.svg.jpeg'} alt={u.username} className="w-9 h-9 rounded-full object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white block truncate">{u.displayName}</span>
                            <span className="text-[10px] text-zinc-500 block truncate">@{u.username}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
              {error && <p className="text-[11px] text-rose-400 flex items-center gap-1.5 bg-rose-950/30 border border-rose-900/40 rounded-xl p-2.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}</p>}
              <button
                onClick={handleAskFriend}
                disabled={!friend || busy}
                className="w-full py-3 rounded-xl bg-amber-500 text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Users className="w-4 h-4" /> {busy ? 'Sending…' : friend ? `Ask @${friend.username} to pay` : 'Ask a friend to pay'}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
};
