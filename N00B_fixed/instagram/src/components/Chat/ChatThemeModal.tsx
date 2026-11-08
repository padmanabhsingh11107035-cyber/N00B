import React, { useEffect } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { bubbleStyle } from '../../utils/bubbleColor';
import './premium.css';

export const THEME_COLORS = [
  { name: 'White', hex: '#ffffff', note: 'Classic' },
  { name: 'Neon Emerald', hex: '#00FF66', note: 'Fresh green' },
  { name: 'Cyber Cyan', hex: '#00E5FF', note: 'Electric blue' },
  { name: 'Electric Purple', hex: '#D946EF', note: 'Bold violet' },
  { name: 'Sunset Coral', hex: '#FF6B6B', note: 'Warm coral' },
];

interface Props {
  current: string;
  chatName: string;
  onPick: (hex: string) => void;
  onClose: () => void;
}

/** Full-screen "Chat colour" page: a live preview on top, the colours below, one Done button. */
export const ChatThemeModal: React.FC<Props> = ({ current, chatName, onPick, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const cur = current.toLowerCase();
  const picked = THEME_COLORS.find((t) => t.hex.toLowerCase() === cur);
  const dark = cur === '#ffffff' || cur === '#00e5ff' || cur === '#00ff66';
  const out = bubbleStyle(current);
  return (
    <div className="pm-root fixed inset-0 z-[131]" role="dialog" aria-modal="true" aria-label="Chat colour" data-testid="chat-theme-page">
      <div className="pm-top">
        <button type="button" onClick={onClose} className="pm-back" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="pm-top-text">
          <h3 className="pm-title">Chat colour</h3>
          <p className="pm-sub" translate="no">{chatName}</p>
        </div>
      </div>

      <div className="pm-body">
        <div className="pm-col">
          <section>
            <p className="pm-eyebrow">Preview</p>
            <div className="pm-preview">
              <div className="pm-bubble in">Hey! Did you see the new colours?</div>
              <div className="pm-bubble out" style={{ background: out.background, boxShadow: out.boxShadow, color: dark ? '#0b0b12' : '#fff' }}>Yes, this one looks great</div>
              <div className="pm-bubble out" style={{ background: out.background, boxShadow: out.boxShadow, color: dark ? '#0b0b12' : '#fff' }}>{picked ? picked.name : 'Custom colour'}</div>
            </div>
          </section>

          <section>
            <p className="pm-eyebrow">Choose a colour</p>
            <div className="pm-swatches">
              {THEME_COLORS.map((t) => {
                const on = t.hex.toLowerCase() === cur;
                return (
                  <button
                    key={t.hex}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onPick(t.hex)}
                    className={`pm-swatch ${on ? 'on' : ''}`}
                    style={on ? { borderColor: t.hex, boxShadow: `0 0 22px ${t.hex}33` } : undefined}
                  >
                    <i style={{ background: t.hex }} />
                    <span style={{ minWidth: 0 }}><b>{t.name}</b><small>{t.note}</small></span>
                    {on && <span className="pm-check" style={{ background: t.hex }}><Check size={14} strokeWidth={3} /></span>}
                  </button>
                );
              })}
            </div>
            <p className="pm-muted" style={{ marginTop: 12 }}>Your choice is kept on this device for this chat, so it stays exactly as you picked it.</p>
          </section>
        </div>
      </div>

      <div className="pm-foot">
        <div className="pm-foot-in"><button type="button" onClick={onClose} className="pm-btn gold">Done</button></div>
      </div>
    </div>
  );
};
