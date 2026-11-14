// "Header colour" (Messages > three dots): pick one of 30 colours for the top of the Messages page. Only that top part changes; chats, bubbles and the rest keep their look.
// The choice shows at once in the preview and on the page behind, and is kept on this device for this account.
import React, { useEffect } from 'react';
import { Check, ChevronLeft, MapPinned, Phone, Search, UserPlus } from 'lucide-react';
import { DEFAULT_HEAD_COLOUR, HEAD_COLOURS, inkFor, setHeadColour, useHeadColour } from '../../utils/chatHeadColour';
import './headColour.css';

export const HeadColourPage: React.FC<{ userId: string; chats: number; onClose: () => void }> = ({ userId, chats, onClose }) => {
  const colour = useHeadColour(userId);
  const ink = inkFor(colour);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const vars = { '--hc-c': colour, '--hc-ink': ink } as React.CSSProperties;

  return (
    <div className="hc-root edge-own" data-noob-keep="1" role="dialog" aria-modal="true" aria-label="Header colour" data-testid="head-colour-page" style={vars}>
      <div className="hc-top">
        <button type="button" className="hc-back" onClick={onClose} aria-label="Back" data-testid="head-colour-back"><ChevronLeft className="w-5 h-5" /></button>
        <div className="min-w-0 flex-1">
          <h2 className="hc-title block truncate">Header colour</h2>
          <p className="hc-sub block truncate">The top of your Messages page</p>
        </div>
      </div>

      <div className="hc-body">
        <div className="hc-in">
          <div className="hc-prev" aria-hidden="true" data-testid="head-colour-preview">
            <div className="hc-prev-head">
              <div className="hc-prev-t"><b>Messages</b><span className="hc-prev-n">{chats}</span></div>
              <div className="hc-prev-btns">
                <span><Search className="w-4 h-4" /></span><span><UserPlus className="w-4 h-4" /></span><span><Phone className="w-4 h-4" /></span><span><MapPinned className="w-4 h-4" /></span>
              </div>
            </div>
            <div className="hc-prev-sheet">
              <div className="hc-prev-row"><i /><span className="flex-1 min-w-0 flex flex-col gap-1.5"><u style={{ width: '46%' }} /><u style={{ width: '72%' }} /></span></div>
              <div className="hc-prev-row"><i /><span className="flex-1 min-w-0 flex flex-col gap-1.5"><u style={{ width: '38%' }} /><u style={{ width: '60%' }} /></span></div>
            </div>
          </div>

          <p className="hc-h">Choose a colour</p>
          <div className="hc-grid" role="radiogroup" aria-label="Header colour" data-testid="head-colour-grid">
            {HEAD_COLOURS.map((c, i) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === colour}
                aria-label={`Colour ${i + 1} of ${HEAD_COLOURS.length}`}
                data-testid={`head-colour-${i + 1}`}
                className="hc-dot"
                style={{ '--c': c, '--ink': inkFor(c) } as React.CSSProperties}
                onClick={() => setHeadColour(userId, c)}
              >
                <Check className="w-[45%] h-[45%]" strokeWidth={3.2} />
              </button>
            ))}
          </div>
          <p className="hc-note">Only the top part of Messages changes. The title and buttons switch between black and white by themselves so they stay easy to read. Saved on this device.</p>
        </div>
      </div>

      <div className="hc-foot">
        <div>
          <button type="button" className="hc-btn" data-k="reset" disabled={colour === DEFAULT_HEAD_COLOUR} onClick={() => setHeadColour(userId, DEFAULT_HEAD_COLOUR)} data-testid="head-colour-reset"><span className="block truncate">Reset to yellow</span></button>
          <button type="button" className="hc-btn" data-k="done" onClick={onClose} data-testid="head-colour-done"><span className="block truncate">Done</span></button>
        </div>
      </div>
    </div>
  );
};
