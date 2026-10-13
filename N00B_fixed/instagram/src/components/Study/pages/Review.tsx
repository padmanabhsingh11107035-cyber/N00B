import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PartyPopper, RotateCw } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { previewWaits } from '../../../utils/studyQuiz';
import type { StudyCard } from '../../../utils/studyTypes';
import { useStudy } from '../StudyContext';
import { backStudy } from '../studyStore';
import type { PageProps } from '../StudyApp';
import { Markdown } from '../Markdown';
import { Btn, Card, ErrorBox, Loading, Page, ProgressBar } from '../ui';

// Flashcard review: see the front, think, show the answer, say how it went. "Again" cards come back in this same round; the rest come back later,
// when the database (SM-2) says. The buttons tell the student exactly how long each choice will wait.
const BUTTONS: Array<{ q: 1 | 2 | 3 | 4; label: string }> = [{ q: 1, label: 'Again' }, { q: 2, label: 'Hard' }, { q: 3, label: 'Good' }, { q: 4, label: 'Easy' }];

const Review: React.FC<PageProps> = ({ params }) => {
  const { toast } = useStudy();
  const deckId = typeof params.deck === 'string' ? params.deck : null;
  const [queue, setQueue] = useState<StudyCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [moreWaiting, setMoreWaiting] = useState(0);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const [again, setAgain] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const began = useRef(Date.now());
  const logged = useRef(false);

  const load = useCallback(async () => {
    const r = await studyApi.dueCards(deckId, 20);
    if (!r.ok) { setError(r.error); return; }
    setError(null); setQueue(r.data.cards); setTotal(r.data.cards.length); setMoreWaiting(Math.max(0, r.data.dueTotal - r.data.cards.length));
    setShown(false); setDone(0); setAgain(0); setFinished(false); logged.current = false; began.current = Date.now();
  }, [deckId]);
  useEffect(() => { void load(); }, [load]);

  const card = queue && queue[0];
  const rate = useCallback(async (q: 1 | 2 | 3 | 4) => {
    if (!queue || !queue[0] || busy) return;
    const c = queue[0];
    setBusy(true);
    const r = await studyApi.reviewCard(c.id, q);
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setShown(false);
    setDone((d) => d + 1);
    if (q === 1) { setAgain((a) => a + 1); setQueue((cur) => (cur ? [...cur.slice(1), r.data] : cur)); }
    else {
      const rest = queue.slice(1);
      setQueue(rest);
      if (rest.length === 0) setFinished(true);
    }
  }, [queue, busy, toast]);

  useEffect(() => {
    if (!finished || logged.current) return;
    logged.current = true;
    void studyApi.reviewDone(deckId, done, (Date.now() - began.current) / 1000);
  }, [finished, deckId, done]);

  // keys for a keyboard: space shows the answer, 1 to 4 choose how it went
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (!card) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true); }
      else if (shown && ['1', '2', '3', '4'].includes(e.key)) void rate(Number(e.key) as 1 | 2 | 3 | 4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, shown, rate]);

  const waits = card ? previewWaits(card) : null;
  return (
    <Page title="Review" subtitle={queue && queue.length > 0 ? queue.length + (queue.length === 1 ? ' card left' : ' cards left') : undefined}>
      <div style={{ display: 'grid', gap: 14 }}>
        {error && <ErrorBox text={error} onRetry={() => void load()} />}
        {!queue && !error && <Loading rows={2} />}
        {queue && total === 0 && !finished && (
          <Card tint style={{ textAlign: 'center' }}>
            <PartyPopper size={30} style={{ color: 'var(--st-accent)', margin: '0 auto' }} />
            <p className="st-title st-h3" style={{ marginTop: 8 }}>Nothing is due right now</p>
            <p className="st-small st-muted" style={{ marginTop: 4 }}>You are all caught up. Cards come back when it is the right time to see them again.</p>
            <div style={{ marginTop: 14 }}><Btn onClick={() => backStudy()}>Back</Btn></div>
          </Card>
        )}
        {queue && card && !finished && (
          <>
            <ProgressBar value={total ? (done / (total + again)) * 100 : 0} label="Review progress" />
            <Card style={{ minHeight: 170, display: 'grid', alignContent: 'center' }}>
              <p className="st-tiny st-faint" style={{ marginBottom: 8 }}>{card.deckTitle || ''}</p>
              <Markdown text={card.front} />
              {shown && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--st-border)' }}>
                  <Markdown text={card.back} />
                </div>
              )}
            </Card>
            {!shown ? (
              <Btn kind="primary" onClick={() => setShown(true)}>Show the answer</Btn>
            ) : (
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }} role="group" aria-label="How did it go?">
                {BUTTONS.map((b) => (
                  <button key={b.q} className={'st-btn ' + (b.q === 3 ? 'st-btn-primary' : '')} disabled={busy} onClick={() => void rate(b.q)} style={{ flexDirection: 'column', gap: 2, padding: '10px 4px', minHeight: 62 }} aria-label={b.label + ', back in ' + (waits ? waits[b.q] : '')}>
                    <span style={{ fontWeight: 800 }}>{b.label}</span>
                    <span className="st-tiny" style={{ opacity: 0.8 }}>{waits ? waits[b.q] : ''}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="st-tiny st-faint" style={{ textAlign: 'center' }}>Try to remember before you look. It is how memory grows.</p>
          </>
        )}
        {finished && (
          <Card tint style={{ textAlign: 'center' }}>
            <PartyPopper size={32} style={{ color: 'var(--st-accent)', margin: '0 auto' }} />
            <p className="st-title st-h2" style={{ marginTop: 8 }}>Nicely done</p>
            <p className="st-small st-muted" style={{ marginTop: 4 }}>{done} {done === 1 ? 'review' : 'reviews'}{again > 0 ? ', ' + again + ' to see again' : ''}. The cards will come back at the right time.</p>
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              {moreWaiting > 0 && <Btn kind="primary" onClick={() => void load()}><RotateCw size={16} /> {moreWaiting} more are ready</Btn>}
              <Btn onClick={() => backStudy()}>Done</Btn>
            </div>
          </Card>
        )}
      </div>
    </Page>
  );
};
export default Review;
