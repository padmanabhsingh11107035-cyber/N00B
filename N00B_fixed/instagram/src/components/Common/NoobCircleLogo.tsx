import React from 'react';

interface NoobCircleLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

export const NoobCircleLogo: React.FC<NoobCircleLogoProps> = ({
  size = 'md',
  className = ''
}) => {
  const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-11 h-11',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
    '2xl': 'w-28 h-28'
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full select-none ${sizeMap[size]} ${className}`}
      title="NOOB"
    >
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full drop-shadow-[0_0_12px_rgba(200,255,0,0.4)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer Lime/Neon Yellow Circle with grunge brush border effect */}
        <circle
          cx="100"
          cy="100"
          r="92"
          fill="#D6FF00"
        />
        {/* Brush border stroke ring */}
        <circle
          cx="100"
          cy="100"
          r="92"
          stroke="#050505"
          strokeWidth="6"
          strokeDasharray="180 8 90 6 220 10"
        />
        <circle
          cx="100"
          cy="100"
          r="86"
          stroke="#000000"
          strokeWidth="2"
          strokeOpacity="0.4"
        />

        {/* Four-point stars / sparks */}
        {/* Top Left Star 1 */}
        <path
          d="M 52 50 Q 52 58 44 58 Q 52 58 52 66 Q 52 58 60 58 Q 52 58 52 50 Z"
          fill="#000000"
        />
        {/* Top Left Small Star 2 */}
        <path
          d="M 42 68 Q 42 72 38 72 Q 42 72 42 76 Q 42 72 46 72 Q 42 72 42 68 Z"
          fill="#000000"
        />
        {/* Top Right White Sparkle */}
        <path
          d="M 154 48 Q 154 55 147 55 Q 154 55 154 62 Q 154 55 161 55 Q 154 55 154 48 Z"
          fill="#FFFFFF"
        />
        {/* Bottom Right Star */}
        <path
          d="M 156 142 Q 156 150 148 150 Q 156 150 156 158 Q 156 150 164 150 Q 156 150 156 142 Z"
          fill="#000000"
        />

        {/* Central Bold Lightning Bolts (Black) */}
        <polygon
          points="108,32 68,110 98,110 70,168 132,96 102,96"
          fill="#000000"
        />

        {/* Foreground NOOB Bold Slanted Wordmark in Black */}
        <g transform="rotate(-6 100 108)">
          <text
            x="98"
            y="126"
            textAnchor="middle"
            fill="#000000"
            fontFamily="'Arial Black', 'Impact', sans-serif"
            fontWeight="900"
            fontSize="54"
            fontStyle="italic"
            letterSpacing="-2"
          >
            noob
          </text>
        </g>
      </svg>
    </div>
  );
};
