import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Volume2, VolumeX, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { birthdayMuted, setBirthdayMuted, startBirthdaySong, stopBirthdaySong } from '../../utils/birthdaySong';
import './birthday.css';

// The birthday box (when it opens: utils/birthdayPopup.ts): "Happy Birthday", a wish, the scratch card and a birthday tune that plays while the box is open (utils/birthdaySong.ts).
// The colours are its own (a party gradient), so it looks the same in dark and light.
interface Props {
  name: string;
  /** the age they turn, when known */
  age: number | null;
  wish: string;
  /** the scratch card the database made for today; without one only the wish is shown */
  cardId?: string;
  onScratch: (cardId: string) => void;
  onClose: () => void;
}

const BALLOONS = ['#FF4D6D', '#FFC62E', '#4DA3FF', '#7BD88F', '#8B5CF6', '#FF8A3D'];

export const BirthdayPopup: React.FC<Props> = ({ name, age, wish, cardId, onScratch, onClose }) => {
  const [muted, setMuted] = useState(birthdayMuted());
  useEffect(() => {
    startBirthdaySong();
    let alive = true;
    const burst = (x: number): void => { if (alive) confetti({ particleCount: 90, spread: 80, startVelocity: 42, origin: { x, y: 0.55 }, zIndex: 9600, colors: BALLOONS }); };
    const t1 = window.setTimeout(() => burst(0.2), 250), t2 = window.setTimeout(() => burst(0.8), 600), t3 = window.setTimeout(() => burst(0.5), 1100);
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { alive = false; window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); window.removeEventListener('keydown', onKey); stopBirthdaySong(); };
  }, [onClose]);

  const toggleSound = (): void => { const next = !muted; setMuted(next); setBirthdayMuted(next); };

  return createPortal(
    <div className="bd-layer" role="dialog" aria-modal="true" aria-label="Happy birthday" data-testid="birthday-popup" data-noob-keep="1" onClick={(e) => e.stopPropagation()}>
      <div className="bd-backdrop" aria-hidden="true" />
      <div className="bd-card">
        <div className="bd-balloons" aria-hidden="true">
          {BALLOONS.map((c, i) => (
            <span key={c} className="bd-balloon" style={{ left: `${17 + i * 13}%`, background: c, animationDelay: `${i * 0.35}s` }}><i style={{ background: c }} /></span>
          ))}
        </div>
        <button type="button" className="bd-x" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <button type="button" className="bd-sound" onClick={toggleSound} aria-label={muted ? 'Turn the birthday tune on' : 'Turn the birthday tune off'} aria-pressed={muted} data-testid="birthday-sound">
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <div className="bd-cake" aria-hidden="true">🎂</div>
        <h2 className="bd-title">Happy Birthday!</h2>
        <p className="bd-name">{name}</p>
        <p className="bd-wish" data-testid="birthday-wish">{wish}</p>
        {cardId ? (
          <button type="button" className="bd-card-btn" onClick={() => { onScratch(cardId); onClose(); }} data-testid="birthday-scratch">
            <Gift size={22} /><span><b>Your birthday gift</b><small>Tap to scratch your card</small></span>
          </button>
        ) : null}
        <button type="button" className="bd-thanks" onClick={onClose} data-testid="birthday-thanks">Thank you 💜</button>
      </div>
    </div>,
    document.body
  );
};
