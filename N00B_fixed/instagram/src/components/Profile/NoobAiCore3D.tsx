import React from 'react';

interface NoobAiCore3DProps {
  size?: number;
  // Sleeping: grey, slow, eyes closed (NOOB AI's computer is switched off).
  sleeping?: boolean;
}

// NOOB AI's animated core (pure CSS 3D, no library): a glass orb full of swirling coloured light with a friendly
// blinking face, inside three spinning rainbow rings with comets. The same design as the assistant's own screens
// (server/web/style.css in N00B_fixed/noob-ai), with the class names prefixed "nai-" so they never clash here.
const CSS = `
.nai { --s: 200px; position: relative; width: var(--s); height: var(--s); margin: 0 auto; flex: none; perspective: 900px; }
.nai-halo { position: absolute; inset: -16%; border-radius: 50%; pointer-events: none;
background: conic-gradient(from 0deg, #22d3ee, #8b5cf6, #ec4899, #f59e0b, #10b981, #22d3ee);
filter: blur(calc(var(--s) * .13)); opacity: .42; animation: nai-spin 9s linear infinite, nai-glow 4s ease-in-out infinite; }
.nai-scene { position: absolute; inset: 0; transform-style: preserve-3d; animation: nai-wobble 11s ease-in-out infinite alternate; }
.nai-ring { position: absolute; inset: 1%; border-radius: 50%; transform-style: preserve-3d; }
.nai-ring.r1 { transform: rotateZ(0deg) rotateX(72deg); }
.nai-ring.r2 { transform: rotateZ(60deg) rotateX(72deg); inset: 4%; }
.nai-ring.r3 { transform: rotateZ(-60deg) rotateX(72deg); inset: 7%; }
.nai-ring i, .nai-ring u { position: absolute; inset: 0; border-radius: 50%;
-webkit-mask: radial-gradient(farthest-side, transparent calc(100% - var(--w)), #000 calc(100% - var(--w) + .6px));
mask: radial-gradient(farthest-side, transparent calc(100% - var(--w)), #000 calc(100% - var(--w) + .6px)); }
.nai-ring i { --w: calc(var(--s) * .012 + 1px); opacity: .8; animation: nai-spin 7s linear infinite;
background: conic-gradient(#22d3ee, #8b5cf6, #ec4899, #f59e0b, #10b981, #22d3ee); }
.nai-ring u { --w: calc(var(--s) * .022 + 1px); animation: nai-spin 2.6s linear infinite;
background: conic-gradient(from 0deg, transparent 0 58%, rgba(255, 255, 255, .15) 75%, #fff 98%, transparent 99%); }
.nai-ring.r2 i { animation-duration: 9s; animation-direction: reverse; }
.nai-ring.r2 u { animation-duration: 3.4s; animation-direction: reverse; }
.nai-ring.r3 i { animation-duration: 11s; }
.nai-ring.r3 u { animation-duration: 4.2s; }
.nai-orb { position: absolute; inset: 23%; border-radius: 50%; overflow: hidden; isolation: isolate;
background: radial-gradient(circle at 50% 55%, #3b2a9a 0%, #160f48 72%, #0c0a26 100%);
box-shadow: 0 0 calc(var(--s) * .1) rgba(139, 92, 246, .6), 0 0 calc(var(--s) * .22) rgba(34, 211, 238, .28);
animation: nai-bob 5s ease-in-out infinite; }
.nai-orb b { position: absolute; width: 86%; height: 86%; border-radius: 50%; mix-blend-mode: screen;
filter: blur(calc(var(--s) * .02)); animation: nai-spin 6s linear infinite; }
.nai-orb b:nth-child(1) { left: -14%; top: -12%; transform-origin: 72% 74%; background: radial-gradient(circle, #22d3ee 0% 22%, rgba(34, 211, 238, 0) 70%); }
.nai-orb b:nth-child(2) { left: 30%; top: 26%; transform-origin: 26% 28%; background: radial-gradient(circle, #a855f7 0% 22%, rgba(168, 85, 247, 0) 70%); animation-duration: 8s; animation-direction: reverse; }
.nai-orb b:nth-child(3) { left: 28%; top: -16%; transform-origin: 22% 82%; background: radial-gradient(circle, #ec4899 0% 20%, rgba(236, 72, 153, 0) 68%); animation-duration: 7s; }
.nai-orb b:nth-child(4) { left: -12%; top: 30%; transform-origin: 80% 20%; background: radial-gradient(circle, #fbbf24 0% 18%, rgba(251, 191, 36, 0) 66%); animation-duration: 9.5s; animation-direction: reverse; }
.nai-gloss { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; z-index: 1;
background: radial-gradient(circle at 32% 22%, rgba(255, 255, 255, .9) 0 5%, rgba(255, 255, 255, .28) 15%, transparent 36%),
radial-gradient(circle at 72% 88%, rgba(255, 255, 255, .22), transparent 38%);
box-shadow: inset 0 calc(var(--s) * -.03) calc(var(--s) * .07) rgba(0, 0, 0, .45), inset 0 0 0 1px rgba(255, 255, 255, .18); }
.nai-eyes { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; gap: calc(var(--s) * .06); }
.nai-eyes em { width: calc(var(--s) * .038); height: calc(var(--s) * .082); min-width: 4px; min-height: 8px; border-radius: 99px;
background: #fff; box-shadow: 0 0 8px rgba(255, 255, 255, .95), 0 0 20px rgba(34, 211, 238, .85); animation: nai-blink 5s infinite;
transition: transform .3s; }
.nai-spark { position: absolute; width: calc(var(--s) * .026); height: calc(var(--s) * .026); min-width: 4px; min-height: 4px;
border-radius: 50%; background: var(--c); box-shadow: 0 0 10px 2px var(--c); opacity: 0; animation: nai-rise 4.6s ease-in-out infinite; }
.nai-spark:nth-of-type(1) { --c: #22d3ee; left: 10%; top: 64%; }
.nai-spark:nth-of-type(2) { --c: #ec4899; left: 84%; top: 34%; animation-delay: .9s; }
.nai-spark:nth-of-type(3) { --c: #f59e0b; left: 72%; top: 84%; animation-delay: 1.8s; }
.nai-spark:nth-of-type(4) { --c: #8b5cf6; left: 22%; top: 18%; animation-delay: 2.7s; }
.nai-spark:nth-of-type(5) { --c: #10b981; left: 48%; top: 94%; animation-delay: 3.6s; }
.nai.sleep { filter: grayscale(.9) brightness(1.05); }
.nai.sleep .nai-halo, .nai.sleep .nai-ring i, .nai.sleep .nai-ring u, .nai.sleep .nai-orb b { animation-duration: 40s; }
.nai.sleep .nai-eyes em { height: 3px; min-height: 3px; animation: none; }
.nai.sleep .nai-spark { display: none; }
@keyframes nai-spin { to { transform: rotate(360deg); } }
@keyframes nai-glow { 0%, 100% { opacity: .32; } 50% { opacity: .55; } }
@keyframes nai-wobble { from { transform: rotateX(10deg) rotateY(-14deg); } to { transform: rotateX(-10deg) rotateY(14deg); } }
@keyframes nai-bob { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2.5%) scale(1.03); } }
@keyframes nai-blink { 0%, 46%, 52%, 100% { transform: scaleY(1); } 49% { transform: scaleY(.12); } }
@keyframes nai-rise { 0% { opacity: 0; transform: translateY(10%) scale(.5); } 25% { opacity: 1; }
100% { opacity: 0; transform: translateY(-160%) scale(1.1); } }
@media (prefers-reduced-motion: reduce) { .nai, .nai * { animation-duration: 40s !important; } }
`;

export const NoobAiCore3D: React.FC<NoobAiCore3DProps> = ({ size = 200, sleeping = false }) => (
  <div className={`nai${sleeping ? ' sleep' : ''}`} style={{ ['--s' as string]: `${size}px` }} aria-hidden="true">
    <style>{CSS}</style>
    <div className="nai-halo" />
    <div className="nai-scene">
      <div className="nai-ring r1"><i /><u /></div>
      <div className="nai-ring r2"><i /><u /></div>
      <div className="nai-ring r3"><i /><u /></div>
      <div className="nai-orb">
        <b /><b /><b /><b />
        <div className="nai-gloss" />
        <div className="nai-eyes"><em /><em /></div>
      </div>
    </div>
    <span className="nai-spark" /><span className="nai-spark" /><span className="nai-spark" /><span className="nai-spark" /><span className="nai-spark" />
  </div>
);
