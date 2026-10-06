import React, { useRef, useState } from 'react';
import { X, Film, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { uploadMediaFile, createLongVideo } from '../../services/api';
import { LongVideo } from '../../types';

interface UploadVideoModalProps {
  onClose: () => void;
  onUploaded: (video: LongVideo) => void;
}

const MAX_DURATION_SECONDS = 2 * 60 * 60; // 2 hours

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

export const UploadVideoModal: React.FC<UploadVideoModalProps> = ({ onClose, onUploaded }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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
      const duration = await readVideoDuration(file);
      if (duration > MAX_DURATION_SECONDS) {
        setError(`This video is ${Math.round(duration / 60)} minutes long — the limit here is 2 hours.`);
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
    setError('');
    setIsUploading(true);
    try {
      const videoRes = await uploadMediaFile(videoFile, 'videos');
      let thumbnailUrl: string | undefined;
      if (thumbnailFile) {
        const thumbRes = await uploadMediaFile(thumbnailFile, 'videos');
        thumbnailUrl = thumbRes.url;
      }
      const video = await createLongVideo({
        videoUrl: videoRes.url,
        thumbnailUrl,
        title: title.trim(),
        description: description.trim(),
        durationSeconds
      });
      onUploaded(video);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload this video. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg bg-[#0e0e0e] border border-neutral-800 sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
          <h3 className="text-sm font-bold text-white">Upload a Video</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-neutral-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePickVideo(f); e.target.value = ''; }}
          />
          {videoPreviewUrl ? (
            <div className="relative rounded-xl overflow-hidden bg-black border border-neutral-800">
              <video src={videoPreviewUrl} controls className="w-full max-h-56" />
              <button
                onClick={() => videoInputRef.current?.click()}
                className="absolute top-2 right-2 text-[11px] font-bold text-white bg-black/70 px-2.5 py-1 rounded-full cursor-pointer"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={() => videoInputRef.current?.click()}
              disabled={isChecking}
              className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl border-2 border-dashed border-neutral-700 text-zinc-400 hover:border-[#00FF66]/50 hover:text-[#00FF66] transition-colors cursor-pointer disabled:opacity-60"
            >
              {isChecking ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Film className="w-6 h-6" />}
              <span className="text-xs font-semibold">{isChecking ? 'Checking video…' : 'Tap to choose a video (up to 2 hours)'}</span>
            </button>
          )}

          {videoFile && (
            <>
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={150}
                  placeholder="Give your video a title"
                  className="w-full bg-black rounded-xl border border-neutral-700 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00FF66]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Thumbnail (optional)</label>
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickThumbnail(f); e.target.value = ''; }}
                />
                {thumbnailPreviewUrl ? (
                  <div className="relative w-32 aspect-video rounded-lg overflow-hidden border border-neutral-800">
                    <img src={thumbnailPreviewUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                    <button
                      onClick={() => thumbInputRef.current?.click()}
                      className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center text-[10px] font-bold text-white cursor-pointer transition-opacity"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => thumbInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-700 text-zinc-400 hover:border-[#00FF66]/50 hover:text-[#00FF66] text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> Add a thumbnail
                  </button>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="What's this video about?"
                  className="w-full bg-black rounded-xl border border-neutral-700 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00FF66] resize-none"
                />
              </div>
            </>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">{error}</div>
          )}
        </div>

        <div className="p-3.5 border-t border-neutral-800 shrink-0">
          <button
            onClick={handleUpload}
            disabled={!videoFile || isUploading}
            className="w-full py-3 rounded-xl bg-[#00FF66] text-black font-bold text-sm disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
          >
            {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {isUploading ? 'Uploading…' : 'Upload Video'}
          </button>
        </div>
      </div>
    </div>
  );
};
