import React from 'react';

// The phone on the sign-in page: a small working demo of the app. Seven screens take turns (about 3.4 seconds each) and loop for ever: the home feed with stories, reels,
// a chat, the games, a live voice room, the Daily NOOB challenge and the AI study helper, each with a little hand-written caption under the phone. Everything is drawn
// here in the page's black-and-white doodle style and moved by CSS alone (see .demo-* in index.css): no timers, no pictures to download, nothing to tap. It is decoration:
// hidden from screen readers, never catches a tap, and for people who ask their device for less motion it simply shows the first screen.
// Each screen is drawn on a fixed 160 x 284 sheet that is scaled to fit the phone (smaller on tablets, full size from 1280px wide).

const CAPTIONS = ['Share moments', 'Watch reels', 'Chat with friends', 'Play 50+ games', 'Hang out live', 'Daily challenge', 'Study with AI'];

const NAV = [
  'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM3 9h18M9 4l-2 5M15 4l-2 5',
  'M21 11.5a8.4 8.4 0 0 1-9 8.5 8.5 8.5 0 0 1-4-.9L3 20l1.9-5A8.4 8.4 0 1 1 21 11.5z',
  'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7'
];
const HEART = 'M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1.2 4.5 2.8C12 6.2 13.5 5 15.5 5 19 5 21.5 8.5 20 12.5 17.5 16.65 12 21 12 21z';
const CHAT = NAV[3];
const SEND = 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z';

const Icon: React.FC<{ d: string; className?: string; fill?: boolean }> = ({ d, className = 'w-[14px] h-[14px]', fill }) => (
  <svg viewBox="0 0 24 24" className={className} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

const Nav: React.FC<{ on?: number }> = ({ on }) => (
  <div className="absolute inset-x-0 bottom-0 h-[30px] border-t border-white/15 bg-black flex items-center justify-around px-2 text-white/45">
    {NAV.map((d, i) => <span key={i} className={on === i ? 'text-white' : ''}><Icon d={d} /></span>)}
  </div>
);

// one screen of the demo; --i says when it is its turn
const Screen: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <div className="demo-screen absolute inset-0" style={{ ['--i' as string]: n }}>{children}</div>
);
const at = (n: number, d = 0): React.CSSProperties => ({ ['--i' as string]: n, ['--d' as string]: `${d}s` });

const Avatar: React.FC<{ s?: number; ring?: boolean; n?: string }> = ({ s = 22, ring, n = '' }) => (
  <span className={`shrink-0 rounded-full bg-zinc-800 flex items-center justify-center text-[8px] font-black text-white/80 ${ring ? 'ring-1 ring-white/70 ring-offset-1 ring-offset-black' : 'border border-white/25'}`} style={{ width: s, height: s }}>{n}</span>
);

