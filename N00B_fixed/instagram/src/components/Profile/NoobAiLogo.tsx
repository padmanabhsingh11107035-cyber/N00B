import React from 'react';

interface NoobAiLogoProps {
  className?: string;
  // Sleeping: grey (NOOB AI's computer is switched off).
  sleeping?: boolean;
}

// The NOOB AI logo: a smiling face in a black box with curved edges. Same picture as the assistant's own logo (ai.nooob.xyz).
export const NoobAiLogo: React.FC<NoobAiLogoProps> = ({ className = 'w-10 h-10', sleeping = false }) => (
  <img
    src="/noob-ai-logo.png"
    alt=""
    aria-hidden="true"
    draggable={false}
    className={`${className} object-contain select-none`}
    style={sleeping ? { filter: 'grayscale(1) brightness(1.1)' } : undefined}
  />
);
