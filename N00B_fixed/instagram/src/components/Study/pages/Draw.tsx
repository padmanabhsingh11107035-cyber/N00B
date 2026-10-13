import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eraser, MessageCircle, Pen, Redo2, Trash2, Undo2 } from 'lucide-react';
import { newRef, studyApi, type SketchStroke } from '../../../services/studyApi';
import {
  INK_DARK, PAPERS, PEN_COLORS, PEN_WIDTHS, SKETCH_H, SKETCH_W, addPoint, cleanStrokes, defaultInk, drawAll, drawPaper, drawTail, fullness, inkFor, isPaper, newHistory, paperCss, pushHistory, redo, undo,
  type Paper, type Stroke
} from '../../../utils/studySketch';
import { useStudy } from '../StudyContext';
import { backStudy, goStudy, replaceStudy } from '../studyStore';
import { hasRoute, type PageProps } from '../StudyApp';
import { Btn, Chip, ErrorBox, Head, Loading, Sheet } from '../ui';

type SaveState = 'saved' | 'saving' | 'dirty' | 'error';

// The sketch board: pen, eraser, colours, widths, undo and redo, four papers. A sketch is kept as lines (small, sharp), saved by itself, and private.
const Draw: React.FC<PageProps> = ({ params }) => {
  const { toast } = useStudy();
  const [sketchId, setSketchId] = useState<string | null>(typeof params.id === 'string' && params.id ? params.id : null);
  const [loaded, setLoaded] = useState(!sketchId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [paper, setPaper] = useState<Paper>('white');
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(INK_DARK);
  const [width, setWidth] = useState(PEN_WIDTHS[1]);
  const [, bump] = useState(0);
  const [state, setState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'clear' | 'delete' | null>(null);

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const hist = useRef(newHistory());
  const live = useRef<Stroke | null>(null);
  const pointer = useRef<number | null>(null);
  const ref = useRef(newRef());
  const idRef = useRef<string | null>(sketchId);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | null>(null);
  const gone = useRef(false);
  const meta = useRef({ title, paper });
  meta.current = { title, paper };

  const redraw = useCallback(() => {
    const c = canvas.current; const ctx = c?.getContext('2d');
    if (c && ctx) drawAll(ctx, strokes.current, 1);
  }, []);

  useEffect(() => {
    if (!sketchId) return;
    let alive = true;
    void studyApi.sketch(sketchId).then((r) => {
      if (!alive) return;
      if (!r.ok) { setLoadError(r.error); return; }
      strokes.current = cleanStrokes(r.data.strokes);
      setTitle(r.data.title); const pp = isPaper(r.data.paper) ? r.data.paper : 'white'; setPaper(pp); setColor(defaultInk(pp));
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) redraw(); }, [loaded, redraw]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current) await inFlight.current;
    if (!dirty.current || gone.current) return;
    const list = strokes.current;
    if (!idRef.current && list.length === 0 && !meta.current.title.trim()) { dirty.current = false; setState('saved'); return; }   // an empty new sketch is never saved
    dirty.current = false;
    setState('saving');
    let failed = false;
    const job = (async () => {
      const r = await studyApi.saveSketch({ id: idRef.current || undefined, clientRef: idRef.current ? undefined : ref.current, title: meta.current.title, strokes: list as SketchStroke[], width: SKETCH_W, height: SKETCH_H, paper: meta.current.paper });
      if (!r.ok) { failed = true; dirty.current = true; setSaveError(r.error); setState('error'); return; }
      idRef.current = r.data.id; setSketchId(r.data.id); setSaveError(null);
      setState(dirty.current ? 'dirty' : 'saved');
    })();
    inFlight.current = job;
    await job;
    inFlight.current = null;
    if (dirty.current && !gone.current && !failed) await flush();
  }, []);

  const touch = (delay = 1500) => {
    dirty.current = true; setState('dirty');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, delay);
  };
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', hide);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', hide); if (!gone.current && dirty.current) void flush(); };
  }, [flush]);

  // ---- drawing
  const toLogical = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * SKETCH_W) / r.width, ((e.clientY - r.top) * SKETCH_H) / r.height];
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (fullness(strokes.current).state === 'full') { toast('This sketch is full. Start a new sketch, or clear some lines.'); return; }
    pointer.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not every browser lets a pointer be captured */ }
    const s: Stroke = { t: tool, c: color, w: width, p: [] };
    const [x, y] = toLogical(e);
    addPoint(s.p, x, y, 0);
    live.current = s;
    const ctx = canvas.current?.getContext('2d'); if (ctx) drawTail(ctx, s, 1);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = live.current;
    if (!s || pointer.current !== e.pointerId) return;
    const ctx = canvas.current?.getContext('2d');
    const evs = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const r = canvas.current!.getBoundingClientRect();
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      if (addPoint(s.p, ((ev.clientX - r.left) * SKETCH_W) / r.width, ((ev.clientY - r.top) * SKETCH_H) / r.height) && ctx) drawTail(ctx, s, 1);
    }
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = live.current;
    if (!s || pointer.current !== e.pointerId) return;
    pointer.current = null; live.current = null;
    pushHistory(hist.current, strokes.current);
    strokes.current = [...strokes.current, s];
    redraw();                      // the whole stroke is drawn again, smoothly, now that it is finished
    bump((n) => n + 1);
    touch();
  };
  const cancel = () => { pointer.current = null; live.current = null; redraw(); };

  const doUndo = () => { const prev = undo(hist.current, strokes.current); if (prev) { strokes.current = prev; redraw(); bump((n) => n + 1); touch(600); } };
  const doRedo = () => { const next = redo(hist.current, strokes.current); if (next) { strokes.current = next; redraw(); bump((n) => n + 1); touch(600); } };
  const clearAll = () => { if (!strokes.current.length) { setConfirm(null); return; } pushHistory(hist.current, strokes.current); strokes.current = []; redraw(); bump((n) => n + 1); setConfirm(null); touch(600); };
  const changePaper = (p: Paper) => { setPaper(p); setColor((c) => inkFor(c, p)); touch(600); };

  // ---- the finished picture: the paper and the drawing together
  const compose = (): HTMLCanvasElement | null => {
    const c = canvas.current; if (!c) return null;
    const out = document.createElement('canvas'); out.width = SKETCH_W; out.height = SKETCH_H;
    const ctx = out.getContext('2d'); if (!ctx) return null;
    drawPaper(ctx, paper, 1);
    ctx.drawImage(c, 0, 0);
    return out;
  };
  const exportPng = async () => {
    const out = compose(); if (!out) return;
    const blob: Blob | null = await new Promise((res) => out.toBlob(res, 'image/png'));
    if (!blob) { toast('Could not make the picture. Please try again.'); return; }
    const name = (title.trim() || 'sketch').replace(/[^\p{L}\p{N}_ -]+/gu, '').slice(0, 40) + '.png';
    const file = new File([blob], name, { type: 'image/png' });
    try {
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (err) { if ((err as Error)?.name === 'AbortError') return; /* otherwise fall back to a download */ }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const askTutor = async () => {
    const out = compose(); if (!out) return;
    if (!strokes.current.length) { toast('Draw something first.'); return; }
    await flush();
    const data = out.toDataURL('image/jpeg', 0.88);     // goes straight to the AI with your question; no copy of the picture is kept on NOOB
    replaceStudy('chat', { images: data, seed: 'Please look at my sketch and help me with it. Tell me what is right and what I can improve.', mode: 'photo' });
  };

  const leave = async () => { await flush(); backStudy(); };
  const remove = async () => {
    gone.current = true;
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (idRef.current) {
      const r = await studyApi.deleteSketch(idRef.current);
      if (!r.ok) { gone.current = false; toast(r.error); setConfirm(null); return; }
    }
    toast('Sketch deleted.');
    replaceStudy('sketch');
  };

  if (loadError) return <><Head title="Sketch" /><div className="st-scroll"><div className="st-wrap"><ErrorBox text={loadError} /></div></div></>;
  if (!loaded) return <><Head title="Sketch" /><div className="st-scroll"><div className="st-wrap"><Loading rows={2} /></div></div></>;

  const full = fullness(strokes.current);
  const status = state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Drawing…' : state === 'error' ? 'Not saved' : (idRef.current ? 'Saved' : 'New sketch');
  return (
    <>
      <Head title={title || 'New sketch'} subtitle={status} onBack={() => void leave()} />
      <div className="st-scroll" style={{ overscrollBehavior: 'contain' }}>
        <div className="st-wrap st-wrap-wide" style={{ display: 'grid', gap: 10 }}>
          {saveError && <ErrorBox text={saveError} onRetry={() => { dirty.current = true; void flush(); }} />}
          {full.state !== 'ok' && <div className="st-notice st-notice-warn" role="status"><p className="st-small">{full.state === 'full' ? 'This sketch is full. Start a new sketch, or undo or clear some lines.' : 'This sketch is almost full. You may want to start a new one soon.'}</p></div>}
          <input className="st-input" placeholder="Name this sketch" value={title} maxLength={100} onChange={(e) => { setTitle(e.target.value); touch(); }} aria-label="Sketch name" />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} role="toolbar" aria-label="Drawing tools">
            <Chip on={tool === 'pen'} onClick={() => setTool('pen')}><Pen size={15} /> Pen</Chip>
            <Chip on={tool === 'eraser'} onClick={() => setTool('eraser')}><Eraser size={15} /> Eraser</Chip>
            <button className="st-icon-btn" onClick={doUndo} disabled={!hist.current.past.length} aria-label="Undo" style={{ opacity: hist.current.past.length ? 1 : 0.4 }}><Undo2 size={17} /></button>
            <button className="st-icon-btn" onClick={doRedo} disabled={!hist.current.future.length} aria-label="Redo" style={{ opacity: hist.current.future.length ? 1 : 0.4 }}><Redo2 size={17} /></button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {tool === 'pen' && PEN_COLORS.map((c) => (
              <button key={c} type="button" aria-label={'Colour ' + c} aria-pressed={color === c} onClick={() => setColor(c)}
                style={{ width: 30, height: 30, borderRadius: 99, background: c, border: color === c ? '3px solid var(--st-accent)' : '2px solid var(--st-border)', boxShadow: 'inset 0 0 0 1px rgba(128, 128, 128, 0.45)', cursor: 'pointer', padding: 0 }} />
            ))}
            <span style={{ width: 1, height: 24, background: 'var(--st-border)', margin: '0 2px' }} />
            {PEN_WIDTHS.map((w) => (
              <button key={w} type="button" aria-label={'Width ' + w} aria-pressed={width === w} onClick={() => setWidth(w)}
                style={{ width: 34, height: 34, borderRadius: 12, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid ' + (width === w ? 'var(--st-accent)' : 'var(--st-border)'), background: width === w ? 'var(--st-accent-soft)' : 'var(--st-surface)' }}>
                <i style={{ display: 'block', width: Math.max(4, Math.min(22, w * (tool === 'eraser' ? 1.4 : 1))), height: Math.max(4, Math.min(22, w * (tool === 'eraser' ? 1.4 : 1))), borderRadius: 99, background: 'var(--st-text)' }} />
              </button>
            ))}
          </div>

          <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', aspectRatio: `${SKETCH_W} / ${SKETCH_H}`, position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--st-border)', boxShadow: 'var(--st-shadow)', ...paperCss(paper) }}>
            <canvas ref={canvas} width={SKETCH_W} height={SKETCH_H} aria-label="Drawing area" role="img"
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }} />
          </div>

          <div className="st-hscroll" role="group" aria-label="Paper">
            {PAPERS.map((p) => <Chip key={p.id} on={paper === p.id} onClick={() => changePaper(p.id)}>{p.label}</Chip>)}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn small onClick={() => void exportPng()}><Download size={14} /> Save as picture</Btn>
            {hasRoute('chat') && <Btn small onClick={() => void askTutor()}><MessageCircle size={14} /> Ask the tutor about it</Btn>}
            <Btn small kind="warn" onClick={() => setConfirm('clear')} disabled={!strokes.current.length}>Clear</Btn>
            {idRef.current && <Btn small kind="warn" onClick={() => setConfirm('delete')}><Trash2 size={14} /> Delete</Btn>}
          </div>
          <p className="st-tiny st-faint">Private to you. If you ask the tutor, the picture goes straight to the AI with your question and no copy of it is kept on NOOB.</p>
        </div>
      </div>

      {confirm === 'clear' && (
        <Sheet title="Clear the whole board?" onClose={() => setConfirm(null)}>
          <p className="st-small st-muted">Every line is removed. You can bring it back with Undo until you leave.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}><Btn kind="ghost" onClick={() => setConfirm(null)}>Keep it</Btn><Btn kind="primary" style={{ flex: 1 }} onClick={clearAll}>Clear</Btn></div>
        </Sheet>
      )}
      {confirm === 'delete' && (
        <Sheet title="Delete this sketch?" onClose={() => setConfirm(null)}>
          <p className="st-small st-muted">It is removed for good. This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}><Btn kind="ghost" onClick={() => setConfirm(null)}>Keep it</Btn><Btn kind="primary" style={{ flex: 1 }} onClick={() => void remove()}>Delete</Btn></div>
        </Sheet>
      )}
    </>
  );
};
export default Draw;
