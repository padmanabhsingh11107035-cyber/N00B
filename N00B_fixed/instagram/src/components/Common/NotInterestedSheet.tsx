import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { OptionsSheet } from './OptionsSheet';
import './dialogs.css';

// "Not interested": asks why. Square tick boxes, as many as fit, and "Other" last (with a line to write in). The answer is kept on this phone with the choice (utils/feedInterest.ts).
export const NOT_INTERESTED_REASONS = [
  'I do not like this kind of post',
  'I have seen too many like this',
  'It is not relevant to me',
  'I do not like this account',
  'It is spam or misleading',
  'It makes me uncomfortable'
];

export const NotInterestedSheet: React.FC<{ what: 'post' | 'reel'; onClose: () => void; onDone: (reasons: string[]) => void }> = ({ what, onClose, onDone }) => {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const toggle = (r: string) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  const otherOn = picked.includes('Other');
  const rows = [...NOT_INTERESTED_REASONS, 'Other'];
  const finish = (skip: boolean) => {
    const out = skip ? [] : picked.map((r) => (r === 'Other' && other.trim() ? `Other: ${other.trim().slice(0, 120)}` : r));
    onDone(out);
  };
  return (
    <OptionsSheet label="Why are you not interested?" testId="not-interested-sheet" onClose={onClose}>
      <div className="ni-list">
        <h3>Why are you not interested?</h3>
        <p>Tick as many as you like. This helps us show you better {what === 'post' ? 'posts' : 'reels'}.</p>
        {rows.map((r) => (
          <button key={r} type="button" role="checkbox" aria-checked={picked.includes(r)} className="ni-row" onClick={() => toggle(r)} data-testid="ni-reason">
            <span className="ni-box" aria-hidden="true">{picked.includes(r) && <Check />}</span>
            <span>{r}</span>
          </button>
        ))}
        {otherOn && <input className="ni-other" value={other} maxLength={120} onChange={(e) => setOther(e.target.value)} placeholder="Tell us in a few words (optional)" aria-label="Other reason" />}
      </div>
      <div className="ni-actions">
        <button type="button" className="skip" onClick={() => finish(true)}>Skip</button>
        <button type="button" className="go" onClick={() => finish(false)} disabled={picked.length === 0} data-testid="ni-done">Done</button>
      </div>
    </OptionsSheet>
  );
};
