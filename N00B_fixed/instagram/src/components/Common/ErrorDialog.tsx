import React, { useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import './dialogs.css';

// A box in the middle of the screen with what went wrong and an OK button (sign-up, publishing a post, a video, a story ...). It is opened with showErrorDialog (utils/errorDialog.ts).
export const ErrorDialog: React.FC<{ title: string; message: string; onOk: () => void }> = ({ title, message, onOk }) => {
  const ok = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    ok.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); onOk(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onOk]);
  return (
    <div className="ed-layer" role="alertdialog" aria-modal="true" aria-labelledby="ed-title" aria-describedby="ed-msg" data-noob-keep="1" data-testid="error-dialog" onClick={(e) => e.stopPropagation()}>
      <div className="ed-back" />
      <div className="ed-box">
        <span className="ed-ico" aria-hidden="true"><AlertCircle /></span>
        <h2 id="ed-title">{title}</h2>
        <p id="ed-msg">{message}</p>
        <button ref={ok} type="button" className="ed-ok" onClick={onOk} data-testid="error-dialog-ok">OK</button>
      </div>
    </div>
  );
};
