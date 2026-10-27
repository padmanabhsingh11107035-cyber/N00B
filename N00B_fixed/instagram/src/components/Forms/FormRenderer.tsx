import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Heart, Star, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { uploadFormFile, type UploadedFile } from '../../services/formsApi';
import { acceptList, answerText, checkAnswer, evalFormula, isAnswerable, isVisible, pagesOf, resolveTheme, visibleQuestions, type FormQuestion, type FormSettings, type FormTheme } from '../../utils/forms';

// The form as the person filling it sees it (and as the owner sees it in "Preview"). It is one component for both, so what the owner previews is what people get.
// Nobody needs an account: the top bar has a NOOB button that opens the app, and after sending there is a short celebration, a thank-you and a "Join NOOB" button with a cross.

export interface RenderedForm { id?: string; title: string; description?: string; questions: FormQuestion[]; theme?: FormTheme; settings?: FormSettings }
export interface QuizResult { score: number; max: number; pct: number; passed: boolean | null; answers: Array<{ id: string; correct: boolean; answered: boolean; correctAnswer?: unknown; explanation?: string }> }
interface Props {
  form: RenderedForm;
  preview?: boolean;
  /** sends the answers; resolves with what the server said */
  onSubmit: (answers: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; question?: string; result?: QuizResult | null }>;
  onOpenNoob?: () => void;
  onJoin?: () => void;
  /** the preview device width in px (editor only) */
  width?: number;
}

const ERRORS: Record<string, string> = {
  closed: 'This form is not taking answers any more.', notopen: 'This form is not open yet.', notfound: 'This form is no longer available.', busy: 'Many people are sending answers right now. Please try again in a minute.',
  invalid: 'One of the answers is not valid.', required: 'A required question is empty.', toolong: 'One of the answers is too long.', tooshort: 'One of the answers is too short.', range: 'One of the answers is out of range.'
};

