import React, { useEffect, useRef, useState } from 'react';
import { Mic, Music2, Loader2, ExternalLink, RotateCcw, Square } from 'lucide-react';
import { PageShell } from '../kit';
import type { PageProps } from '../types';
import { supabase } from '../../../services/supabase';
import { LISTEN_SECONDS, MIN_LISTEN_SECONDS, base64FromDataUrl, loudness, pickRecorderMime, readSongAnswer, songMessage, type SongAnswer } from '../../../utils/songSearch';

// "Search song": play a song on another phone, a speaker or a TV, tap the button, and this phone listens for a few seconds and tells you the song's name.
type Phase = 'ready' | 'listening' | 'searching' | 'done';

export const SearchSongPage: React.FC<PageProps> = ({ back }) => {
  const [phase, setPhase] = useState<Phase>('ready');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [answer, setAnswer] = useState<SongAnswer | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const timer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  const cleanUp = () => {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    try { void ctxRef.current?.close(); } catch { /* already closed */ }
    ctxRef.current = null;
  };
  useEffect(() => () => { try { recorder.current?.state === 'recording' && recorder.current.stop(); } catch { /* gone */ } cleanUp(); }, []);

  const search = async (blob: Blob, mime: string) => {
    setPhase('searching');
    try {
      const reader = new FileReader();
      const url: string = await new Promise((res, rej) => { reader.onload = () => res(String(reader.result)); reader.onerror = () => rej(new Error('read')); reader.readAsDataURL(blob); });
      const { data, error } = await supabase.functions.invoke('dynamic-handler', { body: { action: 'recognize_song', audio: base64FromDataUrl(url), mime } });
      setAnswer(readSongAnswer(data, !!error));
    } catch {
      setAnswer({ kind: 'failed' });
    }
    setPhase('done');
  };

  const start = async () => {
    setProblem(null); setAnswer(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setProblem('This browser cannot listen to sound. Please try another browser or the NOOB app.'); return; }
    const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { setProblem('This browser cannot record sound. Please try another browser or the NOOB app.'); return; }
    try {
      // music is not speech: the phone's voice clean-up (echo, noise, volume) would smear it, so it is switched off
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      stream.current = s;
      chunks.current = [];
      const rec = new MediaRecorder(s, { mimeType: mime });
      recorder.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        const tooShort = (Date.now() - startedAt.current) / 1000 < MIN_LISTEN_SECONDS;
        const blob = new Blob(chunks.current, { type: mime });
        cleanUp();
        if (tooShort || blob.size < 1500) { setAnswer({ kind: 'tooShort' }); setPhase('done'); return; }
        void search(blob, mime);
      };
      // the moving bars
      try {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx: AudioContext = new Ctx();
        ctxRef.current = ctx;
        const an = ctx.createAnalyser(); an.fftSize = 64;
        ctx.createMediaStreamSource(s).connect(an);
        const bytes = new Uint8Array(an.frequencyBinCount);
        const tick = () => { an.getByteFrequencyData(bytes); setLevel(loudness(bytes)); raf.current = requestAnimationFrame(tick); };
        tick();
      } catch { /* the bars are only for show */ }
      startedAt.current = Date.now();
      setSeconds(0);
      setPhase('listening');
      rec.start();
      timer.current = window.setInterval(() => {
        const t = Math.floor((Date.now() - startedAt.current) / 1000);
        setSeconds(t);
        if (t >= LISTEN_SECONDS && rec.state === 'recording') rec.stop();
      }, 250);
    } catch (e) {
      cleanUp();
      const denied = (e as DOMException)?.name === 'NotAllowedError' || (e as DOMException)?.name === 'SecurityError';
      setProblem(denied ? 'The microphone is blocked. Allow it for this site in your browser settings, then try again.' : 'We could not use the microphone. Please check that nothing else is using it.');
      setPhase('ready');
    }
  };
  const stopEarly = () => { if (recorder.current?.state === 'recording') recorder.current.stop(); };
  const again = () => { setAnswer(null); setPhase('ready'); };

  const msg = answer ? songMessage(answer) : null;
  const found = answer?.kind === 'found' ? answer.song : null;
  const bars = [0.55, 0.9, 0.7, 1, 0.65, 0.85, 0.5];

  return (
    <PageShell title="Search song" subtitle="Play a song, we find its name" onBack={back}>
      <div className="px-4 py-6 flex flex-col items-center text-center gap-5" data-testid="search-song">
        {phase === 'ready' && (
          <>
            <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">Play a song or a tune on another phone, a speaker or a TV, hold this phone near it and tap the button. It listens for {LISTEN_SECONDS} seconds and tells you which song it is.</p>
            <button onClick={() => void start()} className="w-28 h-28 rounded-full bg-gradient-to-br from-noob to-noob-strong text-black flex items-center justify-center shadow-[0_0_40px_rgba(0,255,150,0.25)] active:scale-95 transition-transform cursor-pointer" data-testid="song-listen" aria-label="Listen to a song"><Mic className="w-11 h-11" /></button>
            <p className="text-[11px] text-zinc-500">Tap to listen</p>
          </>
        )}
        {phase === 'listening' && (
          <>
            <div className="relative w-28 h-28 flex items-center justify-center" data-testid="song-listening">
              <span className="absolute inset-0 rounded-full bg-noob/20 animate-ping" style={{ opacity: 0.25 + level * 0.6 }} />
              <span className="relative w-24 h-24 rounded-full bg-noob text-black flex items-center justify-center"><Mic className="w-10 h-10" /></span>
            </div>
            <div className="flex items-end gap-1.5 h-10" aria-hidden>
              {bars.map((b, i) => <span key={i} className="w-1.5 rounded-full bg-noob transition-all duration-100" style={{ height: `${10 + Math.round((0.25 + level) * b * 30)}px` }} />)}
            </div>
            <p className="text-sm font-bold text-white">Listening… {Math.min(seconds, LISTEN_SECONDS)}s</p>
            <div className="w-56 h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-noob transition-all duration-300" style={{ width: `${Math.min(100, (seconds / LISTEN_SECONDS) * 100)}%` }} /></div>
            {seconds >= MIN_LISTEN_SECONDS && <button onClick={stopEarly} className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-zinc-700 text-xs font-bold text-zinc-200 cursor-pointer" data-testid="song-stop"><Square className="w-3 h-3" /> Search now</button>}
          </>
        )}
        {phase === 'searching' && (
          <div className="py-8 space-y-3" data-testid="song-searching"><Loader2 className="w-9 h-9 animate-spin text-noob mx-auto" /><p className="text-sm font-bold text-white">Finding the song…</p></div>
        )}
        {phase === 'done' && msg && (
          <div className="w-full max-w-sm space-y-4" data-testid="song-result">
            {found ? (
              <div className="p-4 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-3">
                {found.cover ? <img src={found.cover} alt="" className="w-40 h-40 rounded-2xl object-cover mx-auto" referrerPolicy="no-referrer" /> : <span className="w-24 h-24 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto"><Music2 className="w-10 h-10 text-zinc-500" /></span>}
                <div>
                  <p className="text-lg font-black text-white" data-testid="song-title">{found.title}</p>
                  {found.artist && <p className="text-sm text-zinc-300" data-testid="song-artist">{found.artist}</p>}
                  <p className="text-[11px] text-zinc-500 mt-1">{[found.album, found.releaseDate].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex gap-2 justify-center flex-wrap">
                  {([['Apple Music', found.links.apple], ['Spotify', found.links.spotify], ['More', found.links.other]] as const).filter(([, u]) => u).map(([label, u]) => (
                    <a key={label} href={u} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-100 hover:bg-zinc-700">{label} <ExternalLink className="w-3 h-3" /></a>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-2">
                <span className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto"><Music2 className="w-6 h-6 text-zinc-400" /></span>
                <p className="text-sm font-black text-white" data-testid="song-title">{msg.title}</p>
                <p className="text-xs text-zinc-400 leading-relaxed" data-testid="song-text">{msg.text}</p>
              </div>
            )}
            <button onClick={again} className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-black text-xs font-black mx-auto cursor-pointer" data-testid="song-again"><RotateCcw className="w-3.5 h-3.5" /> Search again</button>
          </div>
        )}
        {problem && <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 max-w-xs" role="alert" data-testid="song-problem">{problem}</p>}
      </div>
    </PageShell>
  );
};
