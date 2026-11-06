import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bug, CheckCircle2, Lightbulb, Loader2, Send, Sparkles } from 'lucide-react';
import { fetchMyAppSuggestions, submitAppSuggestion } from '../../services/api';
import type { MySuggestion, SuggestionCategory } from '../../services/api';
import { useResumeState } from '../../utils/useResumeState';
import { formatRelativeTime } from '../../utils/formatTime';
import { IdeaTileIcon } from './SupportIcons';
import './suggestionBox.css';

// The Suggestion Box, a page of the help desk (Help & Support -> Suggestion Box): a member sends a suggestion, an improvement idea or an issue, and sees NOOB's reply
// to their earlier messages. The NOOB administrator reads and answers them in the admin panel's "Suggestions" tab. Styles: the "sg-" block of supportDesk.css.

const CATEGORIES: Array<{ id: SuggestionCategory; label: string; hint: string; Icon: React.FC<{ className?: string }>; hue: string }> = [
  { id: 'suggestion', label: 'Suggestion', hint: 'A new idea', Icon: Lightbulb, hue: '#d97706' },
  { id: 'improvement', label: 'Improvement', hint: 'Make it better', Icon: Sparkles, hue: '#0369a1' },
  { id: 'issue', label: 'Issue', hint: 'Not working', Icon: Bug, hue: '#be123c' }
];

const MAX = 2000;
const MIN = 5;

export const SuggestionBoxPage: React.FC<{ userId: string }> = ({ userId }) => {
  // A half-written message survives closing the app or refreshing.
  const [category, setCategory] = useResumeState<SuggestionCategory>(userId, 'suggestions', 'category', 'suggestion');
  const [message, setMessage] = useResumeState(userId, 'suggestions', 'message', '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<MySuggestion[] | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const res = await fetchMyAppSuggestions();
    setMine(res.success ? res.items : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // the box grows with what is written (smoothly, up to a limit) instead of scrolling inside a small box
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 132), 300)}px`;
  }, [message]);

  const index = Math.max(0, CATEGORIES.findIndex((c) => c.id === category));
  const cat = CATEGORIES[index];
  const left = MAX - message.length;
  const ready = message.trim().length >= MIN && !sending;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (text.length < MIN) { setError('Please write a little more (at least 5 characters).'); return; }
    setSending(true);
    setError('');
    const res = await submitAppSuggestion(category, text);
    setSending(false);
    if (!res.success) { setError(res.error || 'Could not send that right now. Please try again.'); return; }
    setMessage('');
    setSent(true);
    void load();
  };

  const catOf = (id: SuggestionCategory) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
  const placeholder = category === 'issue' ? 'What went wrong? Where in the app, and what did you expect?' : category === 'improvement' ? 'What should work better, and how?' : 'What would you like to see in NOOB?';

  return (
    <div className="sd-page sg-page" data-testid="support-suggestions-page">
      <div className="sg-hero">
        <div className="sg-bulb"><IdeaTileIcon /></div>
        <h2>Suggestion Box</h2>
        <p>Tell us what to add, improve or fix. The NOOB team reads every message and replies here.</p>
      </div>

      {sent ? (
        <div className="sg-done" data-testid="suggestion-sent">
          <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#1faa4b" /><path className="sg-tick" d="M14 25l7 7 13-15" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h3>Thank you!</h3>
          <p>It is with the NOOB team now. If they reply, you will see it below.</p>
          <button type="button" className="sd-btn ghost" onClick={() => setSent(false)}>Send another</button>
        </div>
      ) : (
        <form className="sg-card" onSubmit={send}>
          <div className="sg-seg" role="tablist" aria-label="What is it about" style={{ ['--i' as string]: index, ['--hue' as string]: cat.hue }}>
            <i className="sg-seg-thumb" aria-hidden="true" />
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={category === c.id} className={category === c.id ? 'on' : ''} onClick={() => setCategory(c.id)}>
                <c.Icon />
                <b>{c.label}</b>
                <small>{c.hint}</small>
              </button>
            ))}
          </div>

          <div className="sg-field" style={{ ['--hue' as string]: cat.hue }}>
            <textarea
              ref={areaRef}
              value={message}
              onChange={(e) => { setMessage(e.target.value.slice(0, MAX)); if (error) setError(''); }}
              rows={4}
              maxLength={MAX}
              placeholder={placeholder}
              aria-label="Your message"
            />
            <span className={`sg-count ${left < 100 ? 'low' : ''}`}>{message.length}/{MAX}</span>
          </div>

          {error && <div className="sg-err" role="alert">{error}</div>}

          <button type="submit" className="sg-send" disabled={!ready} style={{ ['--hue' as string]: cat.hue }}>
            {sending ? <><Loader2 className="animate-spin" />Sending...</> : <><Send />Send to NOOB</>}
          </button>
        </form>
      )}

      <h3 className="sg-sub">Your messages</h3>
      {mine === null ? (
        <div className="sg-skel" aria-hidden="true"><i /><i /></div>
      ) : mine.length === 0 ? (
        <p className="sg-empty">Nothing sent yet. Your messages and the team's replies will show here.</p>
      ) : (
        <div className="sg-list">
          {mine.map((s, n) => {
            const c = catOf(s.category);
            const state = s.status === 'closed' ? 'solved' : s.status === 'replied' ? 'replied' : 'sent';
            return (
              <article key={s.id} className="sg-item" style={{ ['--hue' as string]: c.hue, animationDelay: `${Math.min(n, 8) * 40}ms` }}>
                <div className="sg-item-top">
                  <span className="sg-chip"><c.Icon />{c.label}</span>
                  <span className={`sg-state ${state}`}>{state === 'solved' && <CheckCircle2 />}{state}</span>
                </div>
                <p className="sg-msg">{s.message}</p>
                <time>{formatRelativeTime(s.createdAt)}</time>
                {s.adminReply && (
                  <div className="sg-reply">
                    <b>NOOB replied</b>
                    <p>{s.adminReply}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
