import React, { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Send, Loader2, SwitchCamera, Users, UserPlus } from 'lucide-react';
import { User } from '../../types';
import { sendInstant, deleteInstant, fetchCloseFriends } from '../../services/api';
import type { CloseFriend } from '../../services/api';

interface InstantCameraProps {
  currentUser: User;
  onClose: () => void;
  onSent: () => void;
}

// Camera-only, like Instagram's Instants — no gallery picker, no video, just a quick photo. Capture ->
// caption -> pick Friends or Close Friends -> Send, with a short "Undo" window right after.
export const InstantCamera: React.FC<InstantCameraProps> = ({ currentUser, onClose, onSent }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState('');
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<'friends' | 'close_friends'>('friends');
  const [closeFriendsCount, setCloseFriendsCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentId, setSentId] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCamera = async (mode: 'user' | 'environment') => {
    stopStream();
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError('Camera access was blocked. Please allow it in your browser settings to post an instant.');
    }
  };

  useEffect(() => {
    if (!photoBlob) startCamera(facingMode);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, photoBlob]);

  useEffect(() => {
    fetchCloseFriends().then((res) => {
      if (res.success) setCloseFriendsCount(res.friends.filter((f: CloseFriend) => f.isCloseFriend).length);
    });
    return () => { if (photoUrl) URL.revokeObjectURL(photoUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Front camera feels natural mirrored on screen — but a mirrored photo reads backwards to anyone
    // who receives it, so un-mirror it right here before saving.
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopStream();
      setPhotoBlob(blob);
      setPhotoUrl(URL.createObjectURL(blob));
    }, 'image/jpeg', 0.9);
  };

  const handleRetake = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoBlob(null);
    setPhotoUrl('');
    setCaption('');
    setError('');
  };

  const handleSend = async () => {
    if (!photoBlob) return;
    setSending(true);
    setError('');
    const file = new File([photoBlob], `instant-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const res = await sendInstant(file, caption.trim(), audience);
    setSending(false);
    if (!res.success || !res.id) { setError(res.error || 'Could not send your instant.'); return; }
    setSentId(res.id);
    onSent();
  };

  const handleUndo = async () => {
    if (!sentId) return;
    setUndoing(true);
    await deleteInstant(sentId);
    setUndoing(false);
    onClose();
  };

  if (sentId) {
    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col items-center justify-center gap-4 p-6 text-center">
        {photoUrl && <img src={photoUrl} alt="" className="w-40 h-40 rounded-3xl object-cover border border-zinc-700" />}
        <p className="text-white text-sm font-bold">Instant sent!</p>
        <p className="text-zinc-400 text-xs max-w-xs">
          {audience === 'close_friends' ? 'Your Close Friends' : 'Your friends'} can open it once — it disappears after that, or in 24 hours.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleUndo}
            disabled={undoing}
            className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {undoing ? 'Undoing...' : 'Undo'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 bg-noob text-black rounded-2xl text-xs font-bold cursor-pointer">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 shrink-0">
        <button onClick={onClose} className="p-2 rounded-full bg-black/50 text-white cursor-pointer">
          <X className="w-5 h-5" />
        </button>
        <span className="text-white text-sm font-bold">New Instant</span>
        {!photoBlob ? (
          <button
            onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
            className="p-2 rounded-full bg-black/50 text-white cursor-pointer"
            title="Flip camera"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        ) : (
          <span className="w-9" />
        )}
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {photoBlob ? (
          <img src={photoUrl} alt="Your instant" className="max-h-full max-w-full object-contain rounded-2xl" />
        ) : cameraError ? (
          <p className="text-rose-400 text-xs text-center px-8">{cameraError}</p>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
          />
        )}
      </div>

      <div className="p-4 space-y-3 shrink-0">
        {photoBlob && (
          <>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 100))}
              placeholder="Add a caption..."
              className="w-full bg-zinc-900 text-xs text-white px-3.5 py-2.5 rounded-2xl border border-zinc-800 outline-none focus:border-noob"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAudience('friends')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border ${
                  audience === 'friends' ? 'bg-noob/20 text-noob border-noob/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                }`}
              >
                <Users className="w-3.5 h-3.5" /> Friends
              </button>
              <button
                onClick={() => setAudience('close_friends')}
                disabled={closeFriendsCount === 0}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed ${
                  audience === 'close_friends' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                }`}
                title={closeFriendsCount === 0 ? 'Add someone to your Close Friends first' : undefined}
              >
                <UserPlus className="w-3.5 h-3.5" /> Close Friends{closeFriendsCount ? ` (${closeFriendsCount})` : ''}
              </button>
            </div>
            {error && <p className="text-[11px] text-rose-400">{error}</p>}
          </>
        )}

        <div className="flex items-center justify-center gap-4 pt-1">
          {photoBlob ? (
            <>
              <button
                onClick={handleRetake}
                disabled={sending}
                className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl cursor-pointer disabled:opacity-50"
                title="Retake"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 max-w-xs py-3 bg-noob hover:opacity-90 text-black rounded-2xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending...' : 'Send Instant'}
              </button>
            </>
          ) : (
            <button
              onClick={handleCapture}
              disabled={!!cameraError}
              className="w-16 h-16 rounded-full bg-white border-4 border-zinc-700 cursor-pointer disabled:opacity-40 active:scale-95 transition-transform"
              title="Take photo"
            />
          )}
        </div>
      </div>
    </div>
  );
};
