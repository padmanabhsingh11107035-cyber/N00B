import React, { useState } from 'react';
import { ArrowLeft, Coins, Search, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { User } from '../../types';
import { transferNoobPoints } from '../../services/api';
import { formatNoobPoints } from '../../utils/formatPoints';
import confetti from 'canvas-confetti';

interface SendPointsPageProps {
  currentUser: User;
  allUsers: User[];
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

const QUICK_AMOUNTS = [50, 100, 500, 1000];

export const SendPointsPage: React.FC<SendPointsPageProps> = ({
  currentUser,
  allUsers,
  onClose,
  onUserUpdated
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [recipient, setRecipient] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successState, setSuccessState] = useState<{ recipient: User; amount: number } | null>(null);

  const balance = currentUser.noobPoints || 0;
  const query = searchQuery.trim().toLowerCase();
  const candidates = allUsers
    .filter((u) => u.id !== currentUser.id && !u.isAi)
    .filter((u) =>
      query
        ? u.username.toLowerCase().includes(query) || u.displayName?.toLowerCase().includes(query)
        : true
    )
    .slice(0, 30);

  const parsedAmount = Math.floor(Number(amount));
  const isValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const exceedsBalance = isValidAmount && parsedAmount > balance;

  const handleSend = async () => {
    if (!recipient || !isValidAmount || exceedsBalance) return;
    setIsSending(true);
    setErrorMessage('');
    try {
      const res = await transferNoobPoints({
        recipientId: recipient.id,
        amount: parsedAmount,
        note: note.trim() || undefined
      });
      if (res.success && res.user) {
        onUserUpdated?.(res.user);
        confetti({ particleCount: 40, spread: 65, origin: { y: 0.6 } });
        setSuccessState({ recipient, amount: parsedAmount });
      } else {
        setErrorMessage(res.error || 'Could not send points. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Could not send points. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const resetForAnother = () => {
    setSuccessState(null);
    setRecipient(null);
    setAmount('');
    setNote('');
    setSearchQuery('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col animate-in fade-in duration-150">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <button
          onClick={onClose}
          aria-label="Go back"
          className="p-2 -ml-2 rounded-full hover:bg-zinc-900 text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-sm font-bold text-white">Send NOOB Points</h2>
          <p className="text-[10px] text-zinc-500">Your balance: {formatNoobPoints(balance)} pts</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 max-w-lg w-full mx-auto space-y-5">
        {successState ? (
          <div className="flex flex-col items-center text-center gap-4 py-10">
            <div className="w-16 h-16 rounded-full bg-[#00FF66]/15 border border-[#00FF66]/40 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-[#00FF66]" />
            </div>
            <div>
              <h3 className="text-white text-lg font-bold">Points Sent!</h3>
              <p className="text-zinc-400 text-xs mt-1">
                {successState.amount.toLocaleString()} NOOB Points sent to @{successState.recipient.username}
              </p>
            </div>
            <div className="flex gap-2.5 w-full max-w-xs pt-2">
              <button
                onClick={resetForAnother}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-bold hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Send Another
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-[#00FF66] text-black text-xs font-bold hover:bg-emerald-400 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Recipient */}
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Send To
              </label>
              {recipient ? (
                <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-[#00FF66]/40 rounded-2xl">
                  <img
                    src={recipient.avatar || '/noob-logo.svg.jpeg'}
                    alt={recipient.username}
                    className="w-10 h-10 rounded-full object-cover border border-zinc-700"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-white block truncate">{recipient.displayName}</span>
                    <span className="text-[10px] text-zinc-400 block truncate">@{recipient.username}</span>
                  </div>
                  <button
                    onClick={() => setRecipient(null)}
                    className="text-[11px] font-bold text-zinc-400 hover:text-white px-2 py-1 cursor-pointer"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
                    <Search className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by username"
                      className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-zinc-900 divide-y divide-zinc-900">
                    {candidates.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-4 text-center">No matching users.</p>
                    ) : (
                      candidates.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => setRecipient(u)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900 transition-colors cursor-pointer text-left"
                        >
                          <img
                            src={u.avatar || '/noob-logo.svg.jpeg'}
                            alt={u.username}
                            className="w-9 h-9 rounded-full object-cover border border-zinc-800"
                            referrerPolicy="no-referrer"
                          />
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
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Amount to Send
              </label>
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 focus-within:border-[#00FF66]/60">
                <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-transparent text-sm font-bold text-white placeholder:text-zinc-600 focus:outline-none"
                />
                <span className="text-[10px] text-zinc-500 font-bold shrink-0">pts</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setAmount(String(q))}
                    className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-300 hover:border-[#00FF66]/50 hover:text-white transition-colors cursor-pointer"
                  >
                    {q.toLocaleString()}
                  </button>
                ))}
                <button
                  onClick={() => setAmount(String(balance))}
                  disabled={balance <= 0}
                  className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-300 hover:border-[#00FF66]/50 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                >
                  Max
                </button>
              </div>
              {exceedsBalance && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> You only have {balance.toLocaleString()} points.
                </p>
              )}
            </div>

            {/* Note */}
            <div className="space-y-2">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                Note (optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 140))}
                placeholder="e.g. thanks for the help!"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#00FF66]/60"
              />
            </div>

            {errorMessage && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1.5 bg-rose-950/30 border border-rose-900/40 rounded-xl p-2.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
              </p>
            )}

            <button
              onClick={handleSend}
              disabled={!recipient || !isValidAmount || exceedsBalance || isSending}
              className="w-full py-3 rounded-xl bg-[#00FF66] text-black font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {isSending ? 'Sending...' : recipient ? `Send to @${recipient.username}` : 'Send Points'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
