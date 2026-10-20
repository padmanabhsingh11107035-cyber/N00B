import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Headphones, LogOut, Mic, MicOff, PenLine, Receipt, Search, Send, ShieldCheck, Sparkles, Star, Volume2, VolumeX, Zap, CheckCircle2
} from 'lucide-react';
import { formatPaymentId } from '../../utils/formatPoints';
import { SUPPORT_TOPICS, STARTER_PROMPTS, filterTopics, type Topic } from './supportTopics';

// The "Chat with NOOB support" screen, in the look of the NOOB help-desk design (a doodle sketchbook: near-black surfaces, white line art, a touch of acid green for "online" and "send"):
//   on a computer three columns: the topics, the conversation, and "the quick fix" cards; on a phone only the conversation, with the topics as a row of chips above it.
// Everything it shows comes from CustomerSupportModal (the messages, the AI, the voice, the payment lookup): this file is only the screen.
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
  onEndChat: () => void;
  isChatEnded: boolean;
  reviewSubmitted: boolean;
  onOpenReview: () => void;
  onNewConversation: () => void;
  onSelectTransaction: (t: NonNullable<SupportMessage['transactions']>[number]) => void;
  speakText: (text: string, id: string) => void;
  stopSpeaking: () => void;
  speakingId: string | null;
  isListening: boolean;
  onToggleListening: () => void;
  userAvatar?: string;
  username: string;
  /** "Visit NOOB": leave the help desk */
  onLeave: () => void;
}

const botLogo = '/noob-support-logo.png';

