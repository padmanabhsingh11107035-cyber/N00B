import React, { useEffect, useState } from 'react';
import { reportContent } from '../../services/supabaseApi';
import './reportProblem.css';

// "Report" on a post, a reel or a video: a bottom sheet that any of them opens with openContentReport({ type, id }).
// The report goes to the NOOB team (Admin > Safety Reports) with who reported it, what it is (its link) and whose it is. The owner is never told who reported.
export type ReportableKind = 'post' | 'reel' | 'video' | 'story';
export const CONTENT_REPORT_EVENT = 'noob-report-content';
export function openContentReport(target: { type: ReportableKind; id: string }): void {
  try { window.dispatchEvent(new CustomEvent(CONTENT_REPORT_EVENT, { detail: target })); } catch { /* nothing to do */ }
}

const REASONS = ['Spam or scam', 'Nudity or sexual content', 'Violence or dangerous acts', 'Hate, bullying or harassment', 'False information', 'Selling something illegal', 'Something else'];
const LABEL: Record<ReportableKind, string> = { post: 'post', reel: 'reel', video: 'video', story: 'story' };

const Sheet: React.FC<{ target: { type: ReportableKind; id: string }; onClose: () => void }> = ({ target, onClose }) => {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const send = async () => {
    if (busy || !reason) return;
    setBusy(true); setError('');
    const res = await reportContent(target.type, target.id, reason, note.trim());
    setBusy(false);
    if (res.success) setMessage(res.message || 'Thank you. The NOOB team will look at it.'); else setError(res.error || res.message || 'It could not be sent. Please try again.');
  };

  return (
    <div data-noob-sheet="1" className="rp-backdrop fixed inset-0 flex items-end justify-center" onClick={() => { if (!busy) onClose(); }} data-testid="content-report-sheet">
      <div role="dialog" aria-modal="true" aria-label={`Report this ${LABEL[target.type]}`} className="rp-sheet w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="rp-head"><h3 className="rp-title">Report this {LABEL[target.type]}</h3></div>
        {message ? (
          <div className="rp-body" data-testid="content-report-done">
            <p className="rp-thanks">Thank you</p>
            <p className="rp-hint">{message} The person is not told that you reported it.</p>
            <button type="button" className="rp-btn" onClick={onClose}>Done</button>
          </div>
        ) : (
          <div className="rp-body">
            <p className="rp-label">Why are you reporting it?</p>
            <div className="rp-reasons" role="radiogroup">
              {REASONS.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={reason === r} className={`rp-reason${reason === r ? ' is-on' : ''}`} onClick={() => setReason(r)} data-testid="content-report-reason">
                  <span className="rp-dot" aria-hidden="true" />{r}
                </button>
              ))}
            </div>
            <textarea value={note} rows={2} maxLength={500} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Anything to add? (optional)" className="rp-input" style={{ marginTop: 10 }} data-testid="content-report-note" />
            {error && <p role="alert" className="rp-error" data-testid="content-report-error">{error}</p>}
            <div className="rp-actions">
              <button type="button" className="rp-btn rp-btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="rp-btn" onClick={send} disabled={busy || !reason} data-testid="content-report-send">{busy ? 'Sending...' : 'Report'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** Mounted once; shows nothing until openContentReport() is called. */
export const ContentReportHost: React.FC = () => {
  const [target, setTarget] = useState<{ type: ReportableKind; id: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent).detail; if (d && d.id && d.type) setTarget({ type: d.type, id: String(d.id) }); };
    window.addEventListener(CONTENT_REPORT_EVENT, on);
    return () => window.removeEventListener(CONTENT_REPORT_EVENT, on);
  }, []);
  return target ? <Sheet target={target} onClose={() => setTarget(null)} /> : null;
};
