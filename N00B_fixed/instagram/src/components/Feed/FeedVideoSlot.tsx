import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';
import {
  armFeedVideo,
  enableFeedVideoSound,
  getFeedVideoPlayer,
  getFeedVideoView,
  registerFeedVideo,
  reportFeedVideoVisibility,
  subscribeFeedVideo,
  toggleFeedVideo,
  toggleFeedVideoSound,
  unregisterFeedVideo
} from '../../utils/feedVideo';

// One video of a post on the Home page. It starts by itself, with sound, when it fills the screen, and stops when it leaves (utils/feedVideo.ts decides which one plays).
// What is drawn here: the first moment of the video (a quiet <video> that only loads its header), then, while it is the one that plays, the shared player on top of it,
// a thin progress line, the speaker button, and "Tap for sound" when the phone refuses sound until a tap. A tap on the video pauses and plays it.

const THRESHOLDS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

export const FeedVideoSlot: React.FC<{
  id: string;
  src: string;
  look?: React.CSSProperties;
  /** false when the settings say videos do not start by themselves */
  autoplay: boolean;
  /** width / height of the video, once it is known */
  onAspect?: (ratio: number) => void;
  /** the video is playing with sound right now (the song of the post steps aside) */
  onSound?: (on: boolean) => void;
}> = ({ id, src, look, autoplay, onAspect, onSound }) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const view = useSyncExternalStore(subscribeFeedVideo, getFeedVideoView, getFeedVideoView);
  const mine = view.activeId === id;
  const playing = mine && view.playing;
  const heard = playing && view.sound;

  useEffect(() => { armFeedVideo(); }, []);

  // tell the coordinator about this box, and how much of it is on screen
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    registerFeedVideo(id, { box, src, look: look as Partial<CSSStyleDeclaration> | undefined, autoplay });
    return () => unregisterFeedVideo(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, src, autoplay]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) reportFeedVideoVisibility(id, e.isIntersecting ? e.intersectionRatio : 0);
    }, { threshold: THRESHOLDS });
    io.observe(box);
    return () => { io.disconnect(); reportFeedVideoVisibility(id, 0); };
  }, [id]);

  // the progress line follows the shared player while this is the one that plays
  useEffect(() => {
    if (!mine) { if (barRef.current) barRef.current.style.transform = 'scaleX(0)'; return; }
    const v = getFeedVideoPlayer();
    const bar = barRef.current;
    const tick = () => { if (bar && v.duration > 0) bar.style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`; };
    const meta = () => { if (v.videoWidth && v.videoHeight) onAspect?.(v.videoWidth / v.videoHeight); tick(); };
    v.addEventListener('timeupdate', tick);
    v.addEventListener('loadedmetadata', meta);
    tick();
    if (v.readyState >= 1) meta();
    return () => { v.removeEventListener('timeupdate', tick); v.removeEventListener('loadedmetadata', meta); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine]);

  useEffect(() => { onSound?.(heard); return () => onSound?.(false); }, [heard]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={boxRef} className="fv-box absolute inset-0 overflow-hidden bg-black" data-testid="feed-video" data-playing={playing ? '1' : '0'}>
      {/* the first moment of the video, under the player (it only loads the header of the file) */}
      <video
        src={`${src}#t=0.1`}
        className="absolute inset-0 w-full h-full object-cover"
        style={look}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth && v.videoHeight) onAspect?.(v.videoWidth / v.videoHeight); }}
      />

      {/* a tap anywhere on the video: pause / play */}
      <button
        type="button"
        onClick={() => toggleFeedVideo(id)}
        aria-label={playing ? 'Pause the video' : 'Play the video'}
        className="fv-tap absolute inset-0 z-[2] cursor-pointer"
        data-testid="feed-video-tap"
      />
      {((mine && !playing) || !autoplay) && (
        <span className="fv-play absolute left-1/2 top-1/2 z-[3] -translate-x-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true">
          <Play className="w-7 h-7" fill="currentColor" />
        </span>
      )}

      {/* the speaker: sound on or off for every video */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); toggleFeedVideoSound(); }}
        aria-label={view.wantSound ? 'Turn the sound of videos off' : 'Turn the sound of videos on'}
        aria-pressed={view.wantSound}
        data-testid="feed-video-sound"
        data-no-hit="1"
        className="fv-sound absolute right-3 bottom-4 z-[4] cursor-pointer"
      >
        {view.wantSound && !(mine && view.blocked) ? <Volume2 className="w-[18px] h-[18px]" /> : <VolumeX className="w-[18px] h-[18px]" />}
      </button>
      {mine && view.blocked && (
        <button type="button" onClick={(e) => { e.stopPropagation(); enableFeedVideoSound(); }} className="fv-needs-tap absolute left-3 bottom-4 z-[4] cursor-pointer" data-testid="feed-video-tap-for-sound">
          <VolumeX className="w-4 h-4" aria-hidden="true" />Tap for sound
        </button>
      )}

      <div className="fv-track absolute inset-x-0 bottom-0 z-[4] pointer-events-none" aria-hidden="true">
        <div ref={barRef} className="fv-fill" />
      </div>
    </div>
  );
};