export const FormRenderer: React.FC<Props> = ({ form, preview, onSubmit, onOpenNoob, onJoin, width }) => {
  const t = resolveTheme(form.theme);
  const s = form.settings ?? {};
  const mode = s.presentation ?? 'classic';
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState<'celebrate' | 'thanks' | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const top = useRef<HTMLDivElement | null>(null);

  // hidden fields are filled from the link (?ref=abc) and never shown
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search); const fill: Record<string, unknown> = {};
      for (const q of form.questions) if (q.type === 'hidden' && q.param) { const v = p.get(q.param); if (v) fill[q.id] = v.slice(0, 300); }
      if (Object.keys(fill).length) setAnswers((a) => ({ ...fill, ...a }));
    } catch { /* no link parameters */ }
  }, [form.questions]);

  const pages = useMemo(() => pagesOf(form.questions, answers, mode), [form.questions, answers, mode]);
  const idx = Math.min(page, Math.max(0, pages.length - 1));
  const current = pages[idx] ?? [];
  const last = idx >= pages.length - 1;
  const numberOf = useMemo(() => { let n = 0; const m = new Map<string, number>(); for (const q of form.questions) if (isAnswerable(q.type) && isVisible(q, answers)) m.set(q.id, ++n); return m; }, [form.questions, answers]);

  const set = (id: string, v: unknown) => { setAnswers((a) => ({ ...a, [id]: v })); if (errors[id]) setErrors((e) => { const n = { ...e }; delete n[id]; return n; }); };
  const scrollTop = () => top.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const validate = (qs: FormQuestion[]) => { const e: Record<string, string> = {}; for (const q of qs) { const m = checkAnswer(q, answers[q.id]); if (m) e[q.id] = m; } setErrors((x) => ({ ...x, ...e })); return Object.keys(e).length === 0; };

  const next = async () => {
    setProblem('');
    if (!validate(current)) return;
    if (!last) { setPage(idx + 1); scrollTop(); return; }
    // the whole form once more (a question on an earlier page may have been changed)
    const all = visibleQuestions(form.questions, answers).filter((q) => q.type !== 'section');
    const bad = all.find((q) => checkAnswer(q, answers[q.id]));
    if (bad) { validate(all); setPage(pages.findIndex((p) => p.includes(bad))); return; }
    setSending(true);
    try {
      const visible: Record<string, unknown> = {};
      for (const q of all) if (isAnswerable(q.type) && answers[q.id] !== undefined) visible[q.id] = answers[q.id];
      const r = preview ? { ok: true } : await onSubmit(visible);
      if (r.ok) {
        setResult(r.result ?? null);
        setDone('celebrate');
        if (s.redirectUrl && /^https?:\/\//i.test(s.redirectUrl) && !preview) window.setTimeout(() => { window.location.assign(s.redirectUrl!); }, 4200);
      } else {
        setProblem(ERRORS[r.error ?? ''] ?? 'Your answers were not sent. Please try again.');
        if (r.question) { const at = pages.findIndex((p) => p.some((q) => q.id === r.question)); if (at >= 0) setPage(at); setErrors((e) => ({ ...e, [r.question!]: ERRORS[r.error ?? ''] ?? 'Please check this answer.' })); }
      }
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Your answers were not sent. Please check your connection and try again.'); }
    finally { setSending(false); }
  };

  const progress = pages.length > 1 ? Math.round(((idx + (sending ? 1 : 0)) / pages.length) * 100) : 0;
  const css = { '--f-bg': t.bg, '--f-card': t.card, '--f-text': t.text, '--f-muted': t.muted, '--f-primary': t.primary, '--f-on': t.onPrimary, '--f-border': t.border, '--f-radius': t.radius + 'px', fontFamily: t.font } as React.CSSProperties;

  if (done === 'thanks') {
    return (
      <Shell css={css} t={t} width={width} onOpenNoob={onOpenNoob}>
        <div className="rounded-[var(--f-radius)] p-8 text-center space-y-3" style={{ background: 'var(--f-card)', border: '1px solid var(--f-border)' }} data-testid="form-thanks">
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--f-primary)', color: 'var(--f-on)' }}><Check className="w-7 h-7" /></div>
          <h2 className="text-xl font-bold">Your response was recorded</h2>
          <p style={{ color: 'var(--f-muted)' }}>{s.confirmMessage || 'Thank you for your answers.'}</p>
          {onJoin && <button type="button" onClick={onJoin} className="px-5 py-2.5 rounded-full font-bold cursor-pointer" style={{ background: 'var(--f-primary)', color: 'var(--f-on)' }}>Join NOOB</button>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell css={css} t={t} width={width} onOpenNoob={onOpenNoob}>
      <div ref={top} />
      {preview && <div className="mb-3 text-center text-xs font-semibold px-3 py-2 rounded-full" style={{ background: 'var(--f-card)', border: '1px dashed var(--f-border)', color: 'var(--f-muted)' }} role="status">Preview: nothing you answer here is saved.</div>}
      {idx === 0 && (
        <header className="rounded-[var(--f-radius)] p-6 mb-3" style={{ background: 'var(--f-card)', border: '1px solid var(--f-border)', borderTop: '8px solid var(--f-primary)' }}>
          <h1 className="text-2xl font-bold break-words">{form.title}</h1>
          {form.description && <p className="mt-2 whitespace-pre-wrap break-words" style={{ color: 'var(--f-muted)' }}>{form.description}</p>}
          {form.questions.some((q) => q.required) && <p className="mt-3 text-xs" style={{ color: 'var(--f-muted)' }}><span style={{ color: '#d93025' }}>*</span> Required</p>}
        </header>
      )}
      {s.showProgress !== false && pages.length > 1 && (
        <div className="mb-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progress">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--f-border)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(4, progress)}%`, background: 'var(--f-primary)', transition: 'width .35s ease' }} /></div>
          <p className="text-[11px] mt-1 text-right" style={{ color: 'var(--f-muted)' }}>Page {idx + 1} of {pages.length}</p>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void next(); }} noValidate className="space-y-3">
        {current.map((q) => (
          <QuestionView key={q.id} q={q} n={s.numbering ? numberOf.get(q.id) : undefined} value={answers[q.id]} error={errors[q.id]} onChange={(v) => set(q.id, v)} formId={form.id} preview={preview} calc={q.type === 'calculated' ? evalFormula(q.formula ?? '', answers, form.questions) : undefined} />
        ))}
        {problem && <p role="alert" className="text-sm font-semibold px-1" style={{ color: '#d93025' }}>{problem}</p>}
        <div className="flex items-center justify-between gap-3 pt-1">
          {idx > 0 ? <button type="button" onClick={() => { setPage(idx - 1); scrollTop(); }} className="inline-flex items-center gap-1 px-4 py-2.5 rounded-full font-semibold cursor-pointer" style={{ border: '1px solid var(--f-border)', background: 'var(--f-card)' }}><ChevronLeft className="w-4 h-4" />Back</button> : <span />}
          <button type="submit" disabled={sending} className="inline-flex items-center gap-1 px-6 py-2.5 rounded-full font-bold cursor-pointer disabled:opacity-60" style={{ background: 'var(--f-primary)', color: 'var(--f-on)' }}>
            {sending ? 'Sending…' : last ? 'Submit' : <>Next<ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      </form>
      {done === 'celebrate' && <Celebration t={t} message={s.confirmMessage} onJoin={onJoin} onClose={() => setDone('thanks')} result={result} questions={form.questions} />}
    </Shell>
  );
};

const Shell: React.FC<{ css: React.CSSProperties; t: ReturnType<typeof resolveTheme>; width?: number; onOpenNoob?: () => void; children: React.ReactNode }> = ({ css, t, width, onOpenNoob, children }) => (
  <div style={{ ...css, background: t.bg, color: 'var(--f-text)', minHeight: '100%' }} className="w-full">
    <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 backdrop-blur" style={{ background: 'color-mix(in srgb, var(--f-card) 88%, transparent)', borderBottom: '1px solid var(--f-border)' }}>
      <button type="button" onClick={onOpenNoob} aria-label="Open the NOOB app" data-testid="form-noob-button" className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-black tracking-wide cursor-pointer active:scale-95 transition-transform" style={{ background: 'var(--f-primary)', color: 'var(--f-on)' }}>NOOB</button>
      <span className="text-[11px]" style={{ color: 'var(--f-muted)' }}>Forms by NOOB</span>
    </div>
    <div className="mx-auto px-3 sm:px-4 py-5 pb-20" style={{ maxWidth: width ?? 680 }}>{children}</div>
  </div>
);

const Celebration: React.FC<{ t: ReturnType<typeof resolveTheme>; message?: string; onJoin?: () => void; onClose: () => void; result?: QuizResult | null; questions?: FormQuestion[] }> = ({ t, message, onJoin, onClose, result, questions }) => {
  const pieces = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ id: i, left: 8 + Math.random() * 84, delay: Math.random() * 0.35, dur: 1.6 + Math.random() * 1.2, rot: Math.round(Math.random() * 360), size: 6 + Math.round(Math.random() * 6), hue: [t.primary, '#fbbf24', '#34d399', '#60a5fa', '#f472b6'][i % 5] })), [t.primary]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(8,8,12,.62)', backdropFilter: 'blur(6px)', animation: 'ff-fade .35s ease both' }} role="dialog" aria-modal="true" aria-label="Your response was sent" data-testid="form-success">
      <style>{`
        @keyframes ff-fade{from{opacity:0}to{opacity:1}}
        @keyframes ff-pop{0%{transform:translateY(24px) scale(.92);opacity:0}60%{transform:translateY(-4px) scale(1.02);opacity:1}100%{transform:none;opacity:1}}
        @keyframes ff-ring{to{stroke-dashoffset:0}}
        @keyframes ff-fall{0%{transform:translateY(-20px) rotate(0);opacity:0}10%{opacity:1}100%{transform:translateY(420px) rotate(560deg);opacity:0}}
        @keyframes ff-glow{0%,100%{box-shadow:0 0 0 0 var(--ring)}50%{box-shadow:0 0 0 14px transparent}}
        @media (prefers-reduced-motion: reduce){.ff-anim{animation:none!important}}
      `}</style>
      <div className="ff-anim relative w-full max-w-sm rounded-[28px] px-6 pt-10 pb-7 text-center overflow-hidden" style={{ background: t.card, color: t.text, boxShadow: '0 30px 80px rgba(0,0,0,.45)', animation: 'ff-pop .55s cubic-bezier(.2,.9,.3,1.2) both' }}>
        <button type="button" onClick={onClose} aria-label="Close" data-testid="form-success-close" className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer" style={{ background: 'color-mix(in srgb, currentColor 10%, transparent)' }}><X className="w-5 h-5" /></button>
        {pieces.map((p) => <span key={p.id} aria-hidden="true" className="ff-anim absolute top-0 rounded-[2px]" style={{ left: `${p.left}%`, width: p.size, height: p.size * 1.6, background: p.hue, transform: `rotate(${p.rot}deg)`, animation: `ff-fall ${p.dur}s ${p.delay}s ease-in both` }} />)}
        <div className="ff-anim mx-auto w-24 h-24 rounded-full flex items-center justify-center" style={{ ['--ring' as string]: t.primary + '66', background: t.primary, animation: 'ff-glow 1.8s .5s ease-out 2' }}>
          <svg viewBox="0 0 52 52" className="w-14 h-14" fill="none" stroke={t.onPrimary} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="ff-anim" d="M14 27l9 9 17-19" strokeDasharray="44" strokeDashoffset="44" style={{ animation: 'ff-ring .6s .35s ease-out forwards' }} />
          </svg>
        </div>
        <h2 className="mt-5 text-2xl font-extrabold">Thank you!</h2>
        <p className="mt-1.5 text-sm" style={{ color: t.muted }}>{message || 'Your response was sent.'}</p>
        {result && (
          <div className="mt-4 text-left rounded-2xl p-3 max-h-56 overflow-auto" style={{ background: 'color-mix(in srgb, currentColor 7%, transparent)' }} data-testid="form-quiz-result">
            <p className="text-center text-lg font-extrabold">Your score: {result.score} / {result.max} ({result.pct}%)</p>
            {result.passed != null && <p className="text-center text-sm font-bold" style={{ color: result.passed ? '#16a34a' : '#dc2626' }}>{result.passed ? 'You passed' : 'Not passed this time'}</p>}
            {result.answers.length > 0 && <ul className="mt-2 space-y-2">{result.answers.map((a) => { const q = questions?.find((x) => x.id === a.id); return (
              <li key={a.id} className="text-sm"><span className="font-semibold">{a.correct ? '✓' : '✗'} {q?.title}</span>{!a.correct && a.correctAnswer != null && q && <span className="block" style={{ color: t.muted }}>Right answer: {answerText(q, a.correctAnswer)}</span>}{a.explanation && <span className="block" style={{ color: t.muted }}>{a.explanation}</span>}</li>); })}</ul>}
          </div>)}
        {onJoin && (
          <button type="button" onClick={onJoin} data-testid="form-success-join" className="mt-6 w-full py-3 rounded-full font-extrabold text-base cursor-pointer active:scale-[0.98] transition-transform" style={{ background: t.primary, color: t.onPrimary }}>Join NOOB</button>
        )}
        <p className="mt-3 text-[11px]" style={{ color: t.muted }}>NOOB: reels, chats, games and forms like this one.</p>
      </div>
    </div>
  );
};

const QuestionView: React.FC<{ q: FormQuestion; n?: number; value: unknown; error?: string; onChange: (v: unknown) => void; calc?: number | null; formId?: string; preview?: boolean }> = ({ q, n, value, error, onChange, calc, formId, preview }) => {
  const id = 'f-' + q.id;
  const card = 'rounded-[var(--f-radius)] p-5';
  const cardStyle: React.CSSProperties = { background: 'var(--f-card)', border: `1px solid ${error ? '#d93025' : 'var(--f-border)'}` };
  const field = 'w-full px-3 py-2.5 rounded-[calc(var(--f-radius)*0.6)] outline-none focus-visible:ring-2';
  const fieldStyle: React.CSSProperties = { background: 'transparent', border: '1px solid var(--f-border)', color: 'var(--f-text)', ['--tw-ring-color' as string]: 'var(--f-primary)' };

  if (q.type === 'section') return <div className="pt-2 px-1"><h2 className="text-lg font-bold">{q.title}</h2>{q.description && <p className="text-sm mt-1" style={{ color: 'var(--f-muted)' }}>{q.description}</p>}</div>;
  if (q.type === 'hidden') return null;
  if (q.type === 'calculated') return <div className={card} style={cardStyle}><p className="font-semibold">{q.title}</p><p className="text-2xl font-extrabold mt-1" data-testid="form-calculated">{calc == null ? '-' : calc}</p></div>;
  if (q.type === 'text_block') return <div className={card} style={cardStyle}><p className="font-semibold">{q.title}</p>{q.description && <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: 'var(--f-muted)' }}>{q.description}</p>}</div>;

  const str = typeof value === 'string' ? value : '';
  const text = (type: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input id={id} type={type} value={str} onChange={(e) => onChange(e.target.value)} className={field} style={fieldStyle} aria-invalid={!!error} aria-describedby={error ? id + '-e' : undefined} placeholder={q.placeholder || 'Your answer'} {...extra} />;
  let input: React.ReactNode = null;
  switch (q.type) {
    case 'short': input = text('text', { maxLength: 500 }); break;
    case 'email': input = text('email', { inputMode: 'email', autoComplete: 'email' }); break;
    case 'phone': input = text('tel', { inputMode: 'tel', autoComplete: 'tel' }); break;
    case 'url': input = text('url', { inputMode: 'url' }); break;
    case 'date': input = text('date', { placeholder: undefined }); break;
    case 'time': input = text('time', { placeholder: undefined }); break;
    case 'number': input = <input id={id} type="number" inputMode="decimal" value={typeof value === 'number' ? value : ''} min={q.min} max={q.max} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={field} style={fieldStyle} aria-invalid={!!error} placeholder="Your answer" />; break;
    case 'paragraph': input = <textarea id={id} rows={4} value={str} maxLength={5000} onChange={(e) => onChange(e.target.value)} className={field + ' resize-y'} style={fieldStyle} aria-invalid={!!error} placeholder={q.placeholder || 'Your answer'} />; break;
    case 'dropdown': input = (
      <select id={id} value={str.startsWith('other:') ? '__other' : str} onChange={(e) => onChange(e.target.value === '__other' ? 'other:' : e.target.value)} className={field} style={fieldStyle} aria-invalid={!!error}>
        <option value="">Choose</option>{q.options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}{q.allowOther && <option value="__other">Other…</option>}
      </select>); break;
    case 'multiple_choice': case 'checkboxes': {
      const multi = q.type === 'checkboxes';
      const sel = multi ? (Array.isArray(value) ? (value as string[]) : []) : [str];
      const toggle = (oid: string) => { if (!multi) { onChange(oid); return; } onChange(sel.includes(oid) ? sel.filter((x) => x !== oid) : [...sel, oid]); };
      const other = sel.find((x) => x.startsWith('other:'));
      input = (
        <div role={multi ? 'group' : 'radiogroup'} aria-labelledby={id + '-l'} className="space-y-1.5">
          {q.options?.map((o) => (
            <label key={o.id} className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer" style={{ background: sel.includes(o.id) ? 'color-mix(in srgb, var(--f-primary) 12%, transparent)' : 'transparent' }}>
              <input type={multi ? 'checkbox' : 'radio'} name={id} checked={sel.includes(o.id)} onChange={() => toggle(o.id)} className="w-4 h-4" style={{ accentColor: 'var(--f-primary)' }} /><span className="break-words min-w-0">{o.label}</span>
            </label>))}
          {q.allowOther && (
            <label className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer">
              <input type={multi ? 'checkbox' : 'radio'} name={id} checked={other !== undefined} onChange={() => (other !== undefined ? (multi ? onChange(sel.filter((x) => !x.startsWith('other:'))) : onChange('')) : (multi ? onChange([...sel, 'other:']) : onChange('other:')))} className="w-4 h-4" style={{ accentColor: 'var(--f-primary)' }} />
              <span>Other:</span>
              <input type="text" value={other ? other.slice(6) : ''} maxLength={300} aria-label="Other" onChange={(e) => (multi ? onChange([...sel.filter((x) => !x.startsWith('other:')), 'other:' + e.target.value]) : onChange('other:' + e.target.value))} className="flex-1 min-w-0 bg-transparent outline-none border-b py-1" style={{ borderColor: 'var(--f-border)' }} />
            </label>)}
        </div>); break;
    }
    case 'scale': case 'nps': {
      const lo = q.min ?? (q.type === 'nps' ? 0 : 1), hi = q.max ?? (q.type === 'nps' ? 10 : 5);
      const nums = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      input = (
        <div>
          <div role="radiogroup" aria-labelledby={id + '-l'} className="flex flex-wrap gap-1.5">
            {nums.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className="min-w-[2.5rem] h-10 px-2 rounded-full font-bold text-sm cursor-pointer transition-colors" style={value === v ? { background: 'var(--f-primary)', color: 'var(--f-on)' } : { border: '1px solid var(--f-border)' }}>{v}</button>))}
          </div>
          {(q.minLabel || q.maxLabel) && <div className="flex justify-between mt-1.5 text-xs" style={{ color: 'var(--f-muted)' }}><span>{q.minLabel}</span><span>{q.maxLabel}</span></div>}
        </div>); break;
    }
    case 'rating': {
      const hi = q.max ?? 5;
      input = (
        <div role="radiogroup" aria-labelledby={id + '-l'} className="flex gap-1">
          {Array.from({ length: hi }, (_, i) => i + 1).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={`${v} of ${hi}`} onClick={() => onChange(v)} className="p-1 cursor-pointer"><Star className="w-8 h-8" style={{ color: 'var(--f-primary)' }} fill={typeof value === 'number' && v <= value ? 'currentColor' : 'none'} /></button>))}
        </div>); break;
    }
    case 'heart': {
      const hi = q.max ?? 5;
      input = (
        <div role="radiogroup" aria-labelledby={id + '-l'} className="flex gap-1">
          {Array.from({ length: hi }, (_, i) => i + 1).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={`${v} of ${hi}`} onClick={() => onChange(v)} className="p-1 cursor-pointer"><Heart className="w-8 h-8" style={{ color: 'var(--f-primary)' }} fill={typeof value === 'number' && v <= value ? 'currentColor' : 'none'} /></button>))}
        </div>); break;
    }
    case 'thumbs': input = (
      <div role="radiogroup" aria-labelledby={id + '-l'} className="flex gap-3">
        {(['up', 'down'] as const).map((d) => (
          <button key={d} type="button" role="radio" aria-checked={value === d} aria-label={d === 'up' ? 'Thumbs up' : 'Thumbs down'} onClick={() => onChange(d)} className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer" style={value === d ? { background: 'var(--f-primary)', color: 'var(--f-on)' } : { border: '1px solid var(--f-border)' }}>{d === 'up' ? <ThumbsUp className="w-6 h-6" /> : <ThumbsDown className="w-6 h-6" />}</button>))}
      </div>); break;
    case 'image_choice': {
      const sel = q.multi ? (Array.isArray(value) ? (value as string[]) : []) : [str];
      input = (
        <div role={q.multi ? 'group' : 'radiogroup'} aria-labelledby={id + '-l'} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {q.options?.map((o) => (
            <button key={o.id} type="button" role={q.multi ? 'checkbox' : 'radio'} aria-checked={sel.includes(o.id)} onClick={() => onChange(q.multi ? (sel.includes(o.id) ? sel.filter((x) => x !== o.id) : [...sel, o.id]) : o.id)} className="rounded-xl overflow-hidden text-left cursor-pointer" style={{ border: `3px solid ${sel.includes(o.id) ? 'var(--f-primary)' : 'var(--f-border)'}` }}>
              {o.img && /^https?:\/\//i.test(o.img) ? <img src={o.img} alt={o.label} loading="lazy" className="w-full aspect-square object-cover" /> : <span className="block w-full aspect-square" style={{ background: 'var(--f-border)' }} />}
              <span className="block px-2 py-1.5 text-sm font-semibold break-words">{o.label}</span>
            </button>))}
        </div>); break;
    }
    case 'ranking': {
      const order = Array.isArray(value) ? (value as string[]) : [];
      const move = (i: number, d: number) => { const c = [...order]; const j = i + d; if (j < 0 || j >= c.length) return; [c[i], c[j]] = [c[j], c[i]]; onChange(c); };
      input = (
        <div className="space-y-1.5" aria-labelledby={id + '-l'}>
          <p className="text-xs" style={{ color: 'var(--f-muted)' }}>Tap the options in your order of preference. Tap again to remove.</p>
          {order.map((oid, i) => (
            <div key={oid} className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--f-primary) 12%, transparent)' }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0" style={{ background: 'var(--f-primary)', color: 'var(--f-on)' }}>{i + 1}</span>
              <span className="flex-1 min-w-0 break-words">{q.options?.find((o) => o.id === oid)?.label}</span>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 disabled:opacity-30 cursor-pointer"><ChevronUp className="w-4 h-4" /></button>
              <button type="button" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)} className="p-1 disabled:opacity-30 cursor-pointer"><ChevronDown className="w-4 h-4" /></button>
              <button type="button" aria-label="Remove" onClick={() => onChange(order.filter((x) => x !== oid))} className="p-1 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>))}
          {q.options?.filter((o) => !order.includes(o.id)).map((o) => (
            <button key={o.id} type="button" onClick={() => onChange([...order, o.id])} className="w-full text-left px-3 py-2 rounded-lg cursor-pointer" style={{ border: '1px dashed var(--f-border)' }}>{o.label}</button>))}
        </div>); break;
    }
    case 'grid': {
      const g = (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}) as Record<string, string | string[]>;
      const setCell = (rid: string, cid: string) => { if (q.multi) { const cur = Array.isArray(g[rid]) ? (g[rid] as string[]) : []; onChange({ ...g, [rid]: cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid] }); } else onChange({ ...g, [rid]: cid }); };
      input = (
        <div className="overflow-x-auto" role="group" aria-labelledby={id + '-l'}>
          <table className="w-full text-sm"><thead><tr><th />{q.cols?.map((c) => <th key={c.id} className="px-2 py-1 font-semibold text-center">{c.label}</th>)}</tr></thead>
            <tbody>{q.rows?.map((r) => (
              <tr key={r.id}><th scope="row" className="text-left font-medium pr-3 py-1.5 min-w-[6rem]">{r.label}</th>
                {q.cols?.map((c) => { const on = q.multi ? Array.isArray(g[r.id]) && (g[r.id] as string[]).includes(c.id) : g[r.id] === c.id; return <td key={c.id} className="text-center"><input type={q.multi ? 'checkbox' : 'radio'} name={id + r.id} checked={on} onChange={() => setCell(r.id, c.id)} aria-label={`${r.label}: ${c.label}`} className="w-4 h-4" style={{ accentColor: 'var(--f-primary)' }} /></td>; })}</tr>))}</tbody></table>
        </div>); break;
    }
    case 'signature': input = <SignaturePad value={str} onChange={onChange} />; break;
    case 'file_upload': input = <FileInput q={q} value={value} onChange={onChange} formId={formId} preview={preview} />; break;
    case 'consent': input = (
      <label className="flex items-start gap-3 cursor-pointer"><input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 mt-0.5" style={{ accentColor: 'var(--f-primary)' }} /><span className="break-words min-w-0">{q.description || q.title}</span></label>); break;
    default: break;
  }
  return (
    <fieldset className={card} style={cardStyle} data-testid="form-question">
      <legend className="sr-only">{q.title}</legend>
      <label id={id + '-l'} htmlFor={q.type === 'consent' ? undefined : id} className="block font-semibold mb-1 break-words">{n ? `${n}. ` : ''}{q.title}{q.required && <span style={{ color: '#d93025' }} aria-hidden="true"> *</span>}{q.required && <span className="sr-only"> (required)</span>}</label>
      {q.description && q.type !== 'consent' && <p className="text-sm mb-2 whitespace-pre-wrap break-words" style={{ color: 'var(--f-muted)' }}>{q.description}</p>}
      <div className="mt-2">{input}</div>
      {error && <p id={id + '-e'} role="alert" className="mt-2 text-sm font-semibold" style={{ color: '#d93025' }}>{error}</p>}
    </fieldset>
  );
};

const FileInput: React.FC<{ q: FormQuestion; value: unknown; onChange: (v: unknown) => void; formId?: string; preview?: boolean }> = ({ q, value, onChange, formId, preview }) => {
  const files = Array.isArray(value) ? (value as UploadedFile[]) : [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const allowed = acceptList(q);
  const pick = async (list: FileList | null) => {
    if (!list || !list.length) return;
    if (preview || !formId) { setErr('Files can be attached in the published form (not in the preview).'); return; }
    setErr(''); setBusy(true);
    let cur = files;
    try {
      for (const f of Array.from(list)) {
        if (cur.length >= (q.max ?? 5)) { setErr(`You can attach at most ${q.max ?? 5} files.`); break; }
        cur = [...cur, await uploadFormFile(formId, f, allowed, q.maxSizeMb ?? 10)];
        onChange(cur);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'The file could not be uploaded.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      {files.map((f) => (
        <div key={f.path} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--f-border)' }}>
          <span className="flex-1 min-w-0 truncate">{f.name}</span><span className="text-xs shrink-0" style={{ color: 'var(--f-muted)' }}>{Math.max(1, Math.round(f.size / 1024))} KB</span>
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((x) => x.path !== f.path))} className="p-1 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>))}
      {files.length < (q.max ?? 5) && (
        <label className="block px-3 py-3 rounded-lg text-sm text-center cursor-pointer" style={{ border: '1px dashed var(--f-border)' }}>
          {busy ? 'Uploading…' : files.length ? 'Attach another file' : 'Choose a file'}
          <input type="file" multiple={(q.max ?? 5) > 1} accept={allowed.map((x) => '.' + x).join(',') || undefined} disabled={busy} className="sr-only" onChange={(e) => { const l = e.target.files; void pick(l).then(() => { e.target.value = ''; }); }} />
        </label>)}
      <p className="text-xs" style={{ color: 'var(--f-muted)' }}>{allowed.length ? `Accepted: ${allowed.join(', ')}. ` : ''}Up to {Math.min(10, q.maxSizeMb ?? 10)} MB each. Only the owner of the form can open your files.</p>
      {err && <p role="alert" className="text-sm font-semibold" style={{ color: '#d93025' }}>{err}</p>}
    </div>
  );
};

const SignaturePad: React.FC<{ value: string; onChange: (v: unknown) => void }> = ({ value, onChange }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 400, y: ((e.clientY - r.top) / r.height) * 160 }; };
  const start = (e: React.PointerEvent) => { const c = ref.current?.getContext('2d'); if (!c) return; drawing.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y); c.lineWidth = 3; c.lineCap = 'round'; c.strokeStyle = '#111'; };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const c = ref.current?.getContext('2d'); if (!c) return; const p = pos(e); c.lineTo(p.x, p.y); c.stroke(); };
  const end = () => { if (!drawing.current) return; drawing.current = false; const url = ref.current?.toDataURL('image/png') ?? ''; onChange(url.length <= 60000 ? url : ''); };
  const clear = () => { const c = ref.current?.getContext('2d'); c?.clearRect(0, 0, 400, 160); onChange(''); };
  return (
    <div>
      <canvas ref={ref} width={400} height={160} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} role="img" aria-label={value ? 'Your signature' : 'Sign here with your finger or the mouse'} className="w-full rounded-lg touch-none" style={{ background: '#fff', border: '1px solid var(--f-border)', height: 160 }} />
      <div className="flex justify-between items-center mt-1 text-xs" style={{ color: 'var(--f-muted)' }}><span>Sign above. A drawn signature is a picture of your name; it is not a legal e-signature.</span><button type="button" onClick={clear} className="underline cursor-pointer">Clear</button></div>
    </div>
  );
};

export default FormRenderer;
