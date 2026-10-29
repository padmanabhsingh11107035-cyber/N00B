import React, { useEffect } from 'react';
import { Lock, LockOpen, KeyRound, ShieldCheck, Smartphone, Eye, AlertTriangle, CheckCircle2, X, Users, FileWarning, MapPin } from 'lucide-react';

interface EndToEndEncryptionProps {
  onClose: () => void;
}

// What "end-to-end encrypted" means in NOOB, written plainly and exactly as the app works: what is locked, what is not yet, who can and can not read
// a message, and the limits. It must stay true to src/e2ee/ (crypto.ts, service.ts): if the lock changes, this page changes with it.
export const EndToEndEncryption: React.FC<EndToEndEncryptionProps> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[140] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn" role="dialog" aria-modal="true" aria-label="End-to-end encryption">
      <div className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative my-auto max-h-[90vh] flex flex-col text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">End-to-End Encryption</h2>
              <p className="text-xs text-zinc-400">How NOOB keeps your private chats private</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto pr-2 my-4 space-y-5 text-xs text-zinc-300 leading-relaxed scrollbar-thin scrollbar-thumb-zinc-700">
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/25 space-y-2">
            <div className="flex items-center gap-2 text-blue-300 font-bold text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>In one sentence</span>
            </div>
            <p>
              A private message is locked on your phone before it leaves it, and it is unlocked only on the phones of the people in that chat.
              NOOB&apos;s servers only ever hold the locked version, so NOOB can not read it, and neither can anyone who breaks into those servers.
            </p>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-400" />
              1. How it works
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li><strong className="text-white">Every device has its own key.</strong> Your phone makes a private key when you first open NOOB. The private half stays on that device and is never sent to NOOB. Only the public half is shared, so friends&apos; phones can lock messages for you.</li>
              <li><strong className="text-white">Every message gets a new lock.</strong> Each message is locked with a fresh random 256-bit key (AES-GCM, a widely used, well-tested standard). That key is then locked separately for each device of each person in the chat, and for your own devices too.</li>
              <li><strong className="text-white">Nobody can fake a message in your name.</strong> A message also carries proof that it came from the sender&apos;s own device, so it can not be forged, not even by the server, and a message that has been changed on the way refuses to open.</li>
              <li><strong className="text-white">Standard tools only.</strong> NOOB uses the encryption built into your browser or phone (WebCrypto, P-256 keys). It does not use home-made cryptography.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              2. What is locked
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>Text messages in personal chats, and in groups of up to 100 people.</li>
              <li>GIFs and stickers sent in those chats.</li>
              <li>Edits to those messages, and the quoted text when you reply.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <LockOpen className="w-4 h-4 text-amber-300" />
              3. What is NOT locked (yet)
            </h3>
            <p>We would rather tell you than let you assume. These are <strong className="text-white">not</strong> end-to-end encrypted today:</p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li><strong className="text-white">Photos, videos and voice notes</strong> sent in chats. They are stored with our cloud storage provider and protected on their way, but they are not locked on your device first.</li>
              <li><strong className="text-white">Voice and video calls, live streams and rooms.</strong> They are protected while travelling over the internet, but they are not end-to-end encrypted.</li>
              <li><strong className="text-white">The public NOOB Lounge and public rooms.</strong> Everybody in them can read what is said, so they are not private.</li>
              <li><strong className="text-white">Chats with the NOOB AI</strong> and with Customer Support, which need to read your message to answer it.</li>
              <li><strong className="text-white">Groups of more than 100 people.</strong></li>
              <li><strong className="text-white">A chat where somebody has not opened the updated NOOB yet.</strong> Until everybody in it has opened the app once, messages are sent normally and the chat shows &ldquo;Not encrypted&rdquo;. It locks itself, for everyone, as soon as every member has opened the app.</li>
            </ul>
            <p>The top of every chat tells you the truth for that chat: <span className="text-blue-300 font-semibold">End-to-end encrypted</span> or <span className="text-amber-300 font-semibold">Not encrypted</span>. A chat that can be locked is never sent readable: if locking fails, the message fails instead of going out unlocked.</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-400" />
              4. What NOOB can and can not see
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li><strong className="text-white">Can not:</strong> read, search or recover the text of your locked messages, or hand them to anyone, because NOOB never has the keys.</li>
              <li><strong className="text-white">Can see:</strong> that an account exists, who is in a chat, and when a message was sent (it has to deliver it). Pictures, videos and voice notes, as above.</li>
              <li><strong className="text-white">The one exception: reports.</strong> If you report someone you have a chat with, your own phone, the only place that unlocked that chat, may attach a copy of the recent messages to your report, exactly like forwarding them to NOOB Admin by hand. This only happens when you file the report. It never gives NOOB a way to read a chat that was not reported.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-400" />
              5. Your keys, new phones and the backup
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>Your private keys live on your device only. Clearing all site data, or using a new phone, means the new device can not open <em>old</em> locked messages by itself.</li>
              <li>To keep old messages, make a <strong className="text-white">key backup</strong> from a chat&apos;s lock screen (&ldquo;My encryption keys &amp; backup&rdquo;). It is locked with a passphrase that only you know. <strong className="text-white">Nobody, including NOOB, can recover that passphrase for you.</strong> If you lose both your phone and the passphrase, old messages stay locked forever.</li>
              <li>Private browsing windows can not keep keys, so a chat can not be used for private messages from one.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              6. Check it is really them: the security code
            </h3>
            <p>
              Each chat has a <strong className="text-white">security code</strong> made from the keys of both people. If you read it out to your friend (in person or on a call) and the codes match, nobody sits in between. If a friend&apos;s keys change, for example because they got a new phone, NOOB tells you in the chat so you can check the new code.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-amber-300" />
              7. Honest limits
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>NOOB does not yet use a &ldquo;ratchet&rdquo; like Signal does. If somebody stole an unlocked phone together with its keys, they could open the messages stored for that phone.</li>
              <li>Encryption can not protect a chat from a person you sent it to (they can screenshot or share it), or from someone using your unlocked phone.</li>
              <li>Unless people compare their security codes, the server could in theory hand out a wrong public key. The code check in section 6 is what closes that gap.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-400" />
              8. Family Map places
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>Your place in a Family Map room is locked the same way as a message: on your phone, for the devices of the people in that room, before it is sent. NOOB&apos;s servers keep only the locked place and can not read where you are.</li>
              <li>What NOOB can still see: the room&apos;s name, who is in it, whether you are sharing, and when a place was last sent. Not where it was.</li>
              <li>The same honest limits apply (no ratchet; the server hands out the public keys). A new member sees places from the next update after they join, and a person you remove stops getting new places at once.</li>
            </ul>
          </section>

          <div className="p-3 rounded-2xl bg-zinc-900/60 border border-white/5 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-zinc-400">Never share your key backup passphrase or your NOOB password with anyone. NOOB staff will never ask for either.</p>
          </div>
        </div>

        {/* Footer Action */}
        <div className="pt-4 border-t border-white/10 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-blue-500 text-white font-bold text-xs hover:bg-zinc-500 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Understood &amp; Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};
