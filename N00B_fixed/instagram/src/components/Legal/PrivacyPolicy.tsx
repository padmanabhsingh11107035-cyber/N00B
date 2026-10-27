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
            <div className="w-10 h-10 rounded-2xl bg-noob/10 border border-noob/30 flex items-center justify-center text-noob">
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
            <div className="flex items-center gap-2 text-noob font-bold text-sm">
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
              <Database className="w-4 h-4 text-noob" />
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
              <Eye className="w-4 h-4 text-noob" />
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
              <Lock className="w-4 h-4 text-noob" />
              3. Data Protection & Security
            </h3>
            <p>
              We implement industry-standard encryption for sensitive credentials and messages. We do NOT sell your
              personal contact information or phone number to third-party marketing brokers.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-noob" />
              4. Sharing & Third Parties
            </h3>
            <p>
              We do not sell your personal data. Uploaded media (photos, videos, audio) is stored with a secure
              third-party cloud storage provider solely to serve it back to the app. Our AI Customer Support feature
              sends only the text of your support question to a third-party AI provider to generate a reply — it
              never receives your password, email, or phone number.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-noob" />
              5. Your Controls
            </h3>
            <p>
              You can inspect or export a copy of your profile data at any time from Profile → Settings → Export Data.
              You can edit your profile, bio, and privacy preferences at any time from Profile → Settings.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-noob" />
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

          <section className="space-y-2 [&_h4]:text-xs [&_h4]:font-bold [&_h4]:text-white [&_h4]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:text-zinc-400" data-testid="legal-data-inventory">
            <h3 className="text-sm font-bold text-white">Everything NOOB collects, why, and who helps us</h3>
            <div dangerouslySetInnerHTML={{ __html: "<p>This is the complete list of what NOOB asks you for, what you create, what the app reads by itself, and who helps us run it. If a new thing is ever added, it is added here first.</p><h4>1. What we ask you to give</h4><ul><li><b>Sign-up:</b> your name, a user ID, your email (confirmed with a code we email), your mobile number and country, your date of birth (13 to 82 years), your gender, a password (kept only as a one-way fingerprint, never readable), a profile photo and a bio. The <b>city</b> is optional.</li><li><b>Language and account type:</b> the language you choose, and whether the account is public, private or a business account (a business account also gives a business email, phone and address).</li><li><b>Where you heard about NOOB:</b> one optional answer, asked once after sign-up.</li><li><b>Food Stall orders:</b> delivery addresses (name of the place, details, map pin) and your phone number for the order.</li><li><b>Help:</b> what you write to Support, the Suggestion Box, reports you file, ad applications and the email you give for them.</li><li><b>Contacts (Android app only, only if you press Find friends):</b> the phone numbers in your contacts are read on your phone and matched to find friends.</li></ul><h4>2. What you create</h4><ul><li>Posts, reels, videos, stories, Instants, comments, likes, saves, follows, polls, highlights, Daily NOOB entries, game scores, NOOB Points and their history.</li><li><b>Messages:</b> chats are end-to-end encrypted between the people in them (voice messages, photos and videos you send in a chat are stored for that chat). Chat keys are kept on your device; an encrypted backup of the key is kept so you can sign in on another device.</li><li><b>Notepad:</b> the notes you write (text only), kept on your account and visible only to you.</li><li><b>NOOB Forms:</b> the forms you build (questions, design, settings) and the answers people send to them. People who fill a form do not need an account: their answers, and any file or signature they attach, go to the owner of the form and to the people the owner shares the form with. Files are kept in a private store. If the owner switches it on, the campaign tags in the link (utm_source, utm_medium, utm_campaign) are kept with the answer; nothing else about the visit is kept. The owner can delete answers at any time. If you made a form, deleting your account deletes it and its answers.</li><li><b>Call list:</b> who a call was with, when, and how long it lasted (never the sound of the call). You can delete your own lines.</li><li><b>Anonymous Messages and Ask Me Anything:</b> the questions and answers you send.</li><li><b>NOOB AI, the Study tutor and Support AI:</b> what you ask and the answers (the tutor also keeps your notes, materials, tests and progress). Pictures you send to the tutor go to the AI and are not stored.</li></ul><h4>3. What the app reads by itself</h4><ul><li><b>Device:</b> the operating system and version (for example Android 14), and the battery level in per cent and whether it is charging (only where your browser or phone shares it; an iPhone does not).</li><li><b>Browser and visit:</b> browser, device type, screen size, language, time zone, the page you came from, the first and last page you opened, and a random visitor number (also for people without an account).</li><li><b>Place:</b> your IP address and the approximate place worked out from it (city, region, country), and the city you typed.</li><li><b>Activity:</b> when you were last online, whether you are online now, which devices are signed in, your log-in history, which posts and reels you have already seen, and the address that lets us send you a notification.</li></ul><h4>4. Why, and what we never do</h4><p>We use all of this only to run NOOB: show you the right things, keep chats and accounts safe, find faults that only happen on some phones, stop spam and fake accounts, and let our administrators help you. <b>We do not sell it, we do not share it with advertisers or any other company, and it is not used for any other activity.</b> It is protected by HTTPS while it travels and is encrypted at rest in our database provider&apos;s storage; only NOOB&apos;s administrators can read what is not end-to-end encrypted. Deleting your account deletes it.</p><h4>5. Who helps us run NOOB (they only receive what the job needs)</h4><ul><li><b>Supabase</b>: database, sign-in and file storage. <b>Cloudflare</b>: the website, its cache, security, and anonymous traffic statistics.</li><li><b>Resend</b>: the emails we send you (codes, receipts, welcome).</li><li><b>Agora</b> and <b>Metered</b>: live video, calls and meeting rooms.</li><li><b>AI providers</b> (for example Groq, Google Gemini, OpenRouter): the text of your question to NOOB AI, the tutor or Support AI, and pictures you send to the tutor. <b>Tavily</b>: web search for the tutor&apos;s research.</li><li><b>NOOB Forms helpers:</b> only when a form owner presses an AI button, the words of that question (or, for a summary, the written answers of that form) are sent to an AI provider (for example Groq, Google Gemini or OpenRouter). If the owner adds a web hook, each new answer is sent to the web address the owner chose. Emails about new answers go to the owner only.</li><li><b>AudD</b>: a short sound sample when you use Search song. <b>Giphy</b>: the words you type to search GIFs. <b>OpenStreetMap</b>: the map when you pin an address. <b>YouTube</b>: videos shown inside NOOB. <b>Google Fonts</b>: letters.</li><li><b>Google, Apple, Facebook, Discord</b> and other sign-in buttons: only if you choose them.</li><li><b>Pwned Passwords</b>: when you choose a password, the first 5 characters of its fingerprint are checked against a public list of leaked passwords (the password itself never leaves your phone).</li></ul><h4>6. Storage on your device</h4><p>Your login, theme, language, chat keys and small settings are kept in your browser or app (cookies or local storage) so NOOB works; nothing is used to track you on other websites.</p>" }} />
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
            <span>Understood & Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};
