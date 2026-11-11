import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, Loader2, RotateCcw, Send, X } from 'lucide-react';
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

  const pct = Math.round(progress * 100);
  const canGo = !(kind === 'video' && (vFormats.length === 0 || dur <= 0));
  return (
    <div className="sx-scrim sx-scrim-export fixed inset-0 edge-own z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Export" data-testid="studio-export" onClick={(e) => { if (e.target === e.currentTarget && !working) onClose(); }}>
      <div className="sx-sheet sx-export-sheet w-full sm:max-w-md flex flex-col">
        <div className="sx-sheet-head shrink-0">
          <span className="sx-grab" aria-hidden="true" />
          <h2>{result ? 'Your file is ready' : working ? 'Making your file' : 'Export'}</h2>
          <button onClick={() => { abort.current?.abort(); onClose(); }} aria-label="Close" className="sx-iconbtn sx-hit rounded-full flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="sx-export-body">
          {hasVideo && !working && !result && (
            <Chips cols={2} options={[{ id: 'video', label: 'Video' }, { id: 'image', label: 'This frame as a picture' }]} value={kind} onChange={(k) => setKind(k as Kind)} />
          )}

          {!result && !working && kind === 'image' && (
            <>
              <div className="sx-field">
                <div className="sx-field-label">Format</div>
                <Chips cols={imgFormats.length} options={imgFormats.map((f) => ({ id: f.id, label: f.label }))} value={imgFormat} onChange={(v) => setImgFormat(v as typeof imgFormat)} />
              </div>
              {imgFormat !== 'png' && (
                <div className="sx-field">
                  <div className="sx-field-label">Quality <b>{quality}%</b></div>
                  <input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(parseInt(e.target.value, 10))} className="sx-range w-full" aria-label="Quality" style={{ ['--sx-fill' as string]: `${((quality - 40) / 60) * 100}%` }} />
                </div>
              )}
              <div className="sx-field">
                <div className="sx-field-label">Size <b>{img.w} × {img.h} px</b></div>
                <Chips cols={4} options={[{ id: '0.5', label: 'Small' }, { id: '1', label: 'Standard' }, { id: '2', label: 'Large' }, { id: '4', label: 'Max' }]} value={String(scale)} onChange={(v) => setScale(parseFloat(v))} />
              </div>
            </>
          )}

          {!result && !working && kind === 'video' && (
            vFormats.length === 0 ? (
              <p className="sx-note is-warn">This browser cannot record videos, so a video cannot be made here. Use Chrome, Edge or a recent Safari, or export a picture.</p>
            ) : (
              <>
                <div className="sx-field">
                  <div className="sx-field-label">Format</div>
                  <Chips cols={Math.min(3, vFormats.length)} options={vFormats.map((f) => ({ id: f.id, label: `${f.label}` }))} value={vFormat} onChange={setVFormat} />
                </div>
                <div className="sx-field">
                  <div className="sx-field-label">Quality <b>{vs.w} × {vs.h} px</b></div>
                  <Chips cols={3} options={[{ id: '480', label: '480p' }, { id: '720', label: '720p' }, { id: '1080', label: '1080p' }]} value={String(shortSide)} onChange={(v) => { const s = parseInt(v, 10); setShortSide(s); setMbps(s >= 1080 ? 10 : s >= 720 ? 6 : 3); }} />
                </div>
                <div className="sx-field">
                  <div className="sx-field-label">Frames per second</div>
                  <Chips cols={3} options={[{ id: '24', label: '24' }, { id: '30', label: '30' }, { id: '60', label: '60' }]} value={String(fps)} onChange={(v) => setFps(parseInt(v, 10))} />
                </div>
                <div className="sx-field">
                  <div className="sx-field-label">Bitrate <b>{mbps} Mbps</b></div>
                  <input type="range" min={1} max={25} value={mbps} onChange={(e) => setMbps(parseInt(e.target.value, 10))} className="sx-range w-full" aria-label="Bitrate" style={{ ['--sx-fill' as string]: `${((mbps - 1) / 24) * 100}%` }} />
                </div>
                <label className="sx-switch-row">
                  <span>Include sound{!hasSound && <small>None on the timeline</small>}</span>
                  <input type="checkbox" checked={audio && hasSound} disabled={!hasSound} onChange={(e) => setAudio(e.target.checked)} className="sx-check" />
                </label>
                <p className="sx-note">About {fmtSize(estimateVideoBytes(dur, mbps, audio && hasSound))}. Making the video takes about as long as the video itself ({fmtTime(dur)}). Keep this screen open and on top while it runs.</p>
              </>
            )
          )}

          {working && (
            <div className="sx-working" data-testid="studio-export-progress">
              <div className="sx-working-top"><Loader2 className="w-5 h-5 animate-spin" /><span>{kind === 'video' ? 'Making your video' : 'Making your picture'}</span>{kind === 'video' && <b>{pct}%</b>}</div>
              <div className={`sx-progress ${kind === 'video' ? '' : 'is-indeterminate'}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={kind === 'video' ? pct : undefined}>
                <div className="sx-progress-bar" style={kind === 'video' ? { width: `${pct}%` } : undefined} />
              </div>
              <p className="sx-note">{kind === 'video' ? `Keep this screen open until it reaches 100%. It takes about as long as the video (${fmtTime(dur)}).` : 'This only takes a moment.'}</p>
            </div>
          )}

          {error && (
            <div className="sx-note is-error" role="alert" data-testid="studio-export-error">{error}</div>
          )}

          {result && (
            <div className="sx-done" data-testid="studio-export-done">
              <div className="sx-result">
                {result.kind === 'video' ? <video src={result.url} controls playsInline /> : <img src={result.url} alt="Your finished picture" />}
              </div>
              <p className="sx-done-line"><Check className="w-4 h-4" /><span>Done: {result.w} × {result.h}, {fmtSize(result.blob.size)}. Checked: it opens.</span></p>
              {ctl.onUse && (
                <div className="sx-field">
                  <div className="sx-field-label">Send it on</div>
                  <div className="sx-use-row">
                    <Btn onClick={() => use('post')} data-testid="studio-use-post"><Send className="w-4 h-4" />New post</Btn>
                    {result.kind === 'image' && <Btn onClick={() => use('story')} data-testid="studio-use-story"><Send className="w-4 h-4" />Story</Btn>}
                    {result.kind === 'video' && <Btn onClick={() => use('reel')} data-testid="studio-use-reel"><Send className="w-4 h-4" />Reel</Btn>}
                  </div>
                </div>
              )}
              <p className="sx-fine">
                {ctl.onUse ? 'The buttons above only open the normal Post / Story / Reel screen with your file. Nothing is published until you do it there. ' : ''}
                The file was made on this device and has not been uploaded anywhere.
              </p>
            </div>
          )}
          {kind === 'video' && dur <= 0 && !result && !working && <p className="sx-note is-warn">Add a clip to the timeline first.</p>}
        </div>

        {!working && (
          <div className="sx-sheet-foot shrink-0">
            {result ? (
              <>
                <Btn className="sx-foot-side" onClick={() => setResult(null)}><RotateCcw className="w-4 h-4" />Change settings</Btn>
                <Btn tone="primary" className="flex-1" onClick={download} data-testid="studio-download"><Download className="w-4 h-4" />Download</Btn>
              </>
            ) : (
              <Btn tone="primary" className="flex-1" disabled={!canGo} onClick={run} data-testid="studio-export-go">{error ? <><RotateCcw className="w-4 h-4" />Try again</> : kind === 'video' ? 'Make the video' : 'Make the picture'}</Btn>
            )}
          </div>
        )}
        {working && (
          <div className="sx-sheet-foot shrink-0"><Btn className="flex-1" onClick={() => abort.current?.abort()}>Cancel</Btn></div>
        )}
      </div>
    </div>
  );
};
