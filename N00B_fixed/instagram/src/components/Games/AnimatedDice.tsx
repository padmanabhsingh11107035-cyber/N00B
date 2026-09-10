import React, { useEffect, useState } from 'react';

interface AnimatedDiceProps {
  value: number | null;
  isRolling: boolean;
  size?: number;
}

// Relative (%) pip positions for each face, 1-6, laid out like a real die.
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]]
};

// A real-looking dice face that visibly tumbles through random values while
// rolling, then settles on the real result — instead of the value just
// appearing as text once the roll resolves.
export const AnimatedDice: React.FC<AnimatedDiceProps> = ({ value, isRolling, size = 44 }) => {
  const [displayValue, setDisplayValue] = useState(value || 1);

  useEffect(() => {
    if (!isRolling) {
      if (value !== null) setDisplayValue(value);
      return;
    }
    const interval = setInterval(() => {
      setDisplayValue(1 + Math.floor(Math.random() * 6));
    }, 90);
    return () => clearInterval(interval);
  }, [isRolling, value]);

  const pips = PIP_LAYOUTS[displayValue] || PIP_LAYOUTS[1];

  return (
    <div
      className={`relative rounded-xl bg-white border-2 border-zinc-300 shadow-[0_4px_10px_rgba(0,0,0,0.35)] shrink-0 ${
        isRolling ? 'dice-rolling' : ''
      }`}
      style={{ width: size, height: size }}
    >
      {pips.map(([x, y], i) => (
        <span
          key={i}
          className="absolute rounded-full bg-zinc-900"
          style={{
            width: '16%',
            height: '16%',
            left: `${x}%`,
            top: `${y}%`,
            transform: 'translate(-50%, -50%)'
          }}
        />
      ))}
    </div>
  );
};
