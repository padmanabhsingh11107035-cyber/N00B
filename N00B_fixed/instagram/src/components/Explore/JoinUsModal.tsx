import React, { useState } from 'react';
import { X, Briefcase, CheckCircle2, Loader2 } from 'lucide-react';
import { submitTeamApplication } from '../../services/api';

interface JoinUsModalProps {
  onClose: () => void;
}

const ROLES = ['Moderator', 'Community Manager', 'Developer', 'Designer', 'Content Creator', 'Other'];

export const JoinUsModal: React.FC<JoinUsModalProps> = ({ onClose }) => {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [why, setWhy] = useState('');
  const [experience, setExperience] = useState('');
  const [availability, setAvailability] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !why.trim()) {
      setError('Please fill in your name and why you want to join.');
      return;
    }
    setSubmitting(true);
    setError('');
    const res = await submitTeamApplication({ fullName, role, why, experience, availability, contact });
    setSubmitting(false);
    if (res.success) setDone(true);
    else setError(res.error || 'Could not submit your application.');
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-zinc-950 border border-violet-500/30 rounded-3xl shadow-2xl max-h-[88vh] overflow-y-auto">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-950 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
              <Briefcase className="w-4.5 h-4.5 text-violet-300" />
            </div>
            <h2 className="text-sm font-bold text-white">Apply to Join the NOOB Team</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-[#00FF66] mx-auto" />
            <h3 className="text-sm font-bold text-white">Application submitted!</h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
              Thanks for wanting to help build NOOB. The admin team will review your application.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2.5 bg-[#00FF66] text-black text-xs font-bold rounded-xl cursor-pointer hover:opacity-90"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Your name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-violet-400"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Role you're interested in *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-violet-400"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Why do you want to join? *</label>
              <textarea
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                rows={3}
                placeholder="Tell us what draws you to NOOB..."
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-violet-400 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Relevant experience</label>
              <textarea
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                rows={2}
                placeholder="Any past experience worth mentioning (optional)"
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-violet-400 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Availability</label>
              <input
                type="text"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                placeholder="e.g. a few hours on weekends (optional)"
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-violet-400"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Best way to reach you</label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email, phone, or leave blank to use your NOOB chat (optional)"
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-violet-400"
              />
            </div>

            {error && <p className="text-xs text-red-400 font-medium">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white text-xs font-bold rounded-2xl cursor-pointer transition-colors flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
