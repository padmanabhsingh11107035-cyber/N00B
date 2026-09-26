import React from 'react';

interface NoobAiCore3DProps {
  size?: number;
  // Sleeping: slow, grey, eyes closed (NOOB AI's computer is switched off).
  sleeping?: boolean;
}

// NOOB AI's animated 3D core (pure CSS 3D, no library): a spinning wireframe globe, three orbiting comets and a
// friendly glowing core that blinks. The same design as the assistant's own sign-in and Talk screens.
const CSS = `
.nai3d{--s:180px;position:relative;width:var(--s);height:var(--s);perspective:800px;flex:none}
.nai3d-glow{position:absolute;inset:-22%;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(124,92,255,.3),rgba(34,211,238,.12) 45%,transparent 70%);animation:nai3d-pulse 3.2s ease-in-out infinite}
.nai3d-scene{position:absolute;inset:0;transform-style:preserve-3d;animation:nai3d-tilt 9s ease-in-out infinite alternate}
.nai3d-globe{position:absolute;inset:12%;transform-style:preserve-3d;animation:nai3d-spin 11s linear infinite}
.nai3d-globe i,.nai3d-globe b{position:absolute;border-radius:50%}
.nai3d-globe i{inset:0;border:1.6px solid rgba(124,92,255,.62);transform:rotateY(var(--r))}
.nai3d-globe i:nth-child(1){--r:0deg}.nai3d-globe i:nth-child(2){--r:30deg}.nai3d-globe i:nth-child(3){--r:60deg}
.nai3d-globe i:nth-child(4){--r:90deg}.nai3d-globe i:nth-child(5){--r:120deg}.nai3d-globe i:nth-child(6){--r:150deg}
.nai3d-globe b{left:50%;top:50%;width:var(--w);height:var(--w);margin:calc(var(--w)/-2) 0 0 calc(var(--w)/-2);border:1.6px solid rgba(6,182,212,.55);transform:rotateX(90deg) translateZ(var(--z))}
.nai3d-globe b:nth-of-type(1){--w:calc(var(--s)*.76);--z:0px}
.nai3d-globe b:nth-of-type(2){--w:calc(var(--s)*.658);--z:calc(var(--s)*.19)}
.nai3d-globe b:nth-of-type(3){--w:calc(var(--s)*.658);--z:calc(var(--s)*-.19)}
.nai3d-globe b:nth-of-type(4){--w:calc(var(--s)*.435);--z:calc(var(--s)*.31)}
.nai3d-globe b:nth-of-type(5){--w:calc(var(--s)*.435);--z:calc(var(--s)*-.31)}
.nai3d-orbit{position:absolute;inset:-3%;transform-style:preserve-3d}
.nai3d-orbit.o1{transform:rotateX(74deg) rotateY(-18deg)}
.nai3d-orbit.o2{inset:2%;transform:rotateX(74deg) rotateY(42deg)}
.nai3d-orbit.o3{inset:6%;transform:rotateY(76deg) rotateX(14deg)}
.nai3d-orbit u{position:absolute;inset:0;border-radius:50%;border:2.5px solid rgba(167,139,250,.22);border-top-color:#22d3ee;border-right-color:rgba(34,211,238,.5);animation:nai3d-roll 3.4s linear infinite;filter:drop-shadow(0 0 3px rgba(34,211,238,.8))}
.nai3d-orbit.o2 u{border-top-color:#a78bfa;border-right-color:rgba(167,139,250,.45);animation-duration:4.6s;animation-direction:reverse}
.nai3d-orbit.o3 u{border-top-color:#f472b6;border-right-color:rgba(244,114,182,.4);animation-duration:6s}
.nai3d-core{position:absolute;inset:31%;border-radius:50%;display:flex;align-items:center;justify-content:center;gap:calc(var(--s)*.045);background:radial-gradient(circle at 34% 28%,#ecfeff 0%,#67e8f9 20%,#7c5cff 58%,#3b1f9e 100%);box-shadow:0 0 30px rgba(124,92,255,.55),0 0 60px rgba(34,211,238,.25),inset -8px -10px 22px rgba(30,10,90,.45),inset 6px 8px 16px rgba(255,255,255,.35);animation:nai3d-breathe 3.2s ease-in-out infinite}
.nai3d-core em{width:calc(var(--s)*.032);height:calc(var(--s)*.062);min-width:4px;min-height:7px;border-radius:99px;background:#fff;box-shadow:0 0 8px rgba(255,255,255,.9);animation:nai3d-blink 4.5s infinite}
.nai3d-spark{position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 10px 3px rgba(34,211,238,.8);opacity:0;animation:nai3d-float 4s ease-in-out infinite}
.nai3d-spark:nth-of-type(1){left:8%;top:62%}
.nai3d-spark:nth-of-type(2){left:86%;top:30%;animation-delay:1.3s;box-shadow:0 0 10px 3px rgba(167,139,250,.8)}
.nai3d-spark:nth-of-type(3){left:70%;top:88%;animation-delay:2.6s;box-shadow:0 0 10px 3px rgba(244,114,182,.8)}
.nai3d.sleep{filter:grayscale(.85) brightness(1.05)}
.nai3d.sleep .nai3d-globe,.nai3d.sleep .nai3d-orbit u{animation-duration:40s}
.nai3d.sleep .nai3d-core em{height:3px;min-height:3px;animation:none}
.nai3d.sleep .nai3d-spark{display:none}
@keyframes nai3d-spin{to{transform:rotateY(360deg)}}
@keyframes nai3d-roll{to{transform:rotateZ(360deg)}}
@keyframes nai3d-tilt{from{transform:rotateX(16deg) rotateZ(-10deg)}to{transform:rotateX(-14deg) rotateZ(12deg)}}
@keyframes nai3d-pulse{0%,100%{opacity:.75;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}
@keyframes nai3d-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes nai3d-blink{0%,44%,50%,100%{transform:scaleY(1)}47%{transform:scaleY(.1)}}
@keyframes nai3d-float{0%{opacity:0;transform:translateY(8px) scale(.6)}30%{opacity:1}100%{opacity:0;transform:translateY(-26px) scale(1.1)}}
@media (prefers-reduced-motion:reduce){.nai3d,.nai3d *{animation-duration:30s!important}}
`;

export const NoobAiCore3D: React.FC<NoobAiCore3DProps> = ({ size = 180, sleeping = false }) => (
  <div className={`nai3d${sleeping ? ' sleep' : ''}`} style={{ ['--s' as string]: `${size}px` }} aria-hidden="true">
    <style>{CSS}</style>
    <div className="nai3d-glow" />
    <div className="nai3d-scene">
      <div className="nai3d-globe">
        <i /><i /><i /><i /><i /><i />
        <b /><b /><b /><b /><b />
      </div>
      <div className="nai3d-orbit o1"><u /></div>
      <div className="nai3d-orbit o2"><u /></div>
      <div className="nai3d-orbit o3"><u /></div>
    </div>
    <div className="nai3d-core"><em /><em /></div>
    <span className="nai3d-spark" /><span className="nai3d-spark" /><span className="nai3d-spark" />
  </div>
);
