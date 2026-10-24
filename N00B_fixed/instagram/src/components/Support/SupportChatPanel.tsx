import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowDownLeft, ArrowUpRight, CheckCheck, ChevronRight, Mic, PenLine, Send, Square, Volume2 } from 'lucide-react';
import { formatPaymentId } from '../../utils/formatPoints';
import { STARTER_PROMPTS } from './supportTopics';

// The "Chat with us" screen, in the look of a delivery app's support chat: the whole screen is the conversation (a slim bar on top, the typing bar at the bottom), light blue-grey bubbles
// with a bold name above the text, a time with two blue ticks under what you sent, a yellow "we are assisting you" strip, and a green button to jump back down.
// Everything it shows comes from CustomerSupportModal (the messages, the AI, the voice, the payment lookup, ending and rating): this file is only the screen.
export interface SupportMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  time: string;
  transactions?: Array<{ transferId: string; direction: 'sent' | 'received'; amount: number; createdAt: string; otherParty: { username: string; avatar?: string } }>;
  transactionDetail?: { transferId: string; direction: 'sent' | 'received'; amount: number; createdAt: string; reason?: string | null; otherParty: { username: string } };
}

interface Props {
  messages: SupportMessage[];
  isTyping: boolean;
  inputMessage: string;
  setInputMessage: (v: string) => void;
  onSend: (e?: React.FormEvent) => void;
  onQuickPrompt: (prompt: string) => void;
  onPaymentIssue: () => void;
  loadingTransactions: boolean;
  onReport: () => void;
  isChatEnded: boolean;
  reviewSubmitted: boolean;
  onOpenReview: () => void;
  onNewConversation: () => void;
  onSelectTransaction: (t: NonNullable<SupportMessage['transactions']>[number]) => void;
  speakText: (text: string, id: string) => void;
  stopSpeaking: () => void;
  speakingId: string | null;
  /** the rating faces are open over the typing bar */
  ratingOpen: boolean;
}

const BOT_NAME = 'NoobBuddy';

/** the assistant writes **bold** words: show them bold (as React text, never as html) */
function withBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) => (/^\*\*[^*\n]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

type RecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort?: () => void };

