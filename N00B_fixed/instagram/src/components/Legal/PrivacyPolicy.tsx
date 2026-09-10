import React from 'react';
import { ShieldCheck, Lock, Eye, ArrowLeft, X, Database, Bell, CheckCircle2, Trash2, Users } from 'lucide-react';

interface PrivacyPolicyProps {
  onClose: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative my-auto max-h-[90vh] flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center text-[#00FF66]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">NOOB Privacy Policy</h2>
              <p className="text-xs text-zinc-400">Last Updated: September 2026 • Privacy First</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto pr-2 my-4 space-y-5 text-xs text-zinc-300 leading-relaxed scrollbar-thin scrollbar-thumb-zinc-700">
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-[#00FF66] font-bold text-sm">
              <Lock className="w-4 h-4" />
              <span>Your Privacy Matters at NOOB</span>
            </div>
            <p>
              NOOB is committed to protecting your personal information while providing an enjoyable, fun, and safe
              space to connect with friends, creators, and new people. This Privacy Policy details the information we collect,
              how it is used, and how you retain total control over your data.
            </p>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-[#00FF66]" />
              1. Information We Collect
            </h3>
            <p>We collect information provided directly when you register and interact on NOOB:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li><strong className="text-white">Account Details:</strong> First name, last name, user ID handle, email, country, and mobile contact number.</li>
              <li><strong className="text-white">Profile Data:</strong> Avatar image, bio tagline, status notes, and customizable preferences.</li>
              <li><strong className="text-white">User-Created Content:</strong> Posts, stories, reels, captions, comments, and direct messages you post.</li>
              <li><strong className="text-white">Device Contacts (native app only, opt-in):</strong> If you choose to use "Find Friends," the app reads your phone's contact numbers on-device and sends them to our server once to check for matching NOOB accounts. We never store your contact list — matching happens in real time, and no phone number that isn't already yours or another NOOB member's is ever saved or shared.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-[#00FF66]" />
              2. How We Use Your Information
            </h3>
            <p>Your data is used strictly for core social interaction functions:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>To let other registered users find and connect with you on the Explore directory.</li>
              <li>To deliver real-time messages, comments, likes, and story reactions.</li>
              <li>To personalize your feed, search suggestions, and explore feed.</li>
              <li>To safeguard against spam, unauthorized access, and malicious activity.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#00FF66]" />
              3. Data Protection & Security
            </h3>
            <p>
              We implement industry-standard encryption for sensitive credentials and messages. We do NOT sell your
              personal contact information or phone number to third-party marketing brokers.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00FF66]" />
              4. Sharing & Third Parties
            </h3>
            <p>
              We do not sell your personal data. Uploaded media (photos, videos, audio) is stored with our cloud
              storage provider (Backblaze B2) solely to serve it back to the app. Our AI Customer Support feature
              sends only the text of your support question to our AI provider (Groq) to generate a reply — it never
              receives your password, email, or phone number.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#00FF66]" />
              5. Your Controls
            </h3>
            <p>
              You can inspect or export a copy of your profile data at any time from Profile → Settings → Export Data.
              You can edit your profile, bio, and privacy preferences at any time from Profile → Settings.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-[#00FF66]" />
              6. Deleting Your Account
            </h3>
            <p>
              You can permanently delete your NOOB account at any time, without contacting support, from
              <strong className="text-white"> Profile → Settings → Danger Zone → Delete My Account Permanently</strong>.
              This requires your password to confirm and immediately and permanently removes your account, profile,
              posts, reels, stories, comments, messages, and uploaded media, and detaches you from other users'
              followers/following lists. This action cannot be undone and is not recoverable.
            </p>
          </section>
        </div>

        {/* Footer Action */}
        <div className="pt-4 border-t border-white/10 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-[#00FF66] text-black font-bold text-xs hover:bg-emerald-400 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Understood & Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};
