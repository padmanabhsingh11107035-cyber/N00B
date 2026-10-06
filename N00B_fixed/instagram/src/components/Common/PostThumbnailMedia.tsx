import React from 'react';

interface PostThumbnailMediaProps {
  src?: string;
  mediaType?: 'image' | 'video' | 'code';
  alt?: string;
  className?: string;
}

// Drop-in replacement for a plain thumbnail <img> in a post grid — a video slide's file can't
// render inside an <img> (it just sits there broken/black), so this renders it as a muted,
// non-playing <video> instead, which paints its first frame exactly like a static poster.
export const PostThumbnailMedia: React.FC<PostThumbnailMediaProps> = ({ src, mediaType, alt = '', className = '' }) => {
  if (mediaType === 'video' && src) {
    return <video src={src} muted playsInline preload="metadata" className={className} />;
  }
  return (
    <img
      src={src || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
    />
  );
};
