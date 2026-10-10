import React, { useRef, useState } from 'react';
import { Search, Mic, Square, Play, Pause, Check, X } from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { uploadMediaFile } from '../../services/api';

export interface MusicSelection {
  title: string;
  artist?: string;
  coverUrl?: string;
  audioUrl?: string;
  trackId?: string;
}

interface MusicPickerProps {
  onSelect: (selection: MusicSelection) => void;
  onClose: () => void;
  currentUsername?: string;
}

const MAX_RECORDING_SECONDS = 30;
const RECORD_MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

// Shared between Story/Post/Reel creation: pick a track already uploaded to NOOB's song library,
// or record your own clip on the spot. A recording is attached directly to whatever you're
// creating (its uploaded URL becomes audioUrl) — it does NOT get added to the shared music_tracks
// library, so this never needs the library's own upload/review flow.
export const MusicPicker: React.FC<MusicPickerProps> = ({ onSelect, onClose, currentUsername }) => {
  const { tracks } = useMusicPlayer();
  const [tab, setTab] = useState<'library' | 'record'>('library');
  const [query, setQuery] = useState('');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [recordState, setRecordState] = useState<'idle' | 'recording' | 'preview' | 'uploading'>('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordError, setRecordError] = useState('');
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const q = query.trim().toLowerCase();
  const results = q
    ? tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
    : tracks;

  const togglePreview = (id: string, audioUrl: string) => {
    if (previewingId === id) {
      previewAudioRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    if (previewAudioRef.current) previewAudioRef.current.pause();
    const audio = new Audio(audioUrl);
    audio.play().catch(() => undefined);
    audio.onended = () => setPreviewingId(null);
    previewAudioRef.current = audio;
    setPreviewingId(id);
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setRecordError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = RECORD_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stopStream();
        const blob = new Blob(recordedChunksRef.current, { type: mimeType || 'audio/webm' });
        setRecordedBlobUrl(URL.createObjectURL(blob));
        setRecordState('preview');
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordState('recording');
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => {
          if (s + 1 >= MAX_RECORDING_SECONDS) {
            recorder.stop();
            if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      setRecordError('Could not access your microphone. Check your browser/app permissions.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
  };

  const discardRecording = () => {
    if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
    setRecordedBlobUrl(null);
    setRecordState('idle');
    setRecordSeconds(0);
  };

  const useRecording = async () => {
    if (!recordedBlobUrl) return;
    setRecordState('uploading');
    try {
      const res = await fetch(recordedBlobUrl);
      const blob = await res.blob();
      const file = new File([blob], `recording-${Date.now()}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`, { type: blob.type });
      const uploaded = await uploadMediaFile(file, 'music');
      if (!uploaded.url) throw new Error('Upload failed');
      onSelect({ title: 'Voice recording', artist: currentUsername, audioUrl: uploaded.url });
    } catch {
      setRecordError('Could not upload your recording. Please try again.');
      setRecordState('preview');
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <button onClick={onClose} className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1.5 bg-black/60 rounded-full p-1">
          <button
            onClick={() => setTab('library')}
            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide cursor-pointer ${tab === 'library' ? 'bg-noob text-black' : 'text-gray-300'}`}
          >
            NOOB Songs
          </button>
          <button
            onClick={() => setTab('record')}
            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide cursor-pointer ${tab === 'record' ? 'bg-noob text-black' : 'text-gray-300'}`}
          >
            Record
          </button>
        </div>
        <div className="w-7" />
      </div>

      {tab === 'library' && (
        <div className="flex-1 flex flex-col overflow-hidden px-3 pb-3">
          <div className="relative mb-2 shrink-0">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search NOOB songs"
              className="w-full bg-zinc-900 text-xs text-white pl-8 pr-2 py-2 rounded-xl border border-zinc-800 focus:border-noob outline-none placeholder:text-zinc-600"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {results.length === 0 && <p className="text-center text-[11px] text-zinc-500 py-6">No songs found.</p>}
            {results.map((t) => (
              <div key={t.id} className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-900">
                <button
                  onClick={() => togglePreview(t.id, t.audioUrl)}
                  className="w-9 h-9 rounded-lg overflow-hidden shrink-0 relative cursor-pointer"
                  title="Preview"
                >
                  <img src={t.coverUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    {previewingId === t.id ? <Pause className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 text-white" />}
                  </div>
                </button>
                <button onClick={() => onSelect({ title: t.title, artist: t.artist, coverUrl: t.coverUrl, audioUrl: t.audioUrl, trackId: t.id })} className="flex-1 min-w-0 text-left cursor-pointer">
                  <p className="text-xs font-bold text-white truncate">{t.title}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{t.artist}</p>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'record' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          {recordState === 'idle' && (
            <>
              <button
                onClick={startRecording}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg cursor-pointer transition-transform hover:scale-105"
              >
                <Mic className="w-7 h-7 text-white" />
              </button>
              <p className="text-xs text-zinc-400">Tap to record up to {MAX_RECORDING_SECONDS}s of audio</p>
            </>
          )}
          {recordState === 'recording' && (
            <>
              <button onClick={stopRecording} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg cursor-pointer animate-pulse">
                <Square className="w-6 h-6 text-white" fill="white" />
              </button>
              <p className="text-sm font-bold text-white tabular-nums">{recordSeconds}s / {MAX_RECORDING_SECONDS}s</p>
            </>
          )}
          {(recordState === 'preview' || recordState === 'uploading') && recordedBlobUrl && (
            <>
              <audio src={recordedBlobUrl} controls className="w-full max-w-xs" />
              <div className="flex items-center gap-2.5">
                <button onClick={discardRecording} disabled={recordState === 'uploading'} className="px-3.5 py-1.5 rounded-full bg-neutral-800 text-white text-xs font-bold cursor-pointer disabled:opacity-40">
                  Discard
                </button>
                <button onClick={useRecording} disabled={recordState === 'uploading'} className="px-3.5 py-1.5 rounded-full bg-noob text-black text-xs font-bold cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> {recordState === 'uploading' ? 'Uploading...' : 'Use this recording'}
                </button>
              </div>
            </>
          )}
          {recordError && <p className="text-[11px] text-red-400 text-center">{recordError}</p>}
        </div>
      )}
    </div>
  );
};
