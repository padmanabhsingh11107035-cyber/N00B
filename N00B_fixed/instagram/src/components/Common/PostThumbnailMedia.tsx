import React from 'react';
import { LazyVideo } from './LazyVideo';
import { lookStyle } from '../../utils/slideLook';

interface PostThumbnailMediaProps {
  src?: string;
  mediaType?: 'image' | 'video' | 'code';
  alt?: string;
  className?: string;
  // the slide's `filter` text (a filter id, possibly with the adjustments / shape that went with it — see utils/slideLook.ts)
  filter?: string | null;
}

// Drop-in replacement for a plain thumbnail <img> in a post grid — a video slide's file can't
// render inside an <img> (it just sits there broken/black), so this renders it as a muted,
// non-playing <video> instead, which paints its first frame exactly like a static poster.
export const PostThumbnailMedia: React.FC<PostThumbnailMediaProps> = ({ src, mediaType, alt = '', className = '', filter }) => {
  if (mediaType === 'video' && src) {
    return <LazyVideo src={src} muted playsInline className={className} style={lookStyle(filter)} />;
  }
  return (
    <img loading="lazy" decoding="async"
      src={src || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
      alt={alt}
      className={className}
      style={lookStyle(filter)}
      referrerPolicy="no-referrer"
    />
  );
};
