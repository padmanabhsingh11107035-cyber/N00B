import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Film, Image as ImageIcon, Loader2, Share2, X } from 'lucide-react';
import { canRecord, makePicture, makeVideo, savePhoto, sharePhoto } from '../../booth/media';
import type { Scene } from '../../booth/scene';
import type { Logo } from '../../booth/frames';
import type { BoothTarget } from './BoothHost';

interface Made { file: File; url: string }

/** The finished picture (and its moving version): look at it, save it, share it, or hand it to the Story / Post / Reel creator. Nothing is published from here. */
export const ResultSheet: React.FC<{ scene: Scene; logo: Logo | null; onClose: () => void; onUse?: (file: File, target: BoothTarget) => void }> = ({ scene, logo, onClose, onUse }) => {
  const [tab, setTab] = useState<'picture' | 'moving'>('picture');
  const [pic, setPic] = useState<Made | null>(null);
  const [vid, setVid] = useState<Made | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const alive = useRef(true);
  const vidUrl = useRef('');
  const moving = canRecord();

  useEffect(() => { alive.current = true; return () => { alive.current = false; if (vidUrl.current) URL.revokeObjectURL(vidUrl.current); }; }, []);

  useEffect(() => {
    let live = true, url = '';
    makePicture(scene, 0.6, logo)
      .then((file) => { if (!live) return; url = URL.createObjectURL(file); setPic({ file, url }); })
      .catch((e: unknown) => { if (live) setErr((e as Error)?.message || 'The picture could not be made.'); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [scene, logo]);

  const buildVideo = useCallback(async () => {
    setBusy(true); setErr(''); setProgress(0);
    try {
      const file = await makeVideo(scene, logo, (f) => { if (alive.current) setProgress(f); });
      if (!alive.current) return;
      const url = URL.createObjectURL(file);
      if (vidUrl.current) URL.revokeObjectURL(vidUrl.current);
      vidUrl.current = url;
      setVid({ file, url });
    } catch (e) {
      if (alive.current) setErr((e as Error)?.message || 'The moving picture could not be made.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [scene, logo]);

  useEffect(() => { if (tab === 'moving' && !vid && !busy && !err) void buildVideo(); }, [tab, vid, busy, err, buildVideo]);
  useEffect(() => { if (!note) return; const id = window.setTimeout(() => setNote(''), 2800); return () => window.clearTimeout(id); }, [note]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const made = tab === 'picture' ? pic : vid;
  const onSave = (): void => { if (made) { savePhoto(made.file); setNote('Saved to your device'); } };
  const onShare = async (): Promise<void> => {
    if (!made) return;
    const r = await sharePhoto(made.file);
    if (r === 'unsupported') { savePhoto(made.file); setNote('Saved. Open it from your downloads or photos to share it.'); }
  };
  const shape = scene.shape === '9:16' ? 'bb-res-tall' : scene.shape === '1:1' ? 'bb-res-square' : 'bb-res-post';

  return (
    <div className="bb-sheet-back" onClick={onClose}>
      <div className="bb-sheet" role="dialog" aria-modal="true" aria-label="Your picture" onClick={(e) => e.stopPropagation()}>
        <div className="bb-sheet-head">
          <div className="bb-seg" role="tablist" aria-label="Picture or moving picture">
            <button type="button" role="tab" aria-selected={tab === 'picture'} className={tab === 'picture' ? 'on' : ''} onClick={() => setTab('picture')}><ImageIcon size={15} /> Picture</button>
            {moving && <button type="button" role="tab" aria-selected={tab === 'moving'} className={tab === 'moving' ? 'on' : ''} onClick={() => setTab('moving')} data-testid="booth-moving-tab"><Film size={15} /> Moving</button>}
          </div>
          <button type="button" className="bb-icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className={`bb-res ${shape}`}>
          {tab === 'picture' && (pic ? <img src={pic.url} alt="Your picture with the frame" draggable={false} data-testid="booth-result-image" /> : err ? <p className="bb-res-msg">{err}</p> : <Loader2 className="bb-spin" size={28} />)}
          {tab === 'moving' && (vid
            ? <video src={vid.url} autoPlay loop muted playsInline data-testid="booth-result-video" />
            : err
              ? <div className="bb-res-msg"><p>{err}</p><button type="button" className="bb-pill" onClick={() => { setErr(''); }}>Try again</button></div>
              : <div className="bb-res-msg"><Loader2 className="bb-spin" size={28} /><p>Making your moving picture…</p><div className="bb-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div></div>)}
        </div>

        {tab === 'picture' && pic && <p className="bb-hint">Touch and hold the picture to save it to your photos.</p>}
        {tab === 'moving' && vid && <p className="bb-hint">It plays in a loop: share it or add it to your Story or Reel.</p>}
        {note && <p className="bb-note" role="status">{note}</p>}

        <div className="bb-actions">
          <button type="button" className="bb-act" disabled={!made} onClick={onSave} data-testid="booth-save"><Download size={18} /> Save</button>
          <button type="button" className="bb-act" disabled={!made} onClick={() => void onShare()} data-testid="booth-share"><Share2 size={18} /> Share</button>
          {onUse && <button type="button" className="bb-act main" disabled={!made} onClick={() => made && onUse(made.file, 'story')} data-testid="booth-to-story">Story</button>}
          {onUse && (tab === 'picture'
            ? <button type="button" className="bb-act main" disabled={!made} onClick={() => made && onUse(made.file, 'post')} data-testid="booth-to-post">Post</button>
            : <button type="button" className="bb-act main" disabled={!made} onClick={() => made && onUse(made.file, 'reel')} data-testid="booth-to-reel">Reel</button>)}
        </div>
      </div>
    </div>
  );
};
