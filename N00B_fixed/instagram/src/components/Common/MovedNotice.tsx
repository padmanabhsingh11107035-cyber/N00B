import React from 'react';
import { Download } from 'lucide-react';
import { isOnOtherNoobAddress, installAddress, MAIN_SITE } from '../../utils/siteUrl';

// Shown on the OLD address (nooob.xyz) only: a curved, fully black card with white hand-drawn doodles that says NOOB has a new home, gives the new address and a button
// that goes and installs it there (an app can only be installed from the address it is opened on). It has no close button: everyone who opens the old address is sent
// to the new one, and the old address does not run the app at all any more (main.tsx shows only this card there) — every update goes to the new address only. The one way past it is for NOOB's own support: opening  nooob.xyz/?old=1  (kept for the rest of that tab's visit) lets someone reach the old app,
// e.g. to help a person whose older private chats are still unlocked only there. Never shown on the new address, on ai. / coaching., or inside the Android app. On a
// developer's own computer it can be looked at with  http://localhost:5173/?show=moved .
const BYPASS_KEY = 'noob.movedNoticeBypass';

export function movedNoticeApplies(onOldAddress: boolean, hostname: string, search: string): boolean {
  if (onOldAddress) return true;
  return (hostname === 'localhost' || hostname === '127.0.0.1') && new URLSearchParams(search).get('show') === 'moved';
}

export function bypassRequested(search: string, kept: boolean): boolean {
  return kept || new URLSearchParams(search).get('old') === '1';
}
const bypassNow = (): boolean => {
  try {
    const kept = sessionStorage.getItem(BYPASS_KEY) === '1';
    const asked = bypassRequested(window.location.search, kept);
    if (asked && !kept) sessionStorage.setItem(BYPASS_KEY, '1');
    return asked;
  } catch { return false; }
};

const Doodle: React.FC<{ className: string; children: React.ReactNode; vb?: string; w?: number }> = ({ className, children, vb = '0 0 24 24', w = 1.6 }) => (
  <svg aria-hidden="true" viewBox={vb} className={`pointer-events-none absolute text-white ${className}`} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

/** True on the old address (unless support opened it with ?old=1): there main.tsx shows only the card and does not start the app. */
export function movedNoticeBlocksApp(): boolean {
  try { return movedNoticeApplies(isOnOtherNoobAddress(), window.location.hostname, window.location.search) && !bypassNow(); } catch { return false; }
}

export const MovedNotice: React.FC = () => {
  if (!movedNoticeBlocksApp()) return null;
  const host = MAIN_SITE.replace(/^https?:\/\//, '');
  // an old shared link (a post, a profile, a reel) lands on the same page of the new address
  const sameThere = MAIN_SITE + window.location.pathname + window.location.search.replace(/([?&])show=moved&?/, '$1').replace(/[?&]$/, '') + window.location.hash;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-[noob-fade_.2s_ease-out]" role="dialog" aria-modal="true" aria-label={`NOOB has moved to ${host}`}>
      <div
        className="noob-pop force-white-text relative w-[min(92vw,390px)] max-h-[92vh] overflow-y-auto no-scrollbar rounded-[30px] ring-1 ring-white/60 shadow-[0_0_0_6px_rgba(255,255,255,.06),0_28px_70px_-10px_rgba(0,0,0,.95)] px-7 pt-9 pb-6 text-center"
        style={{ backgroundColor: '#000000', color: '#ffffff' }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-[7px] rounded-[24px] border border-dashed border-white/35" />
        {/* white hand-drawn doodles */}
        <Doodle className="left-5 top-5 w-6 h-6 dd-twinkle"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></Doodle>
        <Doodle className="right-6 top-6 w-4 h-4 text-white/80 dd-float" w={1.9}><path d="M12 4v16M4 12h16" /></Doodle>
        <Doodle className="right-5 top-16 w-6 h-6 text-white/85 dd-twinkle"><path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" /></Doodle>
        <Doodle className="left-6 top-20 w-5 h-5 text-white/75 dd-float"><path d="M12 12a2 2 0 0 1 4 0a4 4 0 0 1-8 0a6 6 0 0 1 12 0" /></Doodle>
        <Doodle className="left-5 top-[46%] w-5 h-5 text-white/70 dd-float"><path d="M12 21C6 17 4 12 7 8c2-2 4-1 5 1 1-2 3-3 5-1 3 4 1 9-5 13z" /></Doodle>
        <Doodle className="right-5 top-[43%] w-4 h-4 text-white/80 dd-twinkle"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></Doodle>
        <Doodle className="left-6 bottom-6 w-14 h-4 text-white/85" vb="0 0 56 14" w={2}><path d="M2 9q5-9 10 0t10 0 10 0 10 0 10 0" /></Doodle>
        <Doodle className="right-6 bottom-6 w-6 h-6 text-white/85 dd-twinkle"><path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" /></Doodle>

        <p className="relative z-10 text-[38px] leading-none font-black tracking-[0.2em] pl-[0.2em]">NOOB</p>
        <svg aria-hidden="true" viewBox="0 0 80 12" className="relative z-10 mx-auto mt-1.5 w-20 h-3 text-white/90 block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8q6-9 12 0t12 0 12 0 12 0 12 0 12 0" /></svg>

        <h2 className="relative z-10 mt-5 text-[22px] font-extrabold tracking-tight" style={{ fontFamily: 'inherit' }}>We have a new home</h2>
        <p className="relative z-10 mt-2 text-[13.5px] leading-snug text-white/80">We have changed our domain. NOOB now lives at</p>
        <a
          href={sameThere}
          className="relative z-10 mt-2.5 inline-block rounded-full px-5 py-1.5 text-base font-extrabold tracking-tight underline underline-offset-4 decoration-white/60 ring-1 ring-white/50 hover:ring-white"
          style={{ color: '#ffffff' }}
        >
          {host}
        </a>
        <p className="relative z-10 mt-3 text-[13.5px] leading-snug text-white/80">and all your data has been shifted there exactly as it was. Log in with the same account.</p>

        <button
          type="button"
          onClick={() => window.location.assign(installAddress(true))}
          className="relative z-10 mt-5 w-full inline-flex items-center justify-center gap-2.5 rounded-full py-3 text-sm font-extrabold cursor-pointer transition-transform hover:scale-[1.02] active:scale-[.98]"
          style={{ backgroundColor: '#ffffff', color: '#000000' }}
        >
          <Download className="w-4 h-4" />
          <span>Install NOOB from {host}</span>
        </button>
        <p className="relative z-10 mt-4 mb-6 text-[11px] leading-snug text-white/55">Keep this old app until you have logged in on the new one and checked that your chats open. Then remove this old one yourself: touch and hold its icon and tap Uninstall (iPhone: Remove App). A website cannot remove an app by itself.</p>
      </div>
    </div>
  );
};
