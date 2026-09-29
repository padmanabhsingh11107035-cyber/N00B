import React, { useState } from 'react';
import { ArrowLeft, Coins, Search, Send, CheckCircle2, AlertCircle, QrCode, Lock, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { User } from '../../types';
import { transferNoobPoints, fetchUsers } from '../../services/api';
import { formatNoobPoints, formatPaymentId } from '../../utils/formatPoints';
import { QrScannerModal } from '../Common/QrScannerModal';
import confetti from 'canvas-confetti';

interface SendPointsPageProps {
  currentUser: User;
  allUsers: User[];
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

const QUICK_AMOUNTS = [50, 100, 500, 1000];

// Reads the username out of a scanned NOOB profile QR code — the exact link ProfileQrModal.tsx generates,
// "<origin><path>?profile=<username>" — so this only ever accepts a real NOOB profile QR, not just anything.
function usernameFromScannedQr(text: string): string | null {
  try {
    const url = new URL(text);
    const username = url.searchParams.get('profile');
    return username ? username.trim() : null;
  } catch {
    return null;
  }
}

interface SentPayment {
  recipient: User;
  amount: number;
  note: string;
  transferId?: string;
  at: string;
}

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
  const [successState, setSuccessState] = useState<SentPayment | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [resolvingQr, setResolvingQr] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  // The UPI-style final step — amount and recipient are locked in; only the sender's own password
  // confirms the payment.
  const [confirmingWithPassword, setConfirmingWithPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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

  const handleScanned = async (decodedText: string) => {
    setShowScanner(false);
    const username = usernameFromScannedQr(decodedText);
    if (!username) {
      setErrorMessage("That doesn't look like a NOOB profile QR code.");
      return;
    }
    if (username.toLowerCase() === currentUser.username.toLowerCase()) {
      setErrorMessage('That\'s your own QR code — choose someone else to send points to.');
      return;
    }
    setErrorMessage('');
    setResolvingQr(true);
    try {
      const cached = allUsers.find((u) => u.username.toLowerCase() === username.toLowerCase());
      const found = cached || (await fetchUsers(username)).find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!found) {
        setErrorMessage(`Could not find @${username} on NOOB.`);
        return;
      }
      setRecipient(found);
    } finally {
      setResolvingQr(false);
    }
  };

  const handleSend = async () => {
    if (!recipient || !isValidAmount || exceedsBalance || !password) return;
    setIsSending(true);
    setErrorMessage('');
    try {
      const res = await transferNoobPoints({
        recipientId: recipient.id,
        amount: parsedAmount,
        password,
        note: note.trim() || undefined
      });
      if (res.success && res.user) {
        onUserUpdated?.(res.user);
        confetti({ particleCount: 40, spread: 65, origin: { y: 0.6 } });
        setSuccessState({ recipient, amount: parsedAmount, note: note.trim(), transferId: res.transferId, at: new Date().toISOString() });
        setConfirmingWithPassword(false);
        setPassword('');
        setShowPassword(false);
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
    setConfirmingWithPassword(false);
    setPassword('');
    setShowPassword(false);
  };

  const copyPaymentId = () => {
    if (!successState?.transferId) return;
    navigator.clipboard?.writeText(formatPaymentId(successState.transferId)).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }).catch(() => undefined);
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col animate-in fade-in duration-150">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <button
          onClick={() => (confirmingWithPassword ? setConfirmingWithPassword(false) : onClose())}
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
          <div className="space-y-5 py-4">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-[#00FF66]/15 border border-[#00FF66]/40 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-[#00FF66]" />
              </div>
              <div>
                <h3 className="text-white text-lg font-bold">Payment Successful</h3>
                <p className="text-zinc-400 text-xs mt-1">
                  {successState.amount.toLocaleString()} NOOB Points sent to @{successState.recipient.username}
                </p>
              </div>
            </div>

            {/* Receipt */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl overflow-hidden">
              {successState.transferId && (
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900">
                  <span className="text-[11px] text-zinc-400 font-bold">Payment ID</span>
                  <button
                    onClick={copyPaymentId}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-[#00FF66] hover:underline cursor-pointer"
                  >
                    {formatPaymentId(successState.transferId)}
                    {copiedId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
              <div className="p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">To</span>
                  <div className="flex items-center gap-1.5">
                    <img src={successState.recipient.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-4 h-4 rounded-full object-cover" referrerPolicy="no-referrer" />
                    <span className="text-white font-bold">{successState.recipient.displayName || successState.recipient.username}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Amount</span>
                  <span className="text-[#00FF66] font-black">{successState.amount.toLocaleString()} pts</span>
                </div>
                {successState.note && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-400 shrink-0">Note</span>
                    <span className="text-white text-right truncate">{successState.note}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Date &amp; Time</span>
                  <span className="text-white">{new Date(successState.at).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <span className="text-zinc-400">Status</span>
                  <span className="text-[#00FF66] font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Success</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 w-full pt-1">
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
        ) : confirmingWithPassword && recipient ? (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <img
                src={recipient.avatar || '/noob-logo.svg.jpeg'}
                alt={recipient.username}
                className="w-16 h-16 rounded-full object-cover border-2 border-[#00FF66]"
                referrerPolicy="no-referrer"
              />
              <div>
                <p className="text-xs text-zinc-400">You're sending</p>
                <p className="text-3xl font-black text-white">{parsedAmount.toLocaleString()} <span className="text-sm font-bold text-amber-400">pts</span></p>
                <p className="text-xs text-zinc-400">to @{recipient.username}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> Enter your password to confirm
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {showPassword ? 'HIDE' : 'SHOW'}
                </button>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrorMessage(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && password && !isSending) handleSend(); }}
                placeholder="Password"
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-3 text-lg tracking-widest text-white placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-600 focus:outline-none focus:border-[#00FF66]/60"
              />
            </div>

            {errorMessage && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1.5 bg-rose-950/30 border border-rose-900/40 rounded-xl p-2.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errorMessage}
              </p>
            )}

            <button
              onClick={handleSend}
              disabled={!password || isSending}
              className="w-full py-3 rounded-xl bg-[#00FF66] text-black font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {isSending ? 'Sending...' : 'Confirm & Send'}
            </button>
          </div>
        ) : (
          <>
            {/* Recipient */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                  Send To
                </label>
                {!recipient && (
                  <button
                    onClick={() => setShowScanner(true)}
                    disabled={resolvingQr}
                    className="text-[11px] font-bold text-[#00FF66] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <QrCode className="w-3.5 h-3.5" /> {resolvingQr ? 'Looking up...' : 'Scan QR'}
                  </button>
                )}
              </div>
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
              onClick={() => setConfirmingWithPassword(true)}
              disabled={!recipient || !isValidAmount || exceedsBalance}
              className="w-full py-3 rounded-xl bg-[#00FF66] text-black font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-400 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              {recipient ? `Send to @${recipient.username}` : 'Send Points'}
            </button>
          </>
        )}
      </div>

      {showScanner && <QrScannerModal onClose={() => setShowScanner(false)} onScanned={handleScanned} />}
    </div>
  );
};
