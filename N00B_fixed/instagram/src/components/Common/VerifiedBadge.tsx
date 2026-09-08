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
        {/* Sharp 14-Point Star Badge in Pure White */}
        <path
          d="M12.00,0.60 L13.91,3.62 L16.95,1.73 L17.36,5.28 L20.91,4.89 L19.75,8.27 L23.11,9.46 L20.60,12.00 L23.11,14.54 L19.75,15.73 L20.91,19.11 L17.36,18.72 L16.95,22.27 L13.91,20.38 L12.00,23.40 L10.09,20.38 L7.05,22.27 L6.64,18.72 L3.09,19.11 L4.25,15.73 L0.89,14.54 L3.40,12.00 L0.89,9.46 L4.25,8.27 L3.09,4.89 L6.64,5.28 L7.05,1.73 L10.09,3.62 Z"
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