export const SupportChatPanel: React.FC<Props> = (p) => {
  const threadRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const stick = useRef(true);
  const [showDown, setShowDown] = useState(false);
  const busy = p.isTyping;

  // ---- voice typing: what is said is written into the typing box (the person reads it, changes it if needed, and sends it)
  const recRef = useRef<RecognitionLike | null>(null);
  const baseRef = useRef('');
  const [listening, setListening] = useState(false);
  const micSupported = typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
  const toggleMic = () => {
    if (listening) { try { recRef.current?.stop(); } catch { /* already stopped */ } return; }
    const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    p.stopSpeaking();
    const rec = new SR();
    rec.lang = 'en-IN'; rec.interimResults = true; rec.continuous = false;
    baseRef.current = p.inputMessage.trim() ? `${p.inputMessage.trimEnd()} ` : '';
    rec.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      p.setInputMessage((baseRef.current + said).slice(0, 600));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  useEffect(() => () => { try { recRef.current?.abort?.(); } catch { /* nothing to stop */ } }, []);

  const toBottom = (smooth: boolean) => { const el = threadRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
  const onScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    const away = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = away < 120;
    setShowDown(away > 160);
  };
  // follow the conversation, unless the person has scrolled up to read something (then the green arrow brings them back)
  const last = p.messages[p.messages.length - 1];
  useEffect(() => {
    if (stick.current || last?.sender === 'user') toBottom(true);
  }, [p.messages, p.isTyping, p.isChatEnded, p.ratingOpen]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { toBottom(false); }, []);
  // the typing box grows with what is typed (up to five lines)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [p.inputMessage]);

  const first = p.messages[0];
  const fresh = p.messages.length === 1 && first?.sender === 'bot';

  return (
    <div className="sd-chat" data-testid="support-chat">
      <div className="sd-thread" ref={threadRef} onScroll={onScroll} style={p.ratingOpen ? { paddingBottom: 340 } : undefined} data-testid="support-thread" aria-live="polite" aria-relevant="additions text">
        {first && <div className="sd-day">Today, {first.time}</div>}

        {p.messages.map((m) => {
          const mine = m.sender === 'user';
          return (
            <div key={m.id} className={`sd-msg ${mine ? 'me' : 'bot'}`} data-testid={mine ? 'support-msg-user' : 'support-msg-bot'}>
              <div className="sd-bubble">
                {!mine && <span className="sd-who">{BOT_NAME}</span>}
                <div className="sd-text">{withBold(m.text)}</div>

                {m.transactions && (
                  <div className="sd-txns">
                    {m.transactions.map((t) => (
                      <button key={t.transferId} type="button" className="sd-txn" onClick={() => p.onSelectTransaction(t)}>
                        <span className={`sd-txn-dir ${t.direction === 'sent' ? 'out' : 'in'}`}>{t.direction === 'sent' ? <ArrowUpRight /> : <ArrowDownLeft />}</span>
                        <img src={t.otherParty.avatar || '/noob-logo.svg.jpeg'} alt="" referrerPolicy="no-referrer" />
                        <span className="sd-txn-tx"><strong>{t.direction === 'sent' ? 'To' : 'From'} @{t.otherParty.username}</strong><span>{formatPaymentId(t.transferId)} · {new Date(t.createdAt).toLocaleDateString()}</span></span>
                        <span className={`sd-txn-amt ${t.direction === 'sent' ? 'out' : 'in'}`}>{t.direction === 'sent' ? '-' : '+'}{t.amount.toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}

                {m.transactionDetail && (
                  <div className="sd-detail">
                    <div><span>Payment</span><span>{formatPaymentId(m.transactionDetail.transferId)}</span></div>
                    <div><span>{m.transactionDetail.direction === 'sent' ? 'To' : 'From'}</span><span>@{m.transactionDetail.otherParty.username}</span></div>
                    <div><span>Amount</span><span>{m.transactionDetail.amount.toLocaleString()} pts</span></div>
                    <div><span>When</span><span>{new Date(m.transactionDetail.createdAt).toLocaleString()}</span></div>
                    {m.transactionDetail.reason && <div><span>Reason</span><span>{m.transactionDetail.reason}</span></div>}
                  </div>
                )}
              </div>

              <div className="sd-meta">
                <span>{m.time}</span>
                {mine && <CheckCheck aria-label="Sent" />}
                {!mine && (
                  <button type="button" className="sd-listen" onClick={() => (p.speakingId === m.id ? p.stopSpeaking() : p.speakText(m.text, m.id))} data-testid="support-speak">
                    {p.speakingId === m.id ? <><Square fill="currentColor" /> Stop</> : <><Volume2 /> Listen</>}
                  </button>
                )}
              </div>

              {!mine && fresh && m.id === first?.id && (
                <div className="sd-chips" aria-label="Suggested questions" data-testid="support-starters">
                  {STARTER_PROMPTS.map((s) => (
                    <button key={s} type="button" className="sd-chip" onClick={() => p.onQuickPrompt(s)} disabled={busy} data-testid="support-starter">{s}</button>
                  ))}
                  <button type="button" className="sd-chip" onClick={p.onPaymentIssue} disabled={busy || p.loadingTransactions} data-testid="support-chip-payment">{p.loadingTransactions ? 'Loading...' : 'Payment issue'}</button>
                  <button type="button" className="sd-chip" onClick={p.onReport} disabled={busy} data-testid="support-chip-report">Report someone<ChevronRight style={{ width: 14, height: 14 }} /></button>
                </div>
              )}
            </div>
          );
        })}

        {busy && (
          <div className="sd-msg bot" role="status" aria-label="NoobBuddy is typing" data-testid="support-typing">
            <div className="sd-bubble"><span className="sd-who">{BOT_NAME}</span><span className="sd-dots"><span /><span /><span /></span></div>
          </div>
        )}

        {p.isChatEnded && <div className="sd-closed" data-testid="support-closed">This conversation has been closed</div>}
        <div ref={endRef} />
      </div>

      {!p.isChatEnded && <div className="sd-assist" data-testid="support-assist">NOOB AI support is assisting you now</div>}

      {showDown && (
        <button type="button" className="sd-down" onClick={() => { stick.current = true; toBottom(true); }} aria-label="Scroll to the newest message" data-testid="support-down"><ArrowDown /></button>
      )}

      {p.isChatEnded ? (
        <div className="sd-composer" style={p.ratingOpen ? { visibility: 'hidden' } : undefined}>
          {!p.reviewSubmitted && <button type="button" className="sd-btn line" onClick={p.onOpenReview} data-testid="support-rate">Rate this chat</button>}
          <button type="button" className="sd-btn green" onClick={p.onNewConversation} data-testid="support-new"><PenLine />Start a new chat</button>
        </div>
      ) : (
        <form id="ai-support-form" ref={formRef} onSubmit={p.onSend} className="sd-composer">
          <div className="sd-field">
            <textarea
              ref={areaRef}
              rows={1}
              maxLength={600}
              value={p.inputMessage}
              onChange={(e) => p.setInputMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formRef.current?.requestSubmit(); } }}
              placeholder="Type a message..."
              aria-label="Your message"
              data-testid="support-input"
            />
            {micSupported && (
              <button type="button" className={`sd-mic ${listening ? 'on' : ''}`} onClick={toggleMic} aria-label={listening ? 'Stop voice typing' : 'Type with your voice'} title={listening ? 'Stop' : 'Type with your voice'} data-testid="support-mic"><Mic /></button>
            )}
          </div>
          <button type="submit" className="sd-send" disabled={!p.inputMessage.trim() || busy} aria-label="Send message" data-testid="support-send"><Send /></button>
        </form>
      )}
    </div>
  );
};
