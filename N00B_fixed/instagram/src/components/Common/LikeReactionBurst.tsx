import React, { useEffect, useRef, useState } from 'react';

// A short burst of a matching emoji floating up and fading out when someone likes something — the same idea
// as YouTube's laughing-emoji burst on a funny Short, just keyed to the content's own category (car → 🏎️,
// food → 🍔, and so on — see utils/categoryReaction.ts). Drop this inside a `relative` element (the like
// button itself, or a wrapper around it) and bump `burstKey` by 1 every time a like just landed.
interface Particle {
  id: number;
  dx: number;
  rot: number;
  delay: number;
  scale: number;
}

export const LikeReactionBurst: React.FC<{ emoji: string; burstKey: number }> = ({ emoji, burstKey }) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const lastKey = useRef(0);

  useEffect(() => {
    if (!burstKey || burstKey === lastKey.current) return;
    lastKey.current = burstKey;
    const batch: Particle[] = Array.from({ length: 6 }, (_, i) => ({
      id: burstKey * 100 + i,
      dx: Math.round((Math.random() - 0.5) * 64),
      rot: Math.round((Math.random() - 0.5) * 50),
      delay: i * 45,
      scale: 0.8 + Math.random() * 0.5
    }));
    setParticles((prev) => [...prev, ...batch]);
    const t = setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !batch.some((b) => b.id === p.id)));
    }, 1150);
    return () => clearTimeout(t);
  }, [burstKey]);

  if (particles.length === 0) return null;
  return (
    <div className="like-reaction-burst-layer" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="like-reaction-particle"
          style={{ '--dx': `${p.dx}px`, '--rot': `${p.rot}deg`, '--scale': p.scale, animationDelay: `${p.delay}ms` } as React.CSSProperties}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
};
