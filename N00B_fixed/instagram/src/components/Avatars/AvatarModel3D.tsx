import React, { useEffect, useRef } from 'react';

// The "3D" view of an avatar: the character (cut out of its picture) stands on a floor shadow and turns in depth. Drag sideways to turn it; left alone it sways slowly.
// It is built from a few thin copies of the cut-out stacked in depth, so a turn shows real thickness at the edges (a figure with volume, not a flat picture sliding around).

const LAYERS = 7;          // copies stacked in depth
const GAP = 3.2;           // px between two copies
const MAX_TURN = 42;       // degrees to each side

export const AvatarModel3D: React.FC<{ src: string; name: string; calm?: boolean }> = ({ src, name, calm }) => {
  const stage = useRef<HTMLDivElement | null>(null);
  const shadow = useRef<HTMLDivElement | null>(null);
  const turn = useRef({ angle: 0, vel: 0, dragging: false, lastX: 0, lastT: 0, idleSince: 0, t0: 0 });

  useEffect(() => {
    let raf = 0;
    const s = turn.current;
    s.t0 = performance.now(); s.idleSince = s.t0;
    const apply = (a: number) => {
      if (stage.current) stage.current.style.transform = `rotateY(${a.toFixed(2)}deg)`;
      if (shadow.current) shadow.current.style.transform = `translateX(${(a * 0.7).toFixed(1)}px) scaleX(${(1 - Math.abs(a) / 220).toFixed(3)})`;
    };
    const tick = (now: number) => {
      if (!s.dragging) {
        const idle = now - s.idleSince;
        if (calm) { s.angle += (0 - s.angle) * 0.15; }
        else if (idle > 1200) {
          // a slow sway once the finger has been away for a moment: it eases from where it was left into the swing
          const target = Math.sin((now - s.idleSince - 1200) / 1500) * 20;
          s.angle += (target - s.angle) * 0.04;
        } else { s.angle += s.vel; s.vel *= 0.92; }
        s.angle = Math.max(-MAX_TURN, Math.min(MAX_TURN, s.angle));
      }
      apply(s.angle);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [calm]);

  const down = (e: React.PointerEvent) => { const s = turn.current; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); s.dragging = true; s.lastX = e.clientX; s.lastT = performance.now(); s.vel = 0; };
  const move = (e: React.PointerEvent) => {
    const s = turn.current; if (!s.dragging) return;
    const now = performance.now(), dx = e.clientX - s.lastX;
    const d = dx * 0.32;
    s.angle = Math.max(-MAX_TURN, Math.min(MAX_TURN, s.angle + d));
    s.vel = 0.6 * s.vel + 0.4 * (d / Math.max(1, now - s.lastT) * 16);
    s.lastX = e.clientX; s.lastT = now;
  };
  const up = () => { const s = turn.current; s.dragging = false; s.idleSince = performance.now(); };

  return (
    <div
      className="relative h-full w-full select-none"
      style={{ perspective: '1100px', touchAction: 'pan-y', cursor: 'grab' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      role="img" aria-label={`${name}, turn with your finger`} data-testid="avatar-3d"
    >
      {/* the floor: a soft shadow and a faint ring of light */}
      <div ref={shadow} className="absolute left-1/2 bottom-[1%] h-[5%] w-[56%] -ml-[28%] rounded-[50%] pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,.55) 0%, rgba(0,0,0,.25) 45%, rgba(0,0,0,0) 72%)', filter: 'blur(3px)' }} />
      <div className="absolute inset-x-0 top-0 bottom-[3%] flex justify-center" style={{ transformStyle: 'preserve-3d' }}>
        <div ref={stage} className="relative h-full" style={{ transformStyle: 'preserve-3d', willChange: 'transform', aspectRatio: '0.45 / 1' }}>
          {Array.from({ length: LAYERS }, (_, i) => {
            const back = LAYERS - 1 - i;          // 0 = the front copy
            return (
              <img
                key={back}
                src={src}
                alt=""
                draggable={false}
                decoding="async"
                className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                style={{ transform: `translateZ(${(-back * GAP + (LAYERS * GAP) / 2).toFixed(1)}px)`, filter: back === 0 ? 'none' : `brightness(${(0.78 - back * 0.05).toFixed(2)}) saturate(.9)`, zIndex: i }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AvatarModel3D;
