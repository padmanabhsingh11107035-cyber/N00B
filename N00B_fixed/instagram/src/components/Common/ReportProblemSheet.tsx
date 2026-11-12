import React, { useEffect, useRef, useState } from 'react';
import { appVersion, currentPage, currentPlatform, sendUserReport } from '../../utils/errorReporter';
import './reportProblem.css';

// "Report a problem": a bottom sheet that can be opened from anywhere with openReportProblem() (the Settings Help page and the Customer Support window use it).
// It sends the person's own words plus the page path, the app version and the kind of device. No screenshot, nothing else.
export const REPORT_PROBLEM_EVENT = 'noob-report-problem';
export function openReportProblem(): void {
  try { window.dispatchEvent(new Event(REPORT_PROBLEM_EVENT)); } catch { /* nothing to do */ }
}

const NOTE_MAX = 1000;

const Sheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [attached] = useState(() => `${currentPage() || '/'} · version ${appVersion()} · ${currentPlatform()}`);
  useEffect(() => { ref.current?.focus(); }, []);

  const send = async () => {
    const note = text.trim();
    if (busy || !note) return;
    setBusy(true); setError('');
    const ok = await sendUserReport(note);
    setBusy(false);
    if (ok) setDone(true); else setError('It could not be sent. Check your connection and try again.');
  };

  return (
    <div data-noob-sheet="1" className="rp-backdrop fixed inset-0 flex items-end justify-center" onClick={() => { if (!busy) onClose(); }} data-testid="report-problem-sheet">
      <div role="dialog" aria-modal="true" aria-label="Report a problem" className="rp-sheet w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="rp-head">
          <h3 className="rp-title">Report a problem</h3>
        </div>
        {done ? (
          <div className="rp-body" data-testid="report-problem-done">
            <p className="rp-thanks">Thank you - we got it</p>
            <p className="rp-hint">The NOOB team reads every report.</p>
            <button type="button" className="rp-btn" onClick={onClose} data-testid="report-problem-close">Done</button>
          </div>
        ) : (
          <div className="rp-body">
            <label htmlFor="rp-text" className="rp-label">What went wrong?</label>
            <textarea
              id="rp-text" ref={ref} value={text} rows={5} maxLength={NOTE_MAX}
              onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Tell us what you were doing and what happened"
              className="rp-input" data-testid="report-problem-input"
            />
            <p className="rp-attached" data-testid="report-problem-attached">Sent with your words: {attached}. No screenshots.</p>
            {error && <p role="alert" className="rp-error" data-testid="report-problem-error">{error}</p>}
            <div className="rp-actions">
              <button type="button" className="rp-btn rp-btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="rp-btn" onClick={send} disabled={busy || !text.trim()} data-testid="report-problem-send">{busy ? 'Sending...' : 'Send'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** Mounted once; shows nothing until openReportProblem() is called. */
export const ReportProblemHost: React.FC = () => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(REPORT_PROBLEM_EVENT, on);
    return () => window.removeEventListener(REPORT_PROBLEM_EVENT, on);
  }, []);
  return open ? <Sheet onClose={() => setOpen(false)} /> : null;
};
