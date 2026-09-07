import React from 'react';
import { ShieldCheck, Lock, Eye, ArrowLeft, X, Database, Bell, CheckCircle2 } from 'lucide-react';

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
              <p className="text-xs text-zinc-400">Last Updated: August 2026 • Privacy First</p>
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
              <Bell className="w-4 h-4 text-[#00FF66]" />
              4. User Controls & Deletion Rights
            </h3>
            <p>
              You have full rights to inspect, edit, or wipe your account and all associated posts, reels, and stories at any time
              through your profile settings or the 1-click database reset option.
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
