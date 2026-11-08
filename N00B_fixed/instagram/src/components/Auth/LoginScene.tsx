import React from 'react';

// The picture on the sign-in page: three friends holding up phones that show NOOB (a liked post, a reel, a chat), with hearts, chats, music and a game pad floating around them.
// Plain drawn shapes, no pictures to download. Everything moves gently (and stands still when the phone asks for less motion).
type Screen = 'heart' | 'play' | 'chat';

const Phone: React.FC<{ kind: Screen }> = ({ kind }) => (
  <g>
    <rect x="-17" y="112" width="34" height="56" rx="8" fill="#141414" />
    <rect x="-14" y="116" width="28" height="48" rx="5" fill="#26242a" />
    <rect x="-9" y="119" width="12" height="3.2" rx="1.6" fill="#ffd60a" />
    {kind === 'heart' && (<>
      <rect x="-11" y="126" width="22" height="16" rx="3" fill="#3b3640" />
      <path d="M0 140c-5-3.6-7.6-6-7.6-8.6 0-2 1.5-3.4 3.3-3.4 1.6 0 3.2 1 4.3 2.6C1 128.9 2.6 128 4.2 128c1.8 0 3.4 1.4 3.4 3.4C7.6 134 5 136.400 0 140z" fill="#ff4d6d" className="ls-beat" />
      <rect x="-11" y="147" width="14" height="2.6" rx="1.3" fill="#8b8590" /><rect x="-11" y="152" width="9" height="2.6" rx="1.3" fill="#8b8590" />
    </>)}
    {kind === 'play' && (<>
      <rect x="-11" y="126" width="22" height="30" rx="3" fill="#3b3640" />
      <circle cx="0" cy="141" r="7.5" fill="#ffd60a" /><path d="M-2.4 137.200 4 141l-6.400 3.800z" fill="#141414" />
    </>)}
    {kind === 'chat' && (<>
      <rect x="-11" y="127" width="15" height="8" rx="4" fill="#3b3640" />
      <rect x="-4" y="138" width="15" height="8" rx="4" fill="#ffd60a" />
      <rect x="-11" y="149" width="11" height="8" rx="4" fill="#3b3640" />
    </>)}
  </g>
);

const Person: React.FC<{ x: number; skin: string; hair: string; shirt: string; screen: Screen; delay: string; wave?: boolean; big?: boolean }> = ({ x, skin, hair, shirt, screen, delay, wave, big }) => (
  <g transform={`translate(${x} ${big ? -6 : 0}) scale(${big ? 1.12 : 1})`}>
    <g className="ls-bob" style={{ animationDelay: delay }}>
      <rect x="-36" y="94" width="72" height="100" rx="30" fill={shirt} />
      <path d="M-14 94c2 8 26 8 28 0" fill={skin} opacity=".0" />
      <rect x="-6" y="80" width="12" height="18" rx="5" fill={skin} />
      <circle cx="0" cy="66" r="21" fill={skin} />
      <path d={`M-23 64c-2-20 12-30 24-28 14 2 22 12 21 28-5-9-12-13-22-13-9 0-17 4-23 13z`} fill={hair} />
      <circle cx="-7.500" cy="68" r="2.200" fill="#1a1a1a" /><circle cx="7.500" cy="68" r="2.200" fill="#1a1a1a" />
      <path d="M-5 76c3 3.200 7 3.200 10 0" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
      <circle cx="-13" cy="74" r="3.600" fill="#ff8fa3" opacity=".55" /><circle cx="13" cy="74" r="3.600" fill="#ff8fa3" opacity=".55" />
      <Phone kind={screen} />
      <circle cx="-19" cy="150" r="6.500" fill={skin} /><circle cx="19" cy="150" r="6.500" fill={skin} />
      {wave && <g className="ls-wave"><rect x="34" y="104" width="9" height="30" rx="4.500" fill={shirt} transform="rotate(-24 38 134)" /><circle cx="43" cy="100" r="7" fill={skin} /></g>}
    </g>
  </g>
);

export const LoginScene: React.FC = () => (
  <div className="ls-root" aria-hidden="true">
    <svg viewBox="0 0 360 176" className="ls-svg" focusable="false">
      <ellipse cx="180" cy="172" rx="170" ry="10" fill="rgba(0,0,0,.14)" />
      <Person x={62} skin="#f2b48a" hair="#2b1a12" shirt="#ff6b35" screen="heart" delay="-.4s" wave />
      <Person x={298} skin="#8d5a3b" hair="#111" shirt="#7c5cff" screen="chat" delay="-1.1s" />
      <Person x={180} skin="#e9a273" hair="#4a2a12" shirt="#1d1d1f" screen="play" delay="-.8s" big />
    </svg>
    <span className="ls-chip c1">❤️</span>
    <span className="ls-chip c2">💬</span>
    <span className="ls-chip c3">🎵</span>
    <span className="ls-chip c4">🎮</span>
    <span className="ls-chip c5">⭐</span>
    <span className="ls-chip c6">🔥</span>
    <span className="ls-heart h1">❤</span><span className="ls-heart h2">❤</span><span className="ls-heart h3">❤</span>
  </div>
);
