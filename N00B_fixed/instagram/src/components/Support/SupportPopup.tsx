import React, { useEffect, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import './supportPopup.css';

// The small "Hi, how can we help?" box above the round support picture, on computers and tablets (wide screens). It shows itself a few seconds after the app opens (once per visit), or when the round
// picture is pressed. Typing a message and sending it opens the support chat page and the message goes to the AI at once (CustomerSupportModal initialMessage). The phone keeps its picture only.
interface Props { open: boolean; onClose: () => void; onSend: (text: string) => void; onMore: () => void }

export const SupportPopup: React.FC<Props> = ({ open, onClose, onSend, onMore }) => {
  const [text, setText] = useState('');
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { const t = window.setTimeout(() => box.current?.focus(), 120); return () => window.clearTimeout(t); } }, [open]);
  if (!open) return null;
  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    onSend(t);
  };
  return (
    <div className="spp-wrap" data-testid="support-popup" role="dialog" aria-label="NOOB Support">
      <div className="spp-card">
        <img src="/noob-support-circle.webp" alt="" width={44} height={44} draggable={false} className="spp-ava" />
        <div className="spp-who"><b>NOOB Support</b><span>Hi, how can we help?</span></div>
        <button type="button" className="spp-x" onClick={onClose} aria-label="Close" data-testid="support-popup-close"><X size={16} /></button>
      </div>
      <form className="spp-form" onSubmit={submit}>
        <input ref={box} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your message..." maxLength={500} aria-label="Write your message" data-testid="support-popup-input" />
        <button type="submit" disabled={!text.trim()} aria-label="Send" data-testid="support-popup-send"><Send size={17} /></button>
      </form>
      <button type="button" className="spp-more" onClick={onMore}>More help options</button>
    </div>
  );
};

/** wide screens only (computers and tablets) */
export const useWideScreen = (): boolean => {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
};
