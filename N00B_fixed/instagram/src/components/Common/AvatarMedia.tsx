import React from 'react';

interface AvatarMediaProps {
  src?: string;
  isLiveAvatar?: boolean;
  liveAvatarVideoUrl?: string;
  alt?: string;
  className?: string;
}

// Drop-in replacement for a plain avatar <img> — a real live profile-picture video (see
// LiveProfilePictureModal.tsx) actually plays here instead of sitting there as a still poster frame.
// A curated preset (GIF/WebP) or a normal photo just renders as a plain, still-animating-if-it-is-one
// <img>, exactly as before.
export const AvatarMedia: React.FC<AvatarMediaProps> = ({ src, isLiveAvatar, liveAvatarVideoUrl, alt = '', className = '' }) => {
  if (isLiveAvatar && liveAvatarVideoUrl) {
    return (
      <video
        src={liveAvatarVideoUrl}
        poster={src}
        autoPlay
        loop
        muted
        playsInline
        className={className}
      />
    );
  }
  return <img src={src || '/noob-logo.svg.jpeg'} alt={alt} className={className} referrerPolicy="no-referrer" />;
};
