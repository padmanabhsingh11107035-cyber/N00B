import React, { useId, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Particle {
  id: number;
  x: number; // initial horizontal position %
  color: string;
  size: number;
  rotation: number;
  shape: 'rect' | 'circle' | 'ribbon' | 'star';
  delay: number;
  duration: number;
  drift: number;
}

const LUXE_CONFETTI_COLORS = [
  '#fbbf24', // Amber/Gold
  '#f59e0b', // Deep Gold
  '#f43f5e', // Rose / Ruby
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#ffffff', // Diamond White
];

interface VictoryConfettiProps {
  /** Optional custom title or player name */
  winnerName?: string;
  /** Callback if dismissed */
  onComplete?: () => void;
}

export const VictoryConfetti: React.FC<VictoryConfettiProps> = ({
  winnerName,
}) => {
  // Generate random particles deterministically on mount
  const particles = useMemo<Particle[]>(() => {
    const list: Particle[] = [];
    const count = 70;
    const shapes: ('rect' | 'circle' | 'ribbon' | 'star')[] = ['rect', 'circle', 'ribbon', 'star'];

    for (let i = 0; i < count; i++) {
      list.push({
        id: i,
        x: Math.random() * 100, // 0% to 100% viewport width
        color: LUXE_CONFETTI_COLORS[Math.floor(Math.random() * LUXE_CONFETTI_COLORS.length)],
        size: Math.floor(Math.random() * 10) + 8, // 8px to 18px
        rotation: Math.floor(Math.random() * 360),
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        delay: Math.random() * 0.8,
        duration: 3.2 + Math.random() * 2.2, // 3.2s to 5.4s
        drift: (Math.random() - 0.5) * 120, // horizontal drift px
      });
    }
    return list;
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden select-none">
      {/* Dynamic Golden Ambient Flash */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.45, 0.15, 0.25, 0], scale: [0.8, 1.2, 1.4, 1.6, 2] }}
        transition={{ duration: 3.5, ease: 'easeOut' }}
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full bg-gradient-radial from-amber-400/40 via-yellow-500/15 to-transparent blur-3xl pointer-events-none"
      />

      {/* Floating Victory Ribbon Streamers */}
      <div className="absolute inset-0">
        {particles.map((p) => {
          return (
            <motion.div
              key={p.id}
              initial={{
                top: '-5%',
                left: `${p.x}%`,
                opacity: 0,
                rotate: p.rotation,
                scale: 0.5,
              }}
              animate={{
                top: '108%',
                left: `calc(${p.x}% + ${p.drift}px)`,
                opacity: [0, 1, 1, 0.85, 0],
                rotate: p.rotation + (p.id % 2 === 0 ? 720 : -720),
                scale: [0.5, 1.1, 1, 0.9, 0.4],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                repeatDelay: Math.random() * 1.5,
                ease: 'easeInOut',
              }}
              style={{
                position: 'absolute',
                width: p.shape === 'ribbon' ? p.size * 0.4 : p.size,
                height: p.shape === 'ribbon' ? p.size * 2.4 : p.size,
                backgroundColor: p.shape !== 'star' ? p.color : undefined,
                borderRadius: p.shape === 'circle' ? '9999px' : p.shape === 'ribbon' ? '3px' : '2px',
                boxShadow: `0 0 10px ${p.color}80`,
              }}
            >
              {p.shape === 'star' && (
                <svg
                  viewBox="0 0 24 24"
                  fill={p.color}
                  className="w-full h-full drop-shadow-[0_0_6px_rgba(255,215,0,0.8)]"
                >
                  <path d="M12 2l2.9 6.6 7.1.6-5.3 4.8 1.6 7-6.3-3.6-6.3 3.6 1.6-7-5.3-4.8 7.1-.6L12 2z" />
                </svg>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Center Celebration Sparkle Bursts */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1.4, 0.2],
              x: Math.cos((angle * Math.PI) / 180) * 160,
              y: Math.sin((angle * Math.PI) / 180) * 160,
            }}
            transition={{
              duration: 1.6,
              delay: 0.2 + (idx % 3) * 0.15,
              repeat: Infinity,
              repeatDelay: 2,
              ease: 'easeOut',
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gradient-to-tr from-amber-300 to-yellow-100 shadow-[0_0_12px_#fbbf24]"
          />
        ))}
      </div>
    </div>
  );
};
