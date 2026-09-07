import React from 'react';

interface NoobLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  className?: string;
}

export const NoobLogo: React.FC<NoobLogoProps> = ({
  size = 'md',
  showSubtitle = false,
  className = ''
}) => {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl sm:text-4xl',
    xl: 'text-5xl sm:text-6xl'
  };

  return (
    <div className={`flex flex-col items-start select-none ${className}`}>
      <div className="flex items-center gap-2">
        <span
          className={`font-script tracking-wide ${sizeClasses[size]} noob-wordmark`}
          style={{ lineHeight: 1.1 }}
        >
          Noob
        </span>
      </div>
      {showSubtitle && (
        <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 mt-0.5">
          Fun & Connecting People
        </span>
      )}
    </div>
  );
};
