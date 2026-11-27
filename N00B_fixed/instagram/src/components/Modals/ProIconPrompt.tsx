import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight } from 'lucide-react';
import './proIconPrompt.css';

// Shown once, in the Android app, right after someone becomes a NOOB Pro member: "Feel the Pro privilege - change your app icon to the special NOOB Pro icon?" with the icon they have now,
// an arrow and the Pro icon, and two buttons, No and Yes. Yes switches the icon on the phone's home screen (utils/appIcon.ts); it can be changed back at any time in Settings and activity > App icon.
interface Props { onYes: () => void; onNo: () => void }

export const ProIconPrompt: React.FC<Props> = ({ onYes, onNo }) => createPortal(
  <div className="pip-layer" role="dialog" aria-modal="true" aria-labelledby="pip-title" data-testid="pro-icon-prompt" data-noob-keep="1" onClick={(e) => e.stopPropagation()}>
    <div className="pip-backdrop" aria-hidden="true" onClick={onNo} />
    <div className="pip-card">
      <div className="pip-body">
        <h2 id="pip-title">Feel the Pro privilege</h2>
        <p>Change your app icon to a special NOOB Pro icon</p>
        <div className="pip-icons" aria-hidden="true">
          <img src="/app-icons/default.png" alt="" width={84} height={84} draggable={false} />
          <ArrowRight size={26} strokeWidth={2.6} />
          <img src="/app-icons/pro-black.png" alt="" width={84} height={84} draggable={false} />
        </div>
      </div>
      <div className="pip-actions">
        <button type="button" className="pip-no" onClick={onNo} data-testid="pro-icon-no">No</button>
        <button type="button" className="pip-yes" onClick={onYes} data-testid="pro-icon-yes">Yes</button>
      </div>
    </div>
  </div>,
  document.body
);
