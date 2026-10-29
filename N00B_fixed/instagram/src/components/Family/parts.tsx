import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { initialOf, inviteText, pinHue, type Freshness } from '../../family/geo';
import type { FamilyRoom } from '../../family/api';

// Small pieces the Family Map screens share: a round picture, a switch, a bottom sheet, a message screen, a short toast and the invitation.

/** a round profile picture (a coloured letter when the person has none); the ring says how fresh their place is */
export const Avatar: React.FC<{ id: string; name: string; src: string; size?: number; state?: Freshness | 'paused' }> = ({ id, name, src, size = 44, state = 'none' }) => {
  const [bad, setBad] = React.useState(false);
  const photo = !!src && !bad;
  return (
    <span className={`fm-av fm-av--${state}`} style={{ width: size, height: size, fontSize: size * 0.42, background: photo ? undefined : `hsl(${pinHue(id)} 62% 46%)` }}>
      {photo ? <img src={src} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setBad(true)} /> : initialOf(name)}
    </span>
  );
};

export const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`fm-switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}><span /></button>
);

/** a sheet that slides up over the screen; closes with its X, a tap outside or the Escape key */
export const Modal: React.FC<{ title?: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useEffect(() => {
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="fm-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fm-backdrop" onClick={onClose} />
      <div className="fm-panel">
        <div className="fm-grab" />
        {title && <div className="fm-panel-head"><h2>{title}</h2><button type="button" className="fm-x" onClick={onClose} aria-label="Close"><X size={18} /></button></div>}
        {children}
      </div>
    </div>
  );
};

/** a whole-screen message (not logged in, can not be reached, being set up) */
export const Notice: React.FC<{ icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }> = ({ icon, title, text, children }) => (
  <div className="fm-notice">
    <div className="fm-notice-icon">{icon}</div>
    <h1>{title}</h1>
    <p>{text}</p>
    <div className="fm-notice-actions">{children}</div>
  </div>
);

export const Toast: React.FC<{ text: string }> = ({ text }) => (text ? <div className="fm-toast" role="status">{text}</div> : null);

/** the phone's share sheet when there is one, otherwise the text goes to the clipboard */
export async function shareInvite(room: Pick<FamilyRoom, 'name' | 'code'>, origin: string): Promise<'shared' | 'copied' | 'failed'> {
  const text = inviteText(room.name, room.code, origin);
  try {
    if (typeof navigator.share === 'function') { await navigator.share({ title: 'NOOB Family Map', text }); return 'shared'; }
  } catch (e) { if ((e as DOMException)?.name === 'AbortError') return 'failed'; }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
