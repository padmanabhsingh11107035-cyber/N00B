import { useEffect, useRef } from 'react';
import { sendScreenshotAlert, ScreenshotContentType } from '../services/api';

// The PrintScreen key firing a keydown IS a real, verifiable signal — but
// it's also the ONLY one a website ever gets. There is no browser API for
// OS-level screenshot capture (Snipping Tool, a phone's screenshot gesture,
// a screen-mirror, a second camera pointed at the display all bypass this
// completely and always will, on every website, not just this one). Treat
// this as a best-effort deterrent, never as proof a screenshot did or
// didn't happen.
//
// `isActive` lets the caller say "this is the one piece of content someone
// would plausibly be screenshotting right now" — e.g. a post only wires
// this up while it's actually scrolled into view, since a feed has many
// posts on screen referencing different content at once and there'd be no
// way to know which one a PrintScreen press was "about" otherwise.
export function useScreenshotAlert(contentType: ScreenshotContentType, contentId: string | undefined | null, isActive: boolean) {
  const contentIdRef = useRef(contentId);
  contentIdRef.current = contentId;

  useEffect(() => {
    if (!isActive || !contentId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' && contentIdRef.current) {
        sendScreenshotAlert(contentType, contentIdRef.current);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [contentType, isActive, contentId]);
}
