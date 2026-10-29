import React from 'react';
import { ShieldCheck, FileText, ArrowLeft, X, Sparkles, CheckCircle2, Lock, AlertTriangle } from 'lucide-react';

interface TermsAndConditionsProps {
  onClose: () => void;
}

export const TermsAndConditions: React.FC<TermsAndConditionsProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative my-auto max-h-[90vh] flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-noob/10 border border-noob/30 flex items-center justify-center text-noob">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">NOOB Terms & Conditions</h2>
              <p className="text-xs text-zinc-400">Effective Date: August 2026 • Version 1.0</p>
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
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Welcome to NOOB Community!</span>
            </div>
            <p>
              NOOB is a social interaction platform built for fun, creativity, and connecting people worldwide.
              By creating an account, registering your unique user ID, and accessing NOOB, you agree to comply with
              these General Terms & Conditions.
            </p>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-noob">1</span>
              User Eligibility & Registration
            </h3>
            <p>
              To access NOOB, you must provide accurate, current, and truthful registration information including your
              first name, last name, user ID handle, email, country, mobile number, and password.
              You are solely responsible for maintaining the confidentiality of your credentials.
            </p>
            <p>
              <strong className="text-white">You must be at least 13 years old</strong> to create a NOOB account. By
              registering, you confirm that you meet this minimum age requirement.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-noob">2</span>
              Friendly & Safe Community Standards
            </h3>
            <p>
              NOOB is designed for authentic entertainment, laughter, sharing real moments, and forming genuine friendships.
              The following behaviors are strictly prohibited:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>Harassment, hate speech, bullying, or abusive behavior toward any member.</li>
              <li>Impersonation, deceptive identity theft, or automated spam bots.</li>
              <li>Posting unlawful, harmful, sexually explicit, or infringing media content.</li>
            </ul>
            <p>
              You can report and block any account that violates these standards directly from their profile's "..."
              menu, or by contacting AI Customer Support. Reported accounts are reviewed by our Trust &amp; Safety
              team, and violations may result in content removal, suspension, or a permanent ban.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-noob">3</span>
              User Content Ownership & Rights
            </h3>
            <p>
              You retain all ownership rights to the photos, stories, reels, comments, and messages you create and post on NOOB.
              By sharing content, you grant NOOB a worldwide license to host, display, and distribute your content across our platform
              solely for providing the social experience.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-noob">4</span>
              Real User Interaction & Fair Use
            </h3>
            <p>
              NOOB promotes authentic real-user connections. Artificial manipulation of likes, views, followers, or chat spam
              is prohibited. We reserve the right to suspend accounts violating community safety guidelines.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] text-noob">5</span>
              Modifications & Account Deletion
            </h3>
            <p>
              You may edit your bio, update your profile picture, or delete your account data anytime through your profile settings.
              NOOB may update these Terms periodically, and continued use constitutes acceptance of updated terms.
            </p>
          </section>

          <section className="space-y-2 [&_h4]:text-xs [&_h4]:font-bold [&_h4]:text-white [&_h4]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:text-zinc-400" data-testid="legal-data-inventory">
            <h3 className="text-sm font-bold text-white">What we ask you for and what the app reads</h3>
            <div dangerouslySetInnerHTML={{ __html: "<p>To use NOOB you agree to give true details and to let NOOB use them as the Privacy Policy lists.</p><ul><li><b>We ask you for:</b> name, user ID, email, mobile number and country, date of birth, gender, password, profile photo and bio when you sign up; optionally a city and where you heard about NOOB; delivery addresses for food orders; and details for business, ad or support requests.</li><li><b>The app reads by itself:</b> your device&apos;s operating system, battery level (where shared), browser and screen details, IP address and the approximate place (city, region, country) it shows, when you were last online and which devices are signed in. If you use Family Map and allow it, it also reads your phone&apos;s precise location, as the Privacy Policy explains.</li><li><b>You create:</b> posts, reels, videos, stories, Instants, comments, messages (end-to-end encrypted), notes, call lines and game results.</li><li><b>NOOB Forms:</b> if you make a form you are responsible for what it asks and for what you do with the answers. Do not ask for passwords, card numbers or other secrets, and tell people what the answers are for. People who answer a form need no account; their answers go to the form&apos;s owner, who becomes responsible for them.</li><li><b>Family Map:</b> use it only with people who know about it and agree. Everybody in a room must give their consent to being shown on the map, and you must not use it to follow, watch or find a person who has not agreed: that is not allowed and can end your account. A parent or guardian is responsible for a child&apos;s use of it and for talking with the child about it. You can pause sharing, leave a room or switch location off at any time. Family Map is a convenience, not an emergency or safety service: a place can be missing, late or wrong (phones, networks and batteries fail), so never rely on it in an emergency and call your local emergency number. The owner of a room is responsible for who they give its code to.</li><li><b>We do not sell it, and it is not used for any other activity.</b> It is encrypted in transit and at rest, and deleting your account deletes it. The full list, the reasons and the companies that help us run NOOB are in the <b>Privacy Policy</b>.</li></ul>" }} />
          </section>

          <section className="space-y-2" data-testid="legal-contact-rights">
            <h3 className="text-sm font-bold text-white">Contact, complaints and your rights</h3>
            <p dangerouslySetInnerHTML={{ __html: 'For any complaint about content or about your data, use the <b>Help</b> page inside NOOB (profile, then Settings and activity, then Help) or the Suggestion Box. NOOB&apos;s Grievance Officer <b>acknowledges every complaint within 24 hours and resolves it within 15 days</b>; content that shows a person&apos;s private areas, or pretends to be them, is removed within 24 hours of a complaint by that person. You may at any time <b>see and correct</b> your details (Edit profile), <b>withdraw your consent</b>, and <b>delete your account and all your data</b> inside the app (profile, Settings and activity, Your NOOB account) or at noobsocials.com/data-deletion.html. If we do not act on a complaint you can complain to the Data Protection Board of India. NOOB is meant for people aged 13 and over.' }} />
          </section>
        </div>

        {/* Footer Action */}
        <div className="pt-4 border-t border-white/10 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-noob text-black font-bold text-xs hover:bg-emerald-400 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>I Understand & Agree</span>
          </button>
        </div>
      </div>
    </div>
  );
};
