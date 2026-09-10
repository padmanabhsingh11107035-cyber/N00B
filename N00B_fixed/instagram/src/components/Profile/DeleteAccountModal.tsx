import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface DeleteAccountModalProps {
  username: string;
  onClose: () => void;
  onDeleteMyAccount: (password: string) => Promise<{ success: boolean; message?: string; error?: string }>;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ username, onClose, onDeleteMyAccount }) => {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = password.trim().length > 0 && confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setError('');
    setLoading(true);
    try {
      const res = await onDeleteMyAccount(password);
      if (!res.success) {
        setError(res.error || 'Failed to delete account. Please try again.');
        setLoading(false);
      }
      // On success, the parent logs the user out — this modal unmounts
      // along with the rest of the authenticated app.
    } catch (err: any) {
      setError(err?.message || 'Failed to delete account. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-zinc-950 border border-red-500/30 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-4.5 h-4.5 text-red-400" />
            </div>
            <h2 className="text-base font-bold text-white tracking-tight">Delete Account</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-900 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-1.5">
          <p className="text-xs font-bold text-red-300">This permanently deletes @{username} and cannot be undone.</p>
          <ul className="text-[11px] text-red-300/80 list-disc pl-4 space-y-0.5">
            <li>All your posts, reels, stories, and comments will be removed</li>
            <li>Your messages will be removed from every chat</li>
            <li>Your followers/following connections will be removed</li>
            <li>Your username will be freed for someone else to use</li>
          </ul>
        </div>

        <form onSubmit={handleDelete} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Confirm your password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Account password"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">
              Type <span className="font-mono text-red-400">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
            />
          </div>

          {error && (
            <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {loading ? 'Deleting...' : 'Delete Forever'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