export const SupportChatPanel: React.FC<Props> = (p) => {
  const [search, setSearch] = useState('');
  const topics = useMemo(() => filterTopics(SUPPORT_TOPICS, search), [search]);
  const formRef = useRef<HTMLFormElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = p.isTyping;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [p.messages, p.isTyping]);
  // the box grows with what is typed (up to five lines)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [p.inputMessage]);

  const pickTopic = (t: Topic) => {
    if (busy) return;
    if (t.action === 'payment') p.onPaymentIssue();
    else if (t.action === 'report') p.onReport();
    else if (t.prompt) p.onQuickPrompt(t.prompt);
  };

  const newConversation = () => { p.stopSpeaking(); p.onNewConversation(); };

  return (
    <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[16.5rem_minmax(0,1fr)_18rem] gap-0 lg:gap-5 lg:p-5" data-testid="support-chat">
      {/* ------------------------------------------------------------------ topics (computer) */}
      <aside className="hidden lg:flex flex-col gap-4 min-h-0 overflow-y-auto pr-1" aria-label="Support topics" data-testid="support-topics">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[.18em] text-zinc-400"><span className="w-6 h-px bg-zinc-500" /> YOUR NOOB HELP DESK</div>
          <h1 className="mt-2 text-3xl font-black leading-[1.05] tracking-tight text-white">Need a<br />little help?</h1>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">Big or small, we will help you figure it out. Pick a topic or ask NOOB AI.</p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 focus-within:border-zinc-400">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a topic..." aria-label="Search support topics" className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-zinc-500 outline-none" data-testid="support-topic-search" />
        </label>
        <div className="flex items-center justify-between text-[10px] font-black tracking-[.18em] text-zinc-500"><span>POPULAR TOPICS</span><span>{String(topics.length).padStart(2, '0')}</span></div>
        <nav className="flex flex-col gap-1.5">
          {topics.map((t) => (
            <button key={t.id} onClick={() => pickTopic(t)} disabled={busy || (t.action === 'payment' && p.loadingTransactions)} className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-left cursor-pointer hover:border-zinc-500 hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" data-testid="support-topic">
              <span className="w-8 h-8 rounded-lg border border-zinc-700 flex items-center justify-center text-zinc-200 shrink-0"><t.icon className="w-4 h-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white truncate">{t.title}</span><small className="block text-[10px] text-zinc-500 truncate">{t.detail}</small></span>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 shrink-0" />
            </button>
          ))}
          {topics.length === 0 && <p className="text-xs text-zinc-500 px-1">No topics match that search.</p>}
        </nav>
        <div className="mt-auto flex items-start gap-3 rounded-xl border border-dashed border-zinc-700 p-3">
          <ShieldCheck className="w-5 h-5 text-[#B9F45A] shrink-0 mt-0.5" />
          <div className="text-[11px] leading-snug text-zinc-400"><strong className="block text-zinc-200">You are in a safe space.</strong>Your questions stay private.</div>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ the conversation */}
      <section className="flex flex-col min-h-0 lg:rounded-3xl lg:border lg:border-zinc-700 bg-zinc-950/90 overflow-hidden" aria-label="Chat with NOOB AI support" data-testid="support-conversation">
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <img src={botLogo} alt="" className="w-10 h-10 rounded-2xl object-cover" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#B9F45A] border-2 border-zinc-950" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-black text-white">NOOB AI <span className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center"><Check className="w-2.5 h-2.5" /></span></div>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400"><span className="w-1.5 h-1.5 rounded-full bg-[#B9F45A]" /> Here to help</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="hidden sm:flex items-center gap-1 rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] font-black tracking-wider text-zinc-300"><Zap className="w-3 h-3" fill="currentColor" /> AI SUPPORT</span>
            <button onClick={newConversation} className="w-8 h-8 rounded-full border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 flex items-center justify-center cursor-pointer" aria-label="Start a new conversation" title="Start a new conversation" data-testid="support-new"><PenLine className="w-4 h-4" /></button>
            <button onClick={p.onEndChat} className="h-8 px-3 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 text-[11px] font-bold flex items-center gap-1 cursor-pointer" title="End the chat and rate it" data-testid="support-end"><LogOut className="w-3.5 h-3.5" /><span className="hidden sm:inline">End chat</span></button>
          </div>
        </div>

        {/* the topics as a row of chips (phone) */}
        <div className="lg:hidden shrink-0 flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar border-b border-zinc-900" data-testid="support-chips">
          {SUPPORT_TOPICS.map((t) => (
            <button key={t.id} onClick={() => pickTopic(t)} disabled={busy} className="shrink-0 flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 cursor-pointer disabled:opacity-50 whitespace-nowrap">
              <t.icon className="w-3.5 h-3.5" />{t.id === 'payment' && p.loadingTransactions ? 'Loading...' : t.title}
            </button>
          ))}
        </div>

        {p.isChatEnded && (
          <div className="shrink-0 mx-3 mt-2 px-3.5 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs text-amber-200"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /> This support session has concluded.</span>
            <button onClick={p.onOpenReview} className="px-2.5 py-1 rounded-lg bg-amber-500 text-black text-xs font-bold flex items-center gap-1 cursor-pointer"><Star className="w-3 h-3 fill-black" />{p.reviewSubmitted ? 'Update review' : 'Rate & review'}</button>
          </div>
        )}

        <div className="shrink-0 flex items-center gap-3 px-4 pt-3 text-[10px] font-black tracking-[.18em] text-zinc-500">
          <span className="flex-1 h-px bg-zinc-800" /><span>YOUR CONVERSATION</span><span className="text-zinc-600">TODAY</span><span className="flex-1 h-px bg-zinc-800" />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3" data-testid="support-thread">
          <div className="space-y-4" aria-live="polite" aria-relevant="additions text">
            {p.messages.map((m, idx) => {
              const mine = m.sender === 'user';
              return (
                <div key={m.id} className={`flex items-end gap-2.5 ${mine ? 'flex-row-reverse' : ''}`} data-testid={mine ? 'support-msg-user' : 'support-msg-bot'}>
                  {mine
                    ? <img src={p.userAvatar || '/noob-logo.svg.jpeg'} alt="" className="w-7 h-7 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer" />
                    : <span className="relative shrink-0"><img src={botLogo} alt="" className="w-7 h-7 rounded-xl object-cover" />{p.speakingId === m.id && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#B9F45A] animate-ping" />}</span>}
                  <div className={`min-w-0 max-w-[85%] ${mine ? 'items-end text-right' : ''}`}>
                    <div className={`flex items-center gap-2 text-[10px] font-black tracking-wider text-zinc-500 mb-1 ${mine ? 'justify-end' : ''}`}><span>{mine ? 'YOU' : 'NOOB AI'}</span><time className="font-semibold tracking-normal">{m.time}</time></div>
                    <div className={`inline-block text-left rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? 'bg-white text-black rounded-br-md' : 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-bl-md'}`}>
                      <div className="whitespace-pre-wrap break-words">{m.text}</div>
                      {m.transactions && (
                        <div className="mt-2.5 space-y-1.5">
                          {m.transactions.map((t) => (
                            <button key={t.transferId} type="button" onClick={() => p.onSelectTransaction(t)} className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-black/30 hover:bg-black/50 border border-white/10 text-left cursor-pointer">
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${t.direction === 'sent' ? 'bg-rose-500/20 text-rose-300' : 'bg-[#B9F45A]/20 text-[#B9F45A]'}`}>{t.direction === 'sent' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}</span>
                              <img src={t.otherParty.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                              <span className="min-w-0 flex-1"><span className="text-[11px] font-bold block truncate">{t.direction === 'sent' ? 'To' : 'From'} @{t.otherParty.username}</span><span className="text-[10px] opacity-70 block">{formatPaymentId(t.transferId)} • {new Date(t.createdAt).toLocaleDateString()}</span></span>
                              <span className={`text-xs font-black shrink-0 ${t.direction === 'sent' ? 'text-rose-300' : 'text-[#B9F45A]'}`}>{t.direction === 'sent' ? '-' : '+'}{t.amount.toLocaleString()}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {m.transactionDetail && (
                        <div className="mt-2.5 p-3 rounded-xl bg-black/30 border border-white/10 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-90"><Receipt className="w-3.5 h-3.5" /> {formatPaymentId(m.transactionDetail.transferId)}</div>
                          <div className="text-[11px] flex justify-between"><span className="opacity-70">{m.transactionDetail.direction === 'sent' ? 'To' : 'From'}</span><span className="font-bold">@{m.transactionDetail.otherParty.username}</span></div>
                          <div className="text-[11px] flex justify-between"><span className="opacity-70">Amount</span><span className="font-bold">{m.transactionDetail.amount.toLocaleString()} pts</span></div>
                          <div className="text-[11px] flex justify-between"><span className="opacity-70">When</span><span className="font-bold">{new Date(m.transactionDetail.createdAt).toLocaleString()}</span></div>
                          {m.transactionDetail.reason && <div className="text-[11px] flex justify-between gap-2"><span className="opacity-70 shrink-0">Reason</span><span className="font-bold text-right truncate">{m.transactionDetail.reason}</span></div>}
                        </div>
                      )}
                    </div>
                    {!mine && (
                      <button onClick={() => (p.speakingId === m.id ? p.stopSpeaking() : p.speakText(m.text, m.id))} className="mt-1 ml-1 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-white cursor-pointer" data-testid="support-speak">
                        {p.speakingId === m.id ? <><VolumeX className="w-3 h-3" /> Stop voice</> : <><Volume2 className="w-3 h-3" /> Speak</>}
                      </button>
                    )}
                    {!mine && idx === 0 && p.messages.length === 1 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label="Suggested questions" data-testid="support-starters">
                        <span className="w-full text-[10px] font-black tracking-[.16em] text-zinc-500">YOU CAN ASK ME ABOUT</span>
                        {STARTER_PROMPTS.map((s) => (
                          <button key={s} onClick={() => p.onQuickPrompt(s)} disabled={busy} className="flex items-center gap-1 rounded-full border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:border-zinc-300 cursor-pointer disabled:opacity-50" data-testid="support-starter">{s}<ChevronRight className="w-3.5 h-3.5" /></button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {busy && (
              <div className="flex items-end gap-2.5" role="status" aria-label="NOOB AI is typing" data-testid="support-typing">
                <img src={botLogo} alt="" className="w-7 h-7 rounded-xl object-cover" />
                <div className="rounded-2xl rounded-bl-md bg-zinc-900 border border-zinc-800 px-4 py-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-300 animate-bounce" /><span className="w-2 h-2 rounded-full bg-zinc-300 animate-bounce [animation-delay:.15s]" /><span className="w-2 h-2 rounded-full bg-zinc-300 animate-bounce [animation-delay:.3s]" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form id="ai-support-form" ref={formRef} onSubmit={p.onSend} className="shrink-0 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] border-t border-zinc-800">
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 focus-within:border-zinc-400 transition-colors">
            <textarea
              ref={areaRef}
              rows={1}
              maxLength={600}
              value={p.inputMessage}
              onChange={(e) => p.setInputMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formRef.current?.requestSubmit(); } }}
              placeholder="Tell us what is up..."
              aria-label="Your message"
              className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-white placeholder:text-zinc-500 outline-none"
              data-testid="support-input"
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Sparkles className="w-3 h-3" /> Be as specific as you like</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={p.onToggleListening} className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${p.isListening ? 'bg-rose-500 text-white animate-pulse' : 'text-zinc-400 hover:text-white border border-zinc-700'}`} title={p.isListening ? 'Stop listening' : 'Voice typing'} aria-label={p.isListening ? 'Stop listening' : 'Voice typing'} data-testid="support-mic">{p.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
                <button type="submit" disabled={!p.inputMessage.trim() || busy} className="h-8 px-4 rounded-full bg-[#B9F45A] text-black text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Send message" data-testid="support-send"><Send className="w-3.5 h-3.5" /> Send</button>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Your chat stays between us</span>
            <span className="hidden sm:inline tracking-wider">ENTER TO SEND · SHIFT + ENTER FOR A NEW LINE</span>
          </div>
        </form>
      </section>

      {/* ------------------------------------------------------------------ the quick fix (computer) */}
      <aside className="hidden lg:flex flex-col gap-4 min-h-0 overflow-y-auto pl-1" aria-label="Helpful resources" data-testid="support-quickfix">
        <div>
          <div className="text-[10px] font-black tracking-[.18em] text-zinc-400"><span className="mr-1.5">✳</span>THE QUICK FIX</div>
          <h2 className="mt-2 text-2xl font-black leading-[1.1] tracking-tight text-white">Start with<br />the basics.</h2>
          <p className="mt-2 text-xs text-zinc-400">A few common things we can sort out together.</p>
        </div>
        <div className="flex flex-col gap-2">
          {SUPPORT_TOPICS.slice(0, 3).map((t) => (
            <button key={t.id} onClick={() => pickTopic(t)} disabled={busy} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 text-left cursor-pointer hover:border-zinc-500 disabled:opacity-50" data-testid="support-quick-card">
              <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0"><t.icon className="w-4 h-4" /></span>
              <span className="min-w-0 flex-1"><strong className="block text-xs text-white truncate">{t.title}</strong><small className="block text-[10px] text-zinc-500 truncate">{t.detail}</small></span>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </button>
          ))}
        </div>
        <div className="relative rounded-2xl border border-zinc-700 bg-zinc-900/70 p-4 space-y-2">
          <div className="flex items-center justify-between"><span className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center"><Headphones className="w-4.5 h-4.5" /></span><span className="text-[9px] font-black tracking-[.16em] text-zinc-400">NOOB COMMUNITY</span></div>
          <strong className="block text-base leading-tight text-white">Good vibes.<br />Helpful people.</strong>
          <p className="text-[11px] leading-relaxed text-zinc-400">Looking for tips from the community? Explore NOOB and see what everyone is sharing.</p>
          <button onClick={p.onLeave} className="inline-flex items-center gap-1 text-xs font-bold text-white underline cursor-pointer">Visit NOOB <ArrowUpRight className="w-3.5 h-3.5" /></button>
        </div>
        <div className="mt-auto flex items-center gap-2 text-[11px] text-zinc-500"><span className="w-1.5 h-1.5 rounded-full bg-[#B9F45A]" /> A little help is always close by.</div>
      </aside>
    </div>
  );
};