export const LoginPhoneDemo: React.FC = () => (
  <div className="hidden sm:block absolute top-[27%] left-[3%] z-[2] pointer-events-none select-none -rotate-3" aria-hidden="true" data-testid="phone-demo">
    <div className="w-28 xl:w-44 rounded-[22px] xl:rounded-[30px] border-2 border-white/35 bg-zinc-950 p-1.5 shadow-2xl shadow-black/70 relative">
      <span className="absolute top-[3px] left-1/2 -translate-x-1/2 w-6 xl:w-9 h-[3px] rounded-full bg-white/25" />
      <div className="relative rounded-2xl xl:rounded-[22px] overflow-hidden aspect-[9/16] bg-black">
        <div className="absolute top-0 left-0 w-[160px] h-[284px] origin-top-left scale-[.6] xl:scale-100 text-white">

          {/* 1 - the home feed */}
          <Screen n={0}>
            <div className="flex items-center justify-between px-3 pt-3 pb-1"><span className="text-[13px] font-black tracking-tight">NOOB</span><Icon d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></div>
            <div className="flex gap-2 px-3 py-1.5">{['+', 'A', 'M', 'R', 'S'].map((c, i) => <Avatar key={i} s={24} ring={i > 0} n={c} />)}</div>
            <div className="mx-2 mt-1 rounded-xl border border-white/20 bg-zinc-950 overflow-hidden">
              <div className="flex items-center gap-1.5 px-2 py-1.5"><Avatar s={16} n="M" /><span className="text-[8px] font-bold">maya</span><span className="ml-auto text-[7px] text-white/40">2m</span></div>
              <svg viewBox="0 0 120 84" className="w-full h-[84px] bg-zinc-900 text-white/70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="92" cy="24" r="11" /><path d="M92 6v4M92 38v4M74 24h4M106 24h4" /><path d="M0 70q22-30 44-10t38-14 38 18" /><path d="M0 84V74q30-12 60 0t60-4v14z" fill="currentColor" fillOpacity=".12" /><path d="M20 30q4-5 8 0M30 24q4-5 8 0" />
              </svg>
              <div className="flex items-center gap-2 px-2 py-1.5 text-white/80"><span className="demo-at demo-like" style={at(0, 1.1)}><Icon d={HEART} fill /></span><Icon d={CHAT} /><Icon d={SEND} /><span className="ml-auto text-[7px] text-white/50">128 likes</span></div>
              <div className="px-2 pb-2 space-y-1"><div className="h-[4px] w-4/5 rounded bg-white/25" /><div className="h-[4px] w-1/2 rounded bg-white/15" /></div>
            </div>
            <Nav on={0} />
          </Screen>

          {/* 2 - reels */}
          <Screen n={1}>
            <svg viewBox="0 0 160 284" className="absolute inset-0 w-full h-full text-white/55" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="160" height="284" fill="#111" stroke="none" />
              <circle cx="110" cy="70" r="20" /><path d="M0 200q30-70 62-20t50-40 48 30v114H0z" fill="currentColor" fillOpacity=".1" /><path d="M0 230q40-40 80-10t80-20" /><path d="M28 60l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" />
            </svg>
            <div className="absolute inset-x-0 bottom-0 h-[110px] bg-gradient-to-t from-black via-black/70 to-transparent" />
            <div className="absolute top-3 left-3 text-[13px] font-black">Reels</div>
            <div className="demo-at demo-dtap absolute left-1/2 top-[40%] -ml-6 text-white" style={at(1)}><Icon d={HEART} fill className="w-12 h-12" /></div>
            <div className="absolute right-2 bottom-[52px] flex flex-col items-center gap-3 text-white"><span className="flex flex-col items-center"><Icon d={HEART} fill className="w-[18px] h-[18px]" /><span className="text-[7px]">2.4k</span></span><span className="flex flex-col items-center"><Icon d={CHAT} className="w-[18px] h-[18px]" /><span className="text-[7px]">310</span></span><Icon d={SEND} className="w-[18px] h-[18px]" /></div>
            <div className="absolute left-3 bottom-[42px] right-12"><div className="flex items-center gap-1.5"><Avatar s={18} n="R" /><span className="text-[8px] font-bold">rohan</span></div><div className="mt-1 text-[8px] text-white/80 leading-tight">weekend vibes with the squad</div></div>
            <div className="absolute left-3 right-3 bottom-[34px] h-[2px] bg-white/20 rounded overflow-hidden"><div className="demo-at demo-grow h-full w-full bg-white origin-left" style={at(1)} /></div>
            <Nav on={2} />
          </Screen>

          {/* 3 - chat */}
          <Screen n={2}>
            <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 border-b border-white/15"><Avatar s={20} n="R" /><div className="leading-tight"><div className="text-[9px] font-bold">Riya</div><div className="text-[7px] text-white/50 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-white" />online</div></div></div>
            <div className="px-3 pt-3 space-y-2 text-[8.5px]">
              <div className="demo-at demo-pop max-w-[70%] rounded-2xl rounded-bl-sm border border-white/25 px-2 py-1.5" style={at(2, 0.1)}>hey! what's up?</div>
              <div className="demo-at demo-pop ml-auto max-w-[75%] rounded-2xl rounded-br-sm bg-white text-black px-2 py-1.5 font-semibold origin-right" style={at(2, 0.8)}>wanna play ludo?</div>
              <div className="demo-at demo-pop max-w-[70%] rounded-2xl rounded-bl-sm border border-white/25 px-2 py-1.5" style={at(2, 1.5)}>yes!! send invite</div>
              <div className="demo-at demo-pop ml-auto max-w-[60%] rounded-2xl rounded-br-sm bg-white text-black px-2 py-1.5 font-semibold origin-right" style={at(2, 2.1)}>sent 🎲</div>
              <div className="demo-at demo-pop flex gap-1 w-10 rounded-2xl rounded-bl-sm border border-white/25 px-2 py-2" style={at(2, 2.6)}><i className="demo-dot" /><i className="demo-dot" style={{ animationDelay: '.2s' }} /><i className="demo-dot" style={{ animationDelay: '.4s' }} /></div>
            </div>
            <div className="absolute inset-x-2 bottom-[36px] h-[22px] rounded-full border border-white/25 flex items-center px-2 gap-1.5 text-white/50"><span className="text-[8px] flex-1">Message…</span><Icon d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v4" className="w-[11px] h-[11px]" /></div>
            <Nav on={3} />
          </Screen>

          {/* 4 - games */}
          <Screen n={3}>
            <div className="flex items-center justify-between px-3 pt-3 pb-1"><span className="text-[13px] font-black">Games</span><span className="rounded-full bg-white text-black text-[8px] font-black px-2 py-[2px]">50+</span></div>
            <div className="grid grid-cols-2 gap-2 px-3 pt-2">
              {[
                ['Ludo', <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.3" fill="currentColor" /><circle cx="15" cy="9" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="9" cy="15" r="1.3" fill="currentColor" /><circle cx="15" cy="15" r="1.3" fill="currentColor" /></>],
                ['Chess', <><path d="M9 21h6M10 21v-4l-2-3 2-2-1-3 3-3 3 3-1 3 2 2-2 3v4" /><circle cx="12" cy="4.5" r="1.5" /></>],
                ['Snakes', <><path d="M5 20c0-6 6-3 6-9s-5-4-3-7M16 4v16M20 4v16M16 8h4M16 13h4M16 18h4" /></>],
                ['Tic-Tac-Toe', <><path d="M9 4v16M15 4v16M4 9h16M4 15h16" /><path d="M5.5 5.5l2 2M7.5 5.5l-2 2" /><circle cx="18" cy="18" r="1.6" /></>]
              ].map(([name, art], i) => (
                <div key={i} className="demo-at demo-pop rounded-xl border border-white/25 bg-zinc-950 py-2.5 flex flex-col items-center gap-1" style={at(3, 0.15 * i)}>
                  <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{art as React.ReactNode}</svg>
                  <span className="text-[8px] font-bold">{name as string}</span>
                </div>
              ))}
            </div>
            <div className="mx-3 mt-3 rounded-full bg-white text-black text-center text-[9px] font-black py-1.5">Play with friends</div>
            <div className="mt-2 text-center font-script text-[10px] text-white/70">vs bots · friends · online</div>
            <Nav />
          </Screen>

          {/* 5 - a live voice room */}
          <Screen n={4}>
            <div className="flex items-center justify-between px-3 pt-3 pb-1"><span className="text-[12px] font-black">NOOB Rooms</span><span className="flex items-center gap-1 text-[8px] font-black"><span className="w-1.5 h-1.5 rounded-full bg-red-500 demo-ring-dot" />LIVE</span></div>
            <div className="mx-3 mt-1 text-[9px] text-white/70">Late-night talk · 6 listening</div>
            <div className="grid grid-cols-3 gap-y-3 gap-x-2 px-4 pt-4 justify-items-center">
              {['R', 'A', 'M', 'S', 'K', 'N'].map((c, i) => (
                <div key={i} className="relative">
                  <Avatar s={30} n={c} ring={i === 0 || i === 3} />
                  {(i === 0 || i === 3) && <span className="demo-ring absolute -inset-[3px] rounded-full border border-white/70" style={{ animationDelay: `${i * 0.2}s` }} />}
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-end justify-center gap-[3px] h-5">{[0, 1, 2, 3, 4, 5, 6].map((b) => <i key={b} className="demo-eq w-[3px] h-full rounded bg-white/80 origin-bottom" style={{ animationDelay: `${b * 0.12}s` }} />)}</div>
            <div className="mx-4 mt-3 rounded-full bg-white text-black text-center text-[9px] font-black py-1.5">Join room</div>
            <Nav />
          </Screen>

          {/* 6 - Daily NOOB */}
          <Screen n={5}>
            <div className="flex items-center justify-between px-3 pt-3"><span className="text-[12px] font-black">Daily NOOB</span><span className="text-[8px] text-white/60">ends in 5h</span></div>
            <div className="mx-3 mt-2 rounded-xl border border-dashed border-white/35 p-2 text-center">
              <svg viewBox="0 0 24 24" className="w-9 h-9 mx-auto text-white" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8v6a4 4 0 0 1-8 0V3zM8 5H4v2a3 3 0 0 0 4 2.8M16 5h4v2a3 3 0 0 1-4 2.8M12 13v4M9.5 17h5l.6 4H8.9z" /></svg>
              <div className="text-[8.5px] font-bold leading-tight mt-1">Post your funniest face</div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 px-3 pt-2">
              {[['24', 'M'], ['19', 'A'], ['11', 'S']].map(([v, c], i) => (
                <div key={i} className="rounded-lg border border-white/20 bg-zinc-900 py-1.5 flex flex-col items-center gap-1"><Avatar s={20} n={c} /><span className="flex items-center gap-0.5 text-[8px] font-bold"><Icon d={HEART} fill className="w-[8px] h-[8px]" />{v}</span></div>
              ))}
            </div>
            <div className="demo-at demo-pop text-center mt-3 font-script text-[15px] text-white" style={at(5, 0.9)}>+10,000 points!</div>
            <div className="text-center text-[8px] text-white/55">top three win every day</div>
            <Nav />
          </Screen>

          {/* 7 - AI study helper */}
          <Screen n={6}>
            <div className="flex items-center gap-1.5 px-3 pt-3 pb-2 border-b border-white/15"><span className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center text-[8px] font-black">AI</span><span className="text-[10px] font-black">NOOB Study</span></div>
            <div className="px-3 pt-3 space-y-2 text-[8.5px]">
              <div className="demo-at demo-pop ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-white text-black px-2 py-1.5 font-semibold origin-right" style={at(6, 0.1)}>make me a study plan for maths</div>
              <div className="demo-at demo-pop max-w-[88%] rounded-2xl rounded-bl-sm border border-white/25 px-2 py-2 space-y-1.5" style={at(6, 0.8)}>
                <div className="font-bold">Your plan for the week</div>
                {['Algebra basics', 'Practice quiz', 'Review mistakes'].map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5"><span className="demo-at demo-pop w-3 h-3 rounded-full bg-white text-black flex items-center justify-center" style={at(6, 1.6 + i * 0.5)}><svg viewBox="0 0 24 24" className="w-2 h-2" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg></span>{t}</div>
                ))}
              </div>
            </div>
            <div className="absolute inset-x-2 bottom-[36px] h-[22px] rounded-full border border-white/25 flex items-center px-2 text-white/50"><span className="text-[8px]">Ask anything…</span></div>
            <Nav />
          </Screen>
        </div>
      </div>
    </div>
    <div className="relative h-7 mt-2.5 font-script text-sm xl:text-lg text-zinc-50/90 whitespace-nowrap">
      {CAPTIONS.map((c, i) => <span key={c} className="demo-screen absolute inset-0 text-center" style={{ ['--i' as string]: i }}>{c}</span>)}
    </div>
  </div>
);
