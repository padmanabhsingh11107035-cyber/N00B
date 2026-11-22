import React, { useEffect, useRef, useState } from 'react';
import { X, Film, Image as ImageIcon, RefreshCw, ChevronDown } from 'lucide-react';
import { uploadMediaFile, createLongVideo, addLongVideoToReels } from '../../services/api';
import { REEL_FROM_VIDEO_MAX_SECONDS } from '../../utils/videoDuration';
import { LongVideo } from '../../types';
import { maxSecondsThatFit, describeSeconds, MAX_UPLOAD_BYTES } from '../../utils/videoPlan';
import { showErrorDialog } from '../../utils/errorDialog';
import { explainUploadError, type UploadProgress } from '../../utils/uploadProgress';
import { UploadProgressPage } from '../Common/UploadProgressPage';
import { queueRenditions } from '../../utils/videoRenditions';

interface UploadVideoModalProps {
  onClose: () => void;
  onUploaded: (video: LongVideo) => void;
}

const MAX_DURATION_SECONDS = 5 * 60 * 60; // 5 hours

// Nothing after the file is sent may wait for ever: a step that does not answer in time is given up (the cover picture) or reported (saving the video), so the screen
// never sits at "100%" without an end. (A phone's player often never reports a frame for a video it can not show, which used to hold the upload here.)
const withTimeout = <T,>(work: Promise<T>, ms: number, onTimeout: () => T | Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => { Promise.resolve(onTimeout()).then(resolve, reject); }, ms);
    work.then((v) => { window.clearTimeout(timer); resolve(v); }, (e) => { window.clearTimeout(timer); reject(e); });
  });

// What one upload can really hold today: storage takes at most 50 MB a file, so a long video is made smaller on the phone first (videoPlan.ts) and the longest
// that still looks acceptable in 48 MB is about this long (with ordinary sound). A longer video is refused up front, in words, instead of failing after a long wait.
const FIT_SECONDS = maxSecondsThatFit();

// Reads a local video file's duration without uploading it, by loading it into a throwaway <video>
// element — the only reliable way to know this client-side before committing to an upload.
const readVideoDuration = (file: File): Promise<number> =>
  new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Could not read this video file.'));
    };
    video.src = URL.createObjectURL(file);
  });

// When the uploader skips the optional thumbnail, grab a frame from partway into the video itself
// instead of leaving it blank — a blank thumbnail is also what the Home feed card, the chat share
// card and the link-preview spot all fall back to otherwise.
const captureVideoFrame = (file: File): Promise<File | null> =>
  new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => URL.revokeObjectURL(video.src);
    let sought = false;
    // (loadedmetadata as well as loadeddata: an iPhone often reports only the first before anything is played)
    const seek = () => {
      if (sought) return;
      sought = true;
      try { video.currentTime = Math.min(1, (video.duration || 2) / 2); } catch { cleanup(); resolve(null); }
    };
    video.onloadedmetadata = seek;
    video.onloadeddata = seek;
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve(blob ? new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' }) : null);
          },
          'image/jpeg',
          0.85
        );
      } catch {
        cleanup();
        resolve(null);
      }
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = URL.createObjectURL(file);
    video.load();
  });

