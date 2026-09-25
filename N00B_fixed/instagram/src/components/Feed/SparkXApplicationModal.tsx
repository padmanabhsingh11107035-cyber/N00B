import React, { useState } from 'react';
import { X, Rocket, CheckCircle2, Loader2 } from 'lucide-react';
import { submitSparkXApplication, notifySparkxRegistered } from '../../services/api';

interface SparkXApplicationModalProps {
  onClose: () => void;
}

const GRADES = ['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

export const SparkXApplicationModal: React.FC<SparkXApplicationModalProps> = ({ onClose }) => {
  const [fullName, setFullName] = useState('');
  const [grade, setGrade] = useState(GRADES[0]);
  const [schoolName, setSchoolName] = useState('');
  const [contribution, setContribution] = useState('');
  const [aiKnowledge, setAiKnowledge] = useState('');
  const [experience, setExperience] = useState('');
  const [availability, setAvailability] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !schoolName.trim() || !contribution.trim() || !aiKnowledge.trim()) {
      setError('Please fill in your name, school, what you can contribute, and what you know about AI.');
      return;
    }
    setSubmitting(true);
    setError('');
    const res = await submitSparkXApplication({ fullName, grade, schoolName, contribution, aiKnowledge, experience, availability, contact });
    setSubmitting(false);
    if (res.success) {
      setDone(true);
      if (res.application?.id) void notifySparkxRegistered(res.application.id);
    } else {
      setError(res.error || 'Could not submit your application.');
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-zinc-950 border border-orange-500/30 rounded-3xl shadow-2xl max-h-[88vh] overflow-y-auto">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-950 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
              <Rocket className="w-4.5 h-4.5 text-orange-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Join Our SparkX Team</h2>
              <p className="text-[10px] text-zinc-500">IIT Bombay Techfest — National AI Challenge</p>
            </div>
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
              Thanks for wanting to represent our school at SparkX. We'll review your application and get back to you — you'll also get an email confirming we received it.
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
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Your grade *</label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Your school *</label>
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="School name"
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">What can you contribute to the team? *</label>
              <textarea
                value={contribution}
                onChange={(e) => setContribution(e.target.value)}
                rows={3}
                placeholder="e.g. coding, hardware/IoT wiring, presenting, research, design, project management..."
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-orange-400 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">What do you know about AI? *</label>
              <textarea
                value={aiKnowledge}
                onChange={(e) => setAiKnowledge(e.target.value)}
                rows={3}
                placeholder="Tell us about any AI concepts, tools, or platforms you've used or learned about..."
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-orange-400 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Past projects or hackathons</label>
              <textarea
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                rows={2}
                placeholder="Any relevant projects, competitions or experience (optional)"
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-orange-400 resize-none"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Availability</label>
              <input
                type="text"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
                placeholder="e.g. weekends and after school (optional)"
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Best way to reach you</label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email or phone, or leave blank to use your NOOB chat (optional)"
                className="w-full bg-zinc-900 text-sm text-white px-3.5 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
              />
            </div>

            {error && <p className="text-xs text-red-400 font-medium">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white text-xs font-bold rounded-2xl cursor-pointer transition-colors flex items-center justify-center gap-2"
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
