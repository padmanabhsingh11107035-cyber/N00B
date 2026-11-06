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
              <p className="text-xs text-zinc-400">Effective Date: November 2026 • Version 1.1</p>
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
              You may edit your bio and profile picture, or delete your account and all its data anytime (Settings and activity, then Your NOOB account, then Delete account).
              NOOB may update these Terms periodically, and continued use constitutes acceptance of updated terms.
            </p>
          </section>

          <section className="space-y-2" data-testid="legal-new-0">
            <h3 className="text-sm font-bold text-white">Our apps</h3>
            <p dangerouslySetInnerHTML={{ __html: "NOOB is a website and web app at <b>noobsocials.com</b> and an Android app from <b>Google Play</b>. These Terms apply to all of them. On Android the app can ask for permissions: <b>location</b> (Family Map), <b>camera and microphone</b> (photos, videos, voice messages, calls, live video), <b>contacts</b> (Find friends), <b>photos and files</b> (what you choose to upload) and <b>notifications</b>. You can say no to any of them: only the feature that needs it stays off." }} />
          </section>

          <section className="space-y-2" data-testid="legal-new-1">
            <h3 className="text-sm font-bold text-white">Your account</h3>
            <p dangerouslySetInnerHTML={{ __html: "One account is for one person. You are responsible for what happens in it, so keep your password to yourself and tell us at once if someone else got in (Help, or the grievance form). NOOB may remove content, warn, suspend or close an account that breaks these Terms or the law, or that puts other people at risk. You can delete your own account at any time (Settings and activity, then Your NOOB account, then Delete account)." }} />
          </section>

          <section className="space-y-2" data-testid="legal-new-2">
            <h3 className="text-sm font-bold text-white">NOOB Pro and Ads</h3>
            <p dangerouslySetInnerHTML={{ __html: "<b>NOOB Pro</b> is a plan you pay for with noobs, never with money; what a plan includes and costs is shown before you choose it, and it can change for the future. <b>Ads</b> are for business accounts: applying is free, and an ad is shown only after NOOB approves it. NOOB can refuse, pause or remove an ad, or switch ads off, at any time." }} />
          </section>

          <section className="space-y-2" data-testid="legal-new-3">
            <h3 className="text-sm font-bold text-white">Family Map: your duty</h3>
            <p dangerouslySetInnerHTML={{ __html: "Share your place only with people who know and agree, and never use Family Map to follow, watch or frighten someone. Whoever has a room&apos;s code can join it until the owner locks it, so give the code only to people you trust. Family Map is <b>not an emergency or safety service</b>: it can be late, wrong or off, so never depend on it where a life or safety is involved." }} />
          </section>

          <section className="space-y-2" data-testid="legal-new-4">
            <h3 className="text-sm font-bold text-white">What we cannot promise</h3>
            <p dangerouslySetInnerHTML={{ __html: "NOOB is made by students and is provided <b>as it is</b>. It can be slow, change or be down for a while, and we cannot promise that nothing is ever lost, so keep your own copy of what matters to you (Download your information). As far as the law allows, the NOOB developers are not responsible for indirect loss or for what other people post or do. Nothing here takes away a right the law gives you." }} />
          </section>

          <section className="space-y-2" data-testid="legal-new-5">
            <h3 className="text-sm font-bold text-white">Changes to these Terms</h3>
            <p dangerouslySetInnerHTML={{ __html: "When these Terms change, the date and version at the top change, and for a big change we tell you inside NOOB. If you keep using NOOB after a change, you accept it; if you do not agree, you can delete your account." }} />
          </section>

          <section className="space-y-2 [&_h4]:text-xs [&_h4]:font-bold [&_h4]:text-white [&_h4]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:text-zinc-400" data-testid="legal-data-inventory">
            <h3 className="text-sm font-bold text-white">What we ask you for and what the app reads</h3>
            <div dangerouslySetInnerHTML={{ __html: "<p>To use NOOB you agree to give true details and to let NOOB use them as the Privacy Policy lists.</p><ul><li><b>We ask you for:</b> name, user ID, email, mobile number and country, date of birth, gender, password, profile photo and bio when you sign up; optionally a city and where you heard about NOOB; delivery addresses for food orders; and details for business, ad or support requests.</li><li><b>The app reads by itself:</b> your device&apos;s operating system, battery level (where shared), browser and screen details, IP address and the approximate place (city, region, country) it shows, when you were last online and which devices are signed in. If you use Family Map and allow it, it also reads your phone&apos;s precise location, as the Privacy Policy explains.</li><li><b>You create:</b> posts, reels, videos, stories, Instants, comments, messages (end-to-end encrypted), notes, call lines and game results.</li><li><b>NOOB Forms:</b> if you make a form you are responsible for what it asks and for what you do with the answers. Do not ask for passwords, card numbers or other secrets, and tell people what the answers are for. People who answer a form need no account; their answers go to the form&apos;s owner, who becomes responsible for them.</li><li><b>Family Map:</b> use it only with people who know about it and agree. Everybody in a room must give their consent to being shown on the map, and you must not use it to follow, watch or find a person who has not agreed: that is not allowed and can end your account. A parent or guardian is responsible for a child&apos;s use of it and for talking with the child about it. You can pause sharing, leave a room or switch location off at any time. Family Map is a convenience, not an emergency or safety service: a place can be missing, late or wrong (phones, networks and batteries fail), so never rely on it in an emergency and call your local emergency number. The owner of a room is responsible for who they give its code to. The day report (where a person went today, deleted at midnight) is only for people who switch it on themselves: never switch it on for somebody else, and never ask or pressure somebody to switch it on.</li><li><b>We do not sell it, and it is not used for any other activity.</b> It is encrypted in transit and at rest, and deleting your account deletes it. The full list, the reasons and the companies that help us run NOOB are in the <b>Privacy Policy</b>.</li></ul>" }} />
          </section>

          <section className="space-y-2" data-testid="legal-trust-0">
            <h3 className="text-sm font-bold text-white">Who runs NOOB</h3>
            <p dangerouslySetInnerHTML={{ __html: "NOOB Socials is built and run by the <b>NOOB developers</b>, a team of students in India. NOOB is <b>not a registered company</b>, so there is no company name or company number to quote: this agreement is between you and the NOOB developers, represented by the NOOB administrator account in the app. NOOB is free to use. Complaints and the Grievance Officer are reached at <a href=\"/grievance.html\">noobsocials.com/grievance.html</a> (a form that needs no login and gives you a ticket number). These terms are governed by the laws of India." }} />
          </section>

          <section className="space-y-2" data-testid="legal-trust-1">
            <h3 className="text-sm font-bold text-white">Money, noobs, purchases and refunds</h3>
            <p dangerouslySetInnerHTML={{ __html: "NOOB takes <b>no card, bank or UPI payment</b> inside the app and holds no money for anyone. <b>noobs</b> (NOOB Points) are an in-app game currency: they have <b>no cash value</b>, cannot be withdrawn, sold or exchanged for money, and NOOB promises them no value; they are earned by using the app and spent on things inside it, such as NOOB Pro. A NOOB Pro payment gives you a receipt (an &quot;Order Successful&quot; screen with a receipt number); if a payment was taken twice or the plan was not given, send the receipt number through the grievance form within 15 days and the noobs or the plan are put right. The Shop and the Food Stall are run by the sellers who list there: you pay the seller directly (by UPI to the seller&apos;s own UPI ID, or cash on delivery or pickup), the address and phone number you give are used only to deliver that order, and refunds and returns are agreed with the seller. NOOB does not sell or deliver goods itself; if a seller does not deliver, report it through the grievance form and NOOB can remove the listing and the seller." }} />
          </section>

          <section className="space-y-2" data-testid="legal-trust-2">
            <h3 className="text-sm font-bold text-white">Encrypted chats and translation</h3>
            <p dangerouslySetInnerHTML={{ __html: "Chats are end-to-end encrypted: NOOB&apos;s servers keep only locked messages they cannot read. <b>Translate</b> is the one thing that makes a message leave your phone: when you tap Translate, your phone opens that one message and sends only its text to an AI language service (Groq) to be translated. NOOB does not store that text or its translation, but the service sees it for that moment, so a message you translate is not private from that service. If you never tap Translate, nothing is sent." }} />
          </section>

          <section className="space-y-2" data-testid="legal-trust-3">
            <h3 className="text-sm font-bold text-white">Young people, live video and location</h3>
            <p dangerouslySetInnerHTML={{ __html: "NOOB is meant for people aged 13 and over; people under 18 should use it with a parent or guardian&apos;s knowledge. Family Map, live streaming and chat are optional and off until you turn them on; Family Map shows your place only to the people in the rooms you chose, can be paused or deleted at any time, and is <b>not an emergency or safety service</b>. Report anything unsafe with the Report button or the grievance form: content about a person&apos;s private areas, or pretending to be them, is removed within 24 hours of that person&apos;s complaint." }} />
          </section>

          <section className="space-y-2" data-testid="legal-contact-rights">
            <h3 className="text-sm font-bold text-white">Contact, complaints and your rights</h3>
            <p dangerouslySetInnerHTML={{ __html: 'For any complaint about content or about your data, use the <b>Help</b> page inside NOOB (profile, then Settings and activity, then Help), the Suggestion Box, or the Grievance Officer&apos;s page at <a href="/grievance.html">noobsocials.com/grievance.html</a> (a form that needs no login and gives you a ticket number). NOOB&apos;s Grievance Officer (Padmanabh Singh Vaghela, email <a href=\"mailto:padmanabhsingh11107035@gmail.com\">padmanabhsingh11107035@gmail.com</a>, PIN code 382424, India) <b>acknowledges every complaint within 24 hours and resolves it within 15 days</b>; content that shows a person&apos;s private areas, or pretends to be them, is removed within 24 hours of a complaint by that person. You may at any time <b>see and correct</b> your details (Edit profile), <b>withdraw your consent</b>, and <b>delete your account and all your data</b> inside the app (profile, Settings and activity, Your NOOB account) or at noobsocials.com/data-deletion.html. If we do not act on a complaint you can complain to the Data Protection Board of India. NOOB is meant for people aged 13 and over.' }} />
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
