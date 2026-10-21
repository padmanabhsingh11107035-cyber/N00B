import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, RotateCcw, Send, X } from 'lucide-react';
import { IMAGE_FORMATS, VideoFormat, estimateVideoBytes, exportImage, exportVideo, imageSize, supportedImageFormats, supportedVideoFormats, videoSize } from './export';
import { fmtSize, fmtTime } from './assets';
import { Btn, Chips } from './ui';
import type { StudioCtl } from './StudioApp';

// Export: choose the format and size, make the file (on this device), check it, then download it or hand it to Post / Story / Reel. Nothing is uploaded from here.
type Kind = 'image' | 'video';
interface Result { blob: Blob; url: string; name: string; kind: Kind; w: number; h: number }

const safeName = (n: string) => (n.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 60) || 'NOOB Studio');

export const ExportDialog: React.FC<{ ctl: StudioCtl; onClose: () => void }> = ({ ctl, onClose }) => {
  const { project } = ctl;
  const hasVideo = project.mode === 'video';
  const [kind, setKind] = useState<Kind>(hasVideo ? 'video' : 'image');
  const [imgFormats, setImgFormats] = useState(IMAGE_FORMATS);
  const [imgFormat, setImgFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg');
  const [quality, setQuality] = useState(92);
  const [scale, setScale] = useState(1);
  const vFormats = useRef<VideoFormat[]>(supportedVideoFormats()).current;
  const [vFormat, setVFormat] = useState(vFormats[0]?.id || '');
  const [shortSide, setShortSide] = useState(720);
  const [fps, setFps] = useState(30);
  const [mbps, setMbps] = useState(6);
  const [audio, setAudio] = useState(true);
  const [progress, setProgress] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { void supportedImageFormats().then((f) => { if (f.length) { setImgFormats(f); setImgFormat((cur) => (f.some((x) => x.id === cur) ? cur : f[0].id)); } }); }, []);
  useEffect(() => () => { abort.current?.abort(); }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const dur = ctl.duration;
  const img = imageSize(project, scale);
  const vs = videoSize(project, shortSide);
  const hasSound = ctl.player.hasSound();

  const run = async () => {
    setError(''); setProgress(0); setResult(null);
    ctl.player.pause();
    setWorking(true); ctl.setExporting(true);
    const ac = new AbortController();
    abort.current = ac;
    const base = safeName(project.name);
    try {
      if (kind === 'image') {
        const f = IMAGE_FORMATS.find((x) => x.id === imgFormat) || IMAGE_FORMATS[0];
        const blob = await exportImage(project, ctl.assets, { format: f.id, quality: quality / 100, scale }, ctl.player.videoFor, hasVideo ? ctl.player.t : 0);
        setResult({ blob, url: URL.createObjectURL(blob), name: `${base}.${f.ext}`, kind: 'image', w: img.w, h: img.h });
      } else {
        const f = vFormats.find((x) => x.id === vFormat);
        if (!f) throw new Error('This browser cannot record videos. Try Chrome, Edge or Safari 14.1+, or export a picture instead.');
        const blob = await exportVideo(ctl.player, { format: f, shortSide, fps, mbps, audio: audio && hasSound }, setProgress, ac.signal);
        setResult({ blob, url: URL.createObjectURL(blob), name: `${base}.${f.ext}`, kind: 'video', w: vs.w, h: vs.h });
      }
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') setError('Export cancelled. Nothing was saved.');
      else setError(e instanceof Error ? e.message : 'The export failed. Please try again.');
    } finally {
      setWorking(false); ctl.setExporting(false); abort.current = null;
      ctl.player.seek(0);
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url; a.download = result.name;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const use = (target: 'post' | 'story' | 'reel') => {
    if (!result || !ctl.onUse) return;
    ctl.onUse(new File([result.blob], result.name, { type: result.blob.type }), target);
  };

  return (
    <div className="fixed inset-0 z-[10050] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Export" data-testid="studio-export">
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-zinc-950 border border-zinc-800 text-white">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <h2 className="text-[15px] font-black">Export</h2>
          <button onClick={() => { abort.current?.abort(); onClose(); }} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          {hasVideo && !working && !result && (
            <Chips options={[{ id: 'video', label: '🎬 Video' }, { id: 'image', label: '🖼️ This frame as a picture' }]} value={kind} onChange={(k) => setKind(k as Kind)} />
          )}

          {!result && kind === 'image' && (
            <div className="space-y-3">
              <div>
                <div className="text-[11px] font-bold text-zinc-400 mb-1">Format</div>
                <Chips options={imgFormats.map((f) => ({ id: f.id, label: f.label }))} value={imgFormat} onChange={(v) => setImgFormat(v as typeof imgFormat)} />
              </div>
              {imgFormat !== 'png' && (
                <label className="block text-[12px] font-semibold">Quality: {quality}%
                  <input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(parseInt(e.target.value, 10))} className="w-full accent-fuchsia-500" aria-label="Quality" />
                </label>
              )}
              <div>
                <div className="text-[11px] font-bold text-zinc-400 mb-1">Size</div>
                <Chips options={[{ id: '0.5', label: 'Small' }, { id: '1', label: 'Standard' }, { id: '2', label: 'Large' }, { id: '4', label: 'Max' }]} value={String(scale)} onChange={(v) => setScale(parseFloat(v))} />
                <p className="text-[11px] text-zinc-500 mt-1">{img.w} × {img.h} px</p>
              </div>
            </div>
          )}

          {!result && kind === 'video' && (
            <div className="space-y-3">
              {vFormats.length === 0 ? (
                <p className="text-[12px] text-rose-300">This browser cannot record videos, so a video cannot be made here. Use Chrome, Edge or a recent Safari, or export a picture.</p>
              ) : (
                <>
                  <div>
                    <div className="text-[11px] font-bold text-zinc-400 mb-1">Format</div>
                    <Chips options={vFormats.map((f) => ({ id: f.id, label: `${f.label}` }))} value={vFormat} onChange={setVFormat} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-zinc-400 mb-1">Quality</div>
                    <Chips options={[{ id: '480', label: '480p' }, { id: '720', label: '720p' }, { id: '1080', label: '1080p' }]} value={String(shortSide)} onChange={(v) => { const s = parseInt(v, 10); setShortSide(s); setMbps(s >= 1080 ? 10 : s >= 720 ? 6 : 3); }} />
                    <p className="text-[11px] text-zinc-500 mt-1">{vs.w} × {vs.h} px</p>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-zinc-400 mb-1">Frames per second</div>
                    <Chips options={[{ id: '24', label: '24' }, { id: '30', label: '30' }, { id: '60', label: '60' }]} value={String(fps)} onChange={(v) => setFps(parseInt(v, 10))} />
                  </div>
                  <label className="block text-[12px] font-semibold">Bitrate: {mbps} Mbps
                    <input type="range" min={1} max={25} value={mbps} onChange={(e) => setMbps(parseInt(e.target.value, 10))} className="w-full accent-fuchsia-500" aria-label="Bitrate" />
                  </label>
                  <label className="flex items-center justify-between text-[12px] font-semibold">Include sound{!hasSound && ' (none on the timeline)'}
                    <input type="checkbox" checked={audio && hasSound} disabled={!hasSound} onChange={(e) => setAudio(e.target.checked)} className="w-5 h-5 accent-fuchsia-500" />
                  </label>
                  <p className="text-[11px] text-zinc-400 rounded-xl bg-zinc-900 p-2.5">About {fmtSize(estimateVideoBytes(dur, mbps, audio && hasSound))}. Making the video takes about as long as the video itself ({fmtTime(dur)}). Keep this screen open and on top while it runs.</p>
                </>
              )}
            </div>
          )}

          {working && (
            <div className="space-y-2" data-testid="studio-export-progress">
              <div className="flex items-center gap-2 text-[12px] font-bold"><Loader2 className="w-4 h-4 animate-spin" />{kind === 'video' ? `Making your video… ${Math.round(progress * 100)}%` : 'Making your picture…'}</div>
              {kind === 'video' && <div className="h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
              <Btn className="w-full" onClick={() => abort.current?.abort()}>Cancel</Btn>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-400/40 p-3 text-[12px] text-rose-100" role="alert" data-testid="studio-export-error">{error}</div>
          )}

          {result && (
            <div className="space-y-3" data-testid="studio-export-done">
              <div className="rounded-2xl bg-black border border-zinc-800 overflow-hidden flex items-center justify-center max-h-[40vh]">
                {result.kind === 'video' ? <video src={result.url} controls playsInline className="max-h-[40vh] w-full" /> : <img src={result.url} alt="Your finished picture" className="max-h-[40vh] object-contain" />}
              </div>
              <p className="text-[12px] text-emerald-300 font-bold">Done: {result.w} × {result.h}, {fmtSize(result.blob.size)}. Checked: it opens.</p>
              <Btn tone="primary" className="w-full" onClick={download} data-testid="studio-download"><Download className="w-4 h-4" />Download</Btn>
              {ctl.onUse && (
                <div className="grid grid-cols-2 gap-2">
                  <Btn onClick={() => use('post')} data-testid="studio-use-post"><Send className="w-4 h-4" />New post</Btn>
                  {result.kind === 'image' && <Btn onClick={() => use('story')} data-testid="studio-use-story"><Send className="w-4 h-4" />Story</Btn>}
                  {result.kind === 'video' && <Btn onClick={() => use('reel')} data-testid="studio-use-reel"><Send className="w-4 h-4" />Reel</Btn>}
                </div>
              )}
              <p className="text-[10px] text-zinc-500">
                {ctl.onUse ? 'The buttons above only open the normal Post / Story / Reel screen with your file. Nothing is published until you do it there. ' : ''}
                The file was made on this device and has not been uploaded anywhere.
              </p>
            </div>
          )}

          {!working && (
            <div className="flex gap-2">
              {result ? (
                <Btn className="flex-1" onClick={() => setResult(null)}><RotateCcw className="w-4 h-4" />Change settings</Btn>
              ) : (
                <Btn tone="primary" className="flex-1" disabled={kind === 'video' && (vFormats.length === 0 || dur <= 0)} onClick={run} data-testid="studio-export-go">{error ? <><RotateCcw className="w-4 h-4" />Try again</> : kind === 'video' ? 'Make the video' : 'Make the picture'}</Btn>
              )}
            </div>
          )}
          {kind === 'video' && dur <= 0 && !result && <p className="text-[11px] text-amber-300">Add a clip to the timeline first.</p>}
        </div>
      </div>
    </div>
  );
};
