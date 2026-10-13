import React from 'react';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { backStudy, leaveStudy } from './studyStore';

// NOOB STUDY's building blocks. Looks come from the st-* classes in index.css (calm colours, soft corners); nothing here knows about the data.

// ---- subject colours: every subject gets one soft colour for good, from its name
export interface SubjectColor { hex: string; soft: string }
const PALETTE = ['#e38b69', '#7fb7e8', '#8fd0a8', '#b9a3ee', '#f1c76f', '#ee9db6', '#6fcfc4', '#f0a273'];
const soft = (hex: string, a = 0.17): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
export function subjectColor(name: string): SubjectColor {
  let h = 0;
  for (const ch of String(name || '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hex = PALETTE[h % PALETTE.length];
  return { hex, soft: soft(hex) };
}
export const colorVars = (c: SubjectColor): React.CSSProperties => ({ ['--c' as any]: c.hex, ['--c-soft' as any]: c.soft });

export const SubjectTag: React.FC<{ name: string; color?: SubjectColor }> = ({ name, color }) => {
  const c = color || subjectColor(name);
  return <span className="st-subj-tag" style={colorVars(c)}><i className="st-dot" />{name}</span>;
};

// ---- a screen: a header (back, title, a way out to NOOB) and a scrolling body
export const Head: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode; onBack?: () => void; hideBack?: boolean }> = ({ title, subtitle, right, onBack, hideBack }) => (
  <div className="st-head">
    {!hideBack && <button className="st-icon-btn" onClick={onBack || backStudy} aria-label="Back"><ArrowLeft size={18} /></button>}
    <div style={{ minWidth: 0, flex: 1 }}>
      <h1 className="st-title st-h3" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
      {subtitle && <p className="st-tiny st-faint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</p>}
    </div>
    {right}
    <button className="st-icon-btn" onClick={leaveStudy} aria-label="Back to NOOB" title="Back to NOOB"><X size={18} /></button>
  </div>
);

export const Page: React.FC<{
  title: string; subtitle?: string; right?: React.ReactNode; onBack?: () => void; hideBack?: boolean; wide?: boolean; children: React.ReactNode;
}> = ({ title, subtitle, right, onBack, hideBack, wide, children }) => (
  <>
    <Head title={title} subtitle={subtitle} right={right} onBack={onBack} hideBack={hideBack} />
    <div className="st-scroll">
      <div className={`st-wrap ${wide ? 'st-wrap-wide' : ''}`}>{children}</div>
    </div>
  </>
);

export const Card: React.FC<{ children: React.ReactNode; tint?: boolean; style?: React.CSSProperties; className?: string }> = ({ children, tint, style, className }) => (
  <div className={`${tint ? 'st-card-tint' : 'st-card'} ${className || ''}`} style={style}>{children}</div>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'ghost' | 'plain' | 'warn'; small?: boolean; busy?: boolean; block?: boolean }> = ({ kind = 'plain', small, busy, block, children, className, disabled, style, ...rest }) => (
  <button
    {...rest}
    disabled={disabled || busy}
    className={`st-btn ${kind === 'primary' ? 'st-btn-primary' : kind === 'ghost' ? 'st-btn-ghost' : kind === 'warn' ? 'st-btn-soft-danger' : ''} ${small ? 'st-btn-sm' : ''} ${className || ''}`}
    style={{ ...(block ? { width: '100%' } : null), ...style }}
  >
    {busy ? <Loader2 size={16} className="animate-spin" /> : null}{children}
  </button>
);

export const Chip: React.FC<{ on?: boolean; onClick?: () => void; disabled?: boolean; children: React.ReactNode; title?: string }> = ({ on, onClick, disabled, children, title }) => (
  <button type="button" className="st-chip" data-on={on ? 'true' : 'false'} onClick={onClick} disabled={disabled} aria-pressed={!!on} title={title}>{children}</button>
);

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; htmlFor?: string }> = ({ label, hint, children, htmlFor }) => (
  <div className="st-field">
    <label className="st-label" htmlFor={htmlFor}>{label}</label>
    {children}
    {hint && <p className="st-tiny st-faint" style={{ marginTop: 5 }}>{hint}</p>}
  </div>
);

export const Sheet: React.FC<{ title?: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="st-sheet-back" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
    <div className="st-sheet" onClick={(e) => e.stopPropagation()}>
      {title && <h2 className="st-title st-h2" style={{ marginBottom: 12 }}>{title}</h2>}
      {children}
    </div>
  </div>
);

export const Empty: React.FC<{ icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }> = ({ icon, title, text, action }) => (
  <div className="st-card-flat" style={{ textAlign: 'center', padding: '26px 18px' }}>
    {icon && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--st-accent)' }}>{icon}</div>}
    <p className="st-title st-h3">{title}</p>
    {text && <p className="st-small st-muted" style={{ marginTop: 6, maxWidth: 320, marginInline: 'auto' }}>{text}</p>}
    {action && <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>{action}</div>}
  </div>
);

export const Skeleton: React.FC<{ height?: number; style?: React.CSSProperties }> = ({ height = 72, style }) => <div className="st-skel" style={{ height, ...style }} aria-hidden="true" />;
export const Loading: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div style={{ display: 'grid', gap: 10 }} aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={i === 0 ? 110 : 72} />)}</div>
);

export const ErrorBox: React.FC<{ text: string; onRetry?: () => void }> = ({ text, onRetry }) => (
  <div className="st-notice st-notice-warn" role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
    <span>{text}</span>
    {onRetry && <Btn small onClick={onRetry}>Try again</Btn>}
  </div>
);

export const ProgressBar: React.FC<{ value: number; label?: string }> = ({ value, label }) => (
  <div className="st-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
);

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
  <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="st-row-btn" style={{ justifyContent: 'space-between' }}>
    <span style={{ minWidth: 0 }}>
      <span className="st-title st-h3" style={{ display: 'block' }}>{label}</span>
      {hint && <span className="st-tiny st-muted" style={{ display: 'block', marginTop: 2 }}>{hint}</span>}
    </span>
    <span style={{ width: 44, height: 26, borderRadius: 99, background: on ? 'var(--st-ok)' : 'var(--st-surface2)', border: '1px solid var(--st-border)', position: 'relative', flex: 'none', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: 99, background: '#fff', transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} />
    </span>
  </button>
);

// the friendly tutor "orb" (an animated glow, not a face: nothing to be uncomfortable about)
// The AI tutor's face: the NOOB STUDY logo, drawn from the vector so it is sharp at any size
export const Orb: React.FC<{ size?: number; float?: boolean }> = ({ size = 48, float }) => (
  <img src="/noob-study-logo.svg" alt="" width={size} height={size} className={`st-logo ${float ? 'st-float' : ''}`} style={{ width: size, height: size, flex: 'none' }} aria-hidden="true" draggable={false} />
);