export const UploadVideoModal: React.FC<UploadVideoModalProps> = ({ onClose, onUploaded }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showMoreVideoOptions, setShowMoreVideoOptions] = useState(false);
  const [addToReels, setAddToReels] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (error) showErrorDialog(error, { onOk: () => setError('') }); }, [error]);   // a problem opens in a box with an OK button
  const [isChecking, setIsChecking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const handlePickVideo = async (file: File) => {
    setError('');
    if (!file.type.startsWith('video/')) {
      setError('Only video files are allowed here.');
      return;
    }
    setIsChecking(true);
    try {
      // The file's own table of contents first (it also works for the iPhone's HEVC .mov, which Chrome can not play); the browser's player as the second way.
      const { probeVideo } = await import('../../utils/videoTranscode');
      const probe = await probeVideo(file);
      const duration = probe ? probe.durationSec : await readVideoDuration(file);
      if (duration > MAX_DURATION_SECONDS) {
        setError(`This video is ${Math.round(duration / 60)} minutes long — the limit here is 5 hours.`);
        return;
      }
      const fits = probe?.audio?.bps ? maxSecondsThatFit(probe.audio.bps) : FIT_SECONDS;
      if (duration > fits && file.size > MAX_UPLOAD_BYTES) {
        setError(`This video is ${describeSeconds(duration)} long. One upload can hold about ${describeSeconds(fits)} of video right now (storage takes 50 MB a file). Please trim it, or upload it in parts.`);
        return;
      }
      setVideoFile(file);
      setDurationSeconds(duration);
      setVideoPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this video file.');
    } finally {
      setIsChecking(false);
    }
  };

  const handlePickThumbnail = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('The thumbnail must be an image.');
      return;
    }
    setThumbnailFile(file);
    setThumbnailPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!videoFile) {
      setError('Pick a video to upload first.');
      return;
    }
    if (!title.trim()) {
      setError('Please give your video a title, then press Upload.');
      return;
    }
    setError('');
    setIsUploading(true);
    const abort = new AbortController();
    abortRef.current = abort;
    setProgress({ stage: 'uploading', fraction: 0 });
    try {
      // the cover picture is taken while the video goes up (not after it): it needs no answer from the server and is given up after a few seconds if the phone can not show a frame
      const frameJob: Promise<File | null> = thumbnailFile ? Promise.resolve(thumbnailFile) : withTimeout(captureVideoFrame(videoFile), 8000, () => null).catch(() => null);
      const videoRes = await uploadMediaFile(videoFile, 'videos', { signal: abort.signal, onProgress: setProgress });
      setProgress({ stage: 'uploading', fraction: 1 });   // "Finishing up"
      let thumbnailUrl: string | undefined;
      const thumbnailToUpload = await frameJob;
      if (thumbnailToUpload) {
        // a cover that can not be sent in time is left out: the video itself is already up and must still be posted
        try { thumbnailUrl = (await withTimeout(uploadMediaFile(thumbnailToUpload, 'videos'), 30000, () => { throw new Error('cover timed out'); })).url; } catch { thumbnailUrl = undefined; }
      }
      const video = await withTimeout(
        createLongVideo({ videoUrl: videoRes.url, thumbnailUrl, title: title.trim(), description: description.trim(), durationSeconds }),
        45000,
        () => { throw new Error('Your video is uploaded, but saving it took too long. Please check your connection, then look on your profile before posting it again.'); }
      );
      // the lower-quality copies (the Feed's quality options) are made quietly in the background from here: posting is not held up
      queueRenditions({ videoId: video.id, source: videoFile, mainHeight: Math.min(videoRes.width || 0, videoRes.height || 0), durationSec: durationSeconds });
      // "Add to Reels": the same file is shown in Reels too (nothing is copied or uploaded again)
      if (addToReels && durationSeconds <= REEL_FROM_VIDEO_MAX_SECONDS) {
        try { await withTimeout(addLongVideoToReels(video.id), 20000, () => { throw new Error('It took too long.'); }); }
        catch (e) { showErrorDialog(`Your video is posted, but it could not be added to Reels: ${e instanceof Error ? e.message : 'please try again from Edit video.'}`, { title: 'Added to Videos only' }); }
      }
      onUploaded(video);
    } catch (err) {
      setError(explainUploadError(err));
    } finally {
      setIsUploading(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      {isUploading && progress && <UploadProgressPage progress={progress} onCancel={() => abortRef.current?.abort()} />}
      <div className="w-full max-w-lg bg-zinc-950 border border-neutral-800 sm:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" data-testid="upload-video-modal">
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <h3 className="text-lg font-extrabold text-white tracking-tight">New video</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-300 hover:text-white p-1.5 rounded-full hover:bg-neutral-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePickVideo(f); e.target.value = ''; }}
          />

          {/* 1. the video */}
          {videoPreviewUrl ? (
            <div className="relative rounded-2xl overflow-hidden bg-black border border-neutral-800">
              <video src={videoPreviewUrl} controls className="w-full max-h-60" />
              <button
                onClick={() => videoInputRef.current?.click()}
                className="absolute top-2 right-2 text-xs font-bold text-white bg-black/70 px-3 py-1.5 rounded-full cursor-pointer"
              >
                Change video
              </button>
            </div>
          ) : (
            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={isChecking}
              data-testid="upload-choose-video"
              className="w-full flex flex-col items-center justify-center gap-3 py-14 rounded-3xl bg-zinc-900 text-white hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-60"
            >
              <span className="w-16 h-16 rounded-full bg-noob text-black flex items-center justify-center">
                {isChecking ? <RefreshCw className="w-7 h-7 animate-spin" /> : <Film className="w-7 h-7" />}
              </span>
              <span className="text-base font-bold">{isChecking ? 'Checking your video…' : 'Choose a video'}</span>
              {!isChecking && <span className="text-xs text-zinc-400 px-6 text-center">Up to about {describeSeconds(FIT_SECONDS)}. You can pick it from your phone or computer.</span>}
            </button>
          )}

          {videoFile && (
            <>
              {/* 2. the title (the only thing that must be filled in) */}
              <div>
                <label htmlFor="upload-title" className="text-sm font-bold text-white block mb-2">Title</label>
                <input
                  id="upload-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={150}
                  placeholder="What is your video called?"
                  className="w-full bg-zinc-900 rounded-2xl px-4 py-3.5 text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-noob/60"
                />
              </div>

              {/* Add to Reels: the same video also plays in Reels (only for a video of up to 10 minutes); nothing is uploaded or stored twice */}
              {durationSeconds > 0 && durationSeconds <= REEL_FROM_VIDEO_MAX_SECONDS && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={addToReels}
                  onClick={() => setAddToReels((v) => !v)}
                  data-testid="upload-add-to-reels"
                  className="w-full flex items-center justify-between gap-3 rounded-2xl bg-zinc-900 px-4 py-3.5 text-left cursor-pointer"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">Add to Reels</span>
                    <span className="block text-xs text-zinc-400">Also show this video in Reels. The same video is used, nothing is saved twice.</span>
                  </span>
                  <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${addToReels ? 'bg-noob' : 'bg-zinc-700'}`}>
                    <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${addToReels ? 'translate-x-5' : ''}`} />
                  </span>
                </button>
              )}

              {/* 3. everything else, when the person wants it */}
              <button
                type="button"
                onClick={() => setShowMoreVideoOptions((v) => !v)}
                aria-expanded={showMoreVideoOptions}
                data-testid="upload-more-options"
                className="w-full flex items-center justify-between rounded-2xl bg-zinc-900 px-4 py-3.5 text-left cursor-pointer"
              >
                <span>
                  <span className="block text-sm font-bold text-white">More options</span>
                  <span className="block text-xs text-zinc-400">Cover picture and description (optional)</span>
                </span>
                <ChevronDown className={`w-5 h-5 text-zinc-300 transition-transform ${showMoreVideoOptions ? 'rotate-180' : ''}`} />
              </button>

              {showMoreVideoOptions && (
                <div className="space-y-5">
                  <div>
                    <span className="text-sm font-bold text-white block mb-2">Cover picture</span>
                    <input
                      ref={thumbInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickThumbnail(f); e.target.value = ''; }}
                    />
                    {thumbnailPreviewUrl ? (
                      <div className="relative w-40 aspect-video rounded-xl overflow-hidden border border-neutral-800">
                        <img src={thumbnailPreviewUrl} alt="Cover" className="w-full h-full object-cover" />
                        <button onClick={() => thumbInputRef.current?.click()} className="absolute inset-0 bg-black/55 opacity-0 hover:opacity-100 flex items-center justify-center text-xs font-bold text-white cursor-pointer transition-opacity">Change</button>
                      </div>
                    ) : (
                      <button onClick={() => thumbInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold cursor-pointer">
                        <ImageIcon className="w-4 h-4" /> Add a cover picture
                      </button>
                    )}
                    <p className="text-xs text-zinc-500 mt-2">No cover? We pick a picture from your video.</p>
                  </div>

                  <div>
                    <label htmlFor="upload-desc" className="text-sm font-bold text-white block mb-2">Description</label>
                    <textarea
                      id="upload-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      rows={3}
                      placeholder="What is this video about?"
                      className="w-full bg-zinc-900 rounded-2xl px-4 py-3 text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-noob/60 resize-none"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0">
          <button
            onClick={handleUpload}
            disabled={!videoFile || isUploading}
            className="w-full py-4 rounded-2xl bg-noob text-black font-extrabold text-base disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
          >
            {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {isUploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};
