import React from 'react';

interface VerifiedBadgeProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTooltip?: boolean;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = 'sm',
  className = '',
  showTooltip = true
}) => {
  const sizeMap = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4.5 h-4.5',
    md: 'w-5.5 h-5.5',
    lg: 'w-7.5 h-7.5',
    xl: 'w-10 h-10'
  };

  const iconSize = sizeMap[size] || 'w-4.5 h-4.5';

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 align-middle select-none ${className}`}
      title={showTooltip ? 'Verified Account' : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        aria-label="Verified account"
        className={`${iconSize} drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]`}
      >
        {/* Multi-Edged 16/24-Point Star Rosette in Pure White */}
        <path
          d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.25-1.46-.22-2.94-1.29-4.01-1.07-1.07-2.55-1.54-4.01-1.29C14.09 2.05 12.85 1.17 11.42 1.17s-2.67.88-3.34 2.19c-1.46-.25-2.94.22-4.01 1.29-1.07 1.07-1.54 2.55-1.29 4.01C1.47 9.33.59 10.57.59 12s.88 2.67 2.19 3.34c-.25 1.46.22 2.94 1.29 4.01 1.07 1.07 2.55 1.54 4.01 1.29.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.46.25 2.94-.22 4.01-1.29 1.07-1.07 1.54-2.55 1.29-4.01 1.31-.67 2.19-1.91 2.19-3.34z"
          fill="#FFFFFF"
        />
        {/* Sharp High-Contrast Rosette Edge Overlay */}
        <path
          d="M12 1.75l1.35 1.7 2.16-.27.87 1.98 2.11.51.31 2.15 1.8 1.2-.28 2.15 1.3 1.74-1.3 1.74.28 2.15-1.8 1.2-.31 2.15-2.11.51-.87 1.98-2.16-.27L12 22.25l-1.35-1.7-2.16.27-.87-1.98-2.11-.51-.31-2.15-1.8-1.2.28-2.15-1.3-1.74 1.3-1.74-.28-2.15 1.8-1.2.31-2.15 2.11-.51.87-1.98 2.16.27L12 1.75z"
          fill="#FFFFFF"
        />
        {/* Bold Precision Black Checkmark */}
        <path
          d="M10.2 16.1a1 1 0 0 1-.71-.29l-3.2-3.2a1 1 0 1 1 1.42-1.42l2.49 2.49 5.88-5.88a1 1 0 1 1 1.42 1.42l-6.59 6.59a1 1 0 0 1-.71.29z"
          fill="#000000"
        />
      </svg>
    </span>
  );
};

