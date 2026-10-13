import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Copy, GraduationCap, ImagePlus, Loader2, Mic, MicOff, MoreVertical, Pencil, RotateCw, Send, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { studyApi } from '../../../services/studyApi';
import { aiHealth, MAX_PICTURES, newRef, removeStudyFiles, signedUrls, streamChat, transcribe, uploadStudyImage, type AiHealth } from '../../../services/studyAi';
import type { StudyConversation, StudyMessage } from '../../../utils/studyTypes';
import { speechLang } from '../../../utils/studyCatalog';
import { canRecognize, canRecord, canSpeak, describeVoiceError, isSpeaking, listen, record, speak, stopSpeaking, type Listener, type RecorderHandle } from '../../../utils/studyVoice';
import { useStudy } from '../StudyContext';
import { backStudy, goStudy } from '../studyStore';
import { Markdown } from '../Markdown';
import { Btn, Chip, Field, Head, Orb, Sheet } from '../ui';
import type { PageProps } from '../StudyApp';

// The conversation with the tutor. The answer streams in as it is written; a question that could not be answered stays in the chat with a
// "Try again" (sending it again never asks twice); pictures are shown from the student's private store; the microphone is only ever on while it is
// visibly on, and the tutor only speaks when the student taps.
interface Pic { key: string; url: string }
interface UiMsg { id: string; role: 'user' | 'assistant'; content: string; pics: Pic[]; at?: string; status?: 'streaming' | 'error' | 'stopped'; error?: string; retry?: () => void }

export const STARTERS: Array<{ label: string; text: string }> = [
  { label: 'Explain this chapter in simple words', text: 'Explain this chapter in simple words: ' },
  { label: 'Teach me this topic from the basics', text: 'Teach me this topic from the basics: ' },
  { label: 'Explain it with a real-life example', text: 'Explain it with a real-life example: ' },
  { label: 'Give me practice questions', text: 'Give me 5 practice questions on: ' },
  { label: 'Test my understanding', text: 'Test my understanding of: ' },
  { label: 'Find the mistakes in my answer', text: 'Find the mistakes in my answer (tell me what is right first, then what to fix):\n' },
  { label: 'Create short revision notes', text: 'Create short revision notes on: ' },
  { label: 'Help me prepare for an exam', text: 'Help me prepare for my exam on: ' }
];
const FOLLOW_UPS = [
  { label: 'Explain it more simply', text: 'Please explain that again in simpler words, as if I am hearing it for the first time.' },
  { label: 'Give an example', text: 'Can you give me one real-life example of that?' },
  { label: 'Quiz me on this', text: 'Ask me 3 short questions to check if I understood. Start with the first one.' },
  { label: 'Show the steps', text: 'Please show the solution step by step, and say why each step works.' }
];

const Chat: React.FC<PageProps> = ({ params }) => {
  const { me, user, subjects, subjectName, toast } = useStudy();
  const tutorName = me?.profile?.tutor?.name?.trim() || 'your tutor';
  const lang = me?.profile?.tutor?.language || me?.profile?.language || 'en';
  const [conv, setConv] = useState<StudyConversation | null>(null);
  const convRef = useRef<string | null>(typeof params.conversation === 'string' ? params.conversation : null);
  const [subjectId, setSubjectId] = useState<string | null>(typeof params.subject === 'string' ? params.subject : null);
  const [messages, setMessages] = useState<UiMsg[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(!!convRef.current);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [text, setText] = useState('');
  const [pics, setPics] = useState<Pic[]>([]);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [teach, setTeach] = useState(params.mode === 'teach' || !!me?.profile?.tutor?.teachMode);
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'rename' | 'context' | 'delete' | null>(null);
  const [listening, setListening] = useState<'device' | 'record' | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const listener = useRef<Listener | null>(null);
  const recorder = useRef<RecorderHandle | null>(null);
  const seeded = useRef(false);

  const toUi = (m: StudyMessage): UiMsg => ({ id: m.id, role: m.role, content: m.content, at: m.createdAt, pics: (m.attachments || []).map((a) => ({ key: a.key, url: '' })) });
  const resolvePics = useCallback(async (list: StudyMessage[]) => {
    const keys = list.flatMap((m) => (m.attachments || []).map((a) => a.key));
    if (keys.length) { const got = await signedUrls(keys); setUrls((u) => ({ ...u, ...got })); }
  }, []);

  // open an existing chat, and ask what the tutor can do (so a missing key is said plainly instead of failing quietly)
  useEffect(() => {
    void aiHealth().then((r) => { if (r.ok) setHealth(r.data); });
    const id = convRef.current;
    if (id) {
      void (async () => {
        const r = await studyApi.conv(id, 40);
        setLoading(false);
        if (!r.ok) { toast(r.error); backStudy(); return; }
        setConv(r.data.conversation); setSubjectId(r.data.conversation.subjectId); setMore(r.data.more);
        if (r.data.conversation.mode === 'teach') setTeach(true);
        setMessages(r.data.messages.map(toUi));
        void resolvePics(r.data.messages);
      })();
    }
    return () => { abort.current?.abort(); stopSpeaking(); listener.current?.stop(); recorder.current?.cancel(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [messages, busy]);
  useEffect(() => { const el = area.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 150)}px`; } }, [text]);

  // older messages of a long chat, a page at a time, placed above without moving what the student is reading
  const loadEarlier = async () => {
    const id = convRef.current; const first = messages[0];
    if (!id || !first?.at || loadingEarlier) return;
    setLoadingEarlier(true);
    const el = scroller.current; const before = el ? el.scrollHeight : 0;
    const r = await studyApi.conv(id, 40, first.at);
    setLoadingEarlier(false);
    if (!r.ok) { toast(r.error); return; }
    stick.current = false;
    setMessages((m) => [...r.data.messages.map(toUi), ...m]);
    setMore(r.data.more);
    void resolvePics(r.data.messages);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  };

  // ---- sending
  const run = useCallback(async (message: string, images: Pic[], ref: string, botId: string) => {
    setBusy(true); stick.current = true;
    const ctl = new AbortController(); abort.current = ctl;
    let got = false;
    const res = await streamChat({ message, conversationId: convRef.current, subjectId, mode: teach ? 'teach' : 'chat', images: images.map((p) => p.key), clientRef: ref }, (e) => {
      if (e.t === 'meta') { convRef.current = e.conversationId; setConv((c) => c || { id: e.conversationId, title: '', subjectId, mode: teach ? 'teach' : 'chat', topic: '', materialId: null, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString(), preview: '' }); }
      else if (e.t === 'delta') { got = true; setMessages((m) => m.map((x) => (x.id === botId ? { ...x, content: x.content + e.text } : x))); }
      else if (e.t === 'done') { setMessages((m) => m.map((x) => (x.id === botId ? { ...x, status: undefined } : x))); if (e.remaining != null) setRemaining(e.remaining); }
      else if (e.t === 'error') { setMessages((m) => m.map((x) => (x.id === botId ? { ...x, status: 'error', error: e.message } : x))); }
    }, ctl.signal);
    setBusy(false);
    abort.current = null;
    if (!res.ok) {
      if (res.code === 'aborted') { setMessages((m) => m.map((x) => (x.id === botId ? { ...x, status: got ? 'stopped' : 'error', error: got ? undefined : 'Stopped.' } : x))); return; }
      const canRetry = !(res.code === 'limit' || res.code === 'not_configured' || res.code === 'no_vision');
      setMessages((m) => m.map((x) => (x.id === botId ? { ...x, status: 'error', error: res.error, retry: canRetry ? () => { setMessages((mm) => mm.map((y) => (y.id === botId ? { ...y, content: '', status: 'streaming', error: undefined } : y))); void run(message, images, ref, botId); } : undefined } : x)));
      return;
    }
    // a finished first answer gives the chat its name
    if (convRef.current) void studyApi.conv(convRef.current, 1).then((r) => { if (r.ok) setConv(r.data.conversation); });
  }, [subjectId, teach]);

  const send = useCallback((override?: string) => {
    const message = (override ?? text).trim();
    if (busy || uploading > 0 || (!message && pics.length === 0)) return;
    if (message.length > 4000) { toast('Please keep a message under 4000 characters.'); return; }
    stopSpeaking(); setSpeakingId(null);
    const ref = newRef();
    const sent = override === undefined ? pics : [];
    const botId = `a-${ref}`;
    setMessages((m) => [...m, { id: `u-${ref}`, role: 'user', content: message, pics: sent }, { id: botId, role: 'assistant', content: '', pics: [], status: 'streaming' }]);
    if (override === undefined) { setText(''); setPics([]); }
    void run(message, sent, ref, botId);
  }, [busy, uploading, text, pics, run, toast]);

  // a message handed over by another screen (a photo from "Photo doubts", a question from the tutor's home) is sent once
  useEffect(() => {
    if (seeded.current) return;
    const seed = typeof params.seed === 'string' ? params.seed : '';
    const keys = typeof params.images === 'string' && params.images ? params.images.split('|').filter(Boolean) : [];
    if (!seed && !keys.length) return;
    seeded.current = true;
    const fire = () => setTimeout(() => document.getElementById('st-send')?.click(), 80);
    if (keys.length) { void signedUrls(keys).then((u) => { setUrls((x) => ({ ...x, ...u })); setPics(keys.map((k) => ({ key: k, url: u[k] || '' }))); setText(seed); fire(); }); }
    else if (params.send === false) setText(seed);
    else { setText(seed); fire(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- pictures
  const addFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const room = MAX_PICTURES - pics.length - uploading;
    if (room <= 0) { toast(`You can send up to ${MAX_PICTURES} pictures at once.`); return; }
    const list = Array.from(files).slice(0, room);
    setUploading((n) => n + list.length);
    for (const f of list) {
      const r = await uploadStudyImage(user.id, f);
      setUploading((n) => n - 1);
      if (r.ok) setPics((p) => [...p, r.data]); else toast(r.error);
    }
  };
  const dropPic = (k: string) => { setPics((p) => p.filter((x) => x.key !== k)); void removeStudyFiles([k]); };

  // ---- the microphone
  const stopListening = () => { listener.current?.stop(); listener.current = null; recorder.current?.cancel(); recorder.current = null; setListening(null); };
  const toggleMic = async () => {
    if (listening === 'device') { stopListening(); return; }
    if (listening === 'record') {
      const h = recorder.current; recorder.current = null; setListening(null);
      const clip = h ? await h.stop() : null;
      if (!clip) { setVoiceNote('I did not catch anything. Try again.'); return; }
      setVoiceNote('Turning your voice into words…');
      const r = await transcribe(clip.base64, clip.mime, lang.split('-')[0]);
      setVoiceNote(null);
      if (r.ok && r.data.text) setText((t) => (t ? t + ' ' : '') + r.data.text); else toast(r.ok ? 'I did not catch anything. Try again.' : r.error);
      return;
    }
    setVoiceNote(null); stopSpeaking(); setSpeakingId(null);
    if (canRecognize()) {
      const base = text ? text + ' ' : '';
      listener.current = listen(speechLang(lang), { onText: (t) => setText(base + t), onEnd: () => { setListening(null); listener.current = null; }, onError: (c) => { const m = describeVoiceError(c); if (m) setVoiceNote(m); setListening(null); } });
      if (listener.current) setListening('device');
    } else if (canRecord() && health?.speechToText) {
      try { recorder.current = await record(); setListening('record'); } catch (err) { setVoiceNote(describeVoiceError((err as Error)?.name || '')); }
    } else setVoiceNote(describeVoiceError('unsupported'));
  };

  // ---- reading aloud (only when the student taps)
  const toggleSpeak = (m: UiMsg) => {
    if (speakingId === m.id && isSpeaking()) { stopSpeaking(); setSpeakingId(null); return; }
    setSpeakingId(m.id);
    speak(m.content, speechLang(lang), { preferredVoice: me?.profile?.tutor?.voice, onEnd: () => setSpeakingId((s) => (s === m.id ? null : s)) });
  };
  const copy = async (m: UiMsg) => { try { await navigator.clipboard.writeText(m.content); toast('Copied.'); } catch { toast('Could not copy. Select the text instead.'); } };

  const lastAnswerIdx = (() => { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i; return -1; })();
  const notReady = !!health && !health.configured;
  const isAdmin = !!user.isAdmin || user.username?.toLowerCase() === 'noob';
  const title = conv?.title || (subjectId ? `${subjectName(subjectId)} chat` : 'New chat');
  const empty = messages.length === 0 && !loading;
  const mic = canRecognize() || (canRecord() && !!health?.speechToText);

  return (
    <>
      <Head
        title={title}
        subtitle={teach ? 'Teach-me mode: I guide, you think' : subjectId ? subjectName(subjectId) : `with ${tutorName}`}
        right={(
          <div style={{ position: 'relative' }}>
            <button className="st-icon-btn" onClick={() => setMenu((v) => !v)} aria-label="Chat options" aria-expanded={menu}><MoreVertical size={18} /></button>
            {menu && (
              <div className="st-card" style={{ position: 'absolute', right: 0, top: 46, zIndex: 20, width: 220, padding: 6, display: 'grid', gap: 2 }}>
                {[
                  { l: 'Subject and topic', i: <GraduationCap size={15} />, a: () => setSheet('context') },
                  { l: 'Rename chat', i: <Pencil size={15} />, a: () => setSheet('rename'), off: !conv },
                  { l: 'New chat', i: <RotateCw size={15} />, a: () => goStudy('chat', { subject: subjectId || undefined }) },
                  { l: 'Delete chat', i: <Trash2 size={15} />, a: () => setSheet('delete'), off: !conv }
                ].filter((x) => !x.off).map((x) => (
                  <button key={x.l} className="st-row-btn" style={{ border: 0, background: 'transparent', padding: '10px 12px' }} onClick={() => { setMenu(false); x.a(); }}><span style={{ color: 'var(--st-accent)' }}>{x.i}</span><span className="st-small" style={{ fontWeight: 700 }}>{x.l}</span></button>
                ))}
              </div>
            )}
          </div>
        )}
      />

      <div ref={scroller} className="st-scroll" onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        <div className="st-wrap" style={{ display: 'grid', gap: 14, alignContent: 'start', gridTemplateColumns: 'minmax(0, 1fr)', paddingBottom: 12 }}>
          {notReady && (
            <div className="st-notice st-notice-warn">
              {isAdmin
                ? 'The AI tutor has no AI key yet. Add GROQ_API_KEY (and more keys if you like) in Supabase, Edge Functions, Secrets, and deploy the "study-ai" function.'
                : 'Your tutor is still getting ready. Everything else in NOOB STUDY works in the meantime.'}
            </div>
          )}
          {loading && <div className="st-skel" style={{ height: 80 }} />}
          {more && <Btn kind="ghost" small busy={loadingEarlier} onClick={() => void loadEarlier()}>Load earlier messages</Btn>}
          {empty && (
            <div className="st-in" style={{ display: 'grid', gap: 14, textAlign: 'center', justifyItems: 'center', paddingTop: 12 }}>
              <Orb size={64} float />
              <div><p className="st-title st-h2">What shall we learn?</p><p className="st-small st-muted" style={{ marginTop: 4 }}>Ask in your own words, in any language. I will explain step by step.</p></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {STARTERS.map((s) => <Chip key={s.label} onClick={() => { setText(s.text); area.current?.focus(); }}>{s.label}</Chip>)}
              </div>
            </div>
          )}
          {messages.map((m, idx) => {
            const mine = m.role === 'user';
            return (
              <div key={m.id} className="st-in" style={{ display: 'flex', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                {!mine && <Orb size={28} />}
                <div style={{ maxWidth: mine ? '86%' : '100%', minWidth: 0, flex: mine ? undefined : 1 }}>
                  <div className={mine ? '' : 'st-card-flat'} style={mine ? { background: 'var(--st-accent-soft)', border: '1px solid var(--st-border)', borderRadius: '20px 20px 6px 20px', padding: '10px 14px' } : { borderRadius: '6px 20px 20px 20px' }}>
                    {m.pics.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: m.content ? 8 : 0 }}>
                        {m.pics.map((p) => { const src = p.url || urls[p.key]; return src ? <img key={p.key} src={src} alt="A picture you sent" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12 }} /> : <div key={p.key} className="st-skel" style={{ width: 96, height: 96 }} />; })}
                      </div>
                    )}
                    {mine ? <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5 }}>{m.content}</p>
                      : m.content ? <Markdown text={m.content} />
                      : m.status === 'streaming' ? <span className="st-muted st-small" aria-live="polite"><Loader2 size={14} className="animate-spin" style={{ display: 'inline', verticalAlign: '-2px' }} /> {tutorName === 'your tutor' ? 'Thinking' : `${tutorName} is thinking`}…</span> : null}
                    {m.status === 'streaming' && m.content && <span className="st-tiny st-faint" aria-hidden="true"> ▍</span>}
                    {m.status === 'stopped' && <p className="st-tiny st-faint" style={{ marginTop: 6 }}>Stopped. What was written so far stays here.</p>}
                    {m.status === 'error' && (
                      <div className="st-notice st-notice-warn" role="alert" style={{ marginTop: m.content ? 8 : 0 }}>
                        {m.error || 'The tutor could not answer.'}
                        {m.retry && <div style={{ marginTop: 8 }}><Btn small onClick={m.retry}><RotateCw size={14} /> Try again</Btn></div>}
                      </div>
                    )}
                  </div>
                  {!mine && !m.status && m.content && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      <button className="st-icon-btn" style={{ width: 34, height: 34, borderRadius: 11 }} onClick={() => void copy(m)} aria-label="Copy the answer"><Copy size={14} /></button>
                      {canSpeak() && <button className="st-icon-btn" style={{ width: 34, height: 34, borderRadius: 11 }} onClick={() => toggleSpeak(m)} aria-label={speakingId === m.id ? 'Stop reading' : 'Read it aloud'}>{speakingId === m.id ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>}
                    </div>
                  )}
                  {!mine && idx === lastAnswerIdx && !m.status && m.content && !busy && (
                    <div className="st-hscroll" style={{ marginTop: 8 }}>{FOLLOW_UPS.map((f) => <Chip key={f.label} onClick={() => send(f.text)}>{f.label}</Chip>)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 'none', width: '100%', maxWidth: 640, margin: '0 auto', padding: '8px 16px max(10px, env(safe-area-inset-bottom))', background: 'color-mix(in srgb, var(--st-bg) 92%, transparent)', borderTop: '1px solid var(--st-border)' }}>
        {(pics.length > 0 || uploading > 0) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {pics.map((p) => (
              <div key={p.key} style={{ position: 'relative' }}>
                <img src={p.url} alt="Picture to send" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12 }} />
                <button onClick={() => dropPic(p.key)} className="st-icon-btn" style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 99 }} aria-label="Remove this picture"><X size={12} /></button>
              </div>
            ))}
            {Array.from({ length: uploading }, (_, i) => <div key={i} className="st-skel" style={{ width: 64, height: 64 }} />)}
          </div>
        )}
        {(voiceNote || listening) && <p className="st-small" role="status" style={{ marginBottom: 6, color: listening ? 'var(--st-accent)' : 'var(--st-muted)', fontWeight: 700 }}>{listening ? (listening === 'device' ? 'Listening… speak now. Tap the microphone to stop.' : 'Recording… tap the microphone when you are done.') : voiceNote}</p>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <Chip on={teach} onClick={() => setTeach((v) => !v)} title="Teach-me mode: the tutor asks first and guides you">Teach me</Chip>
          {remaining !== null && remaining <= 20 && <span className="st-tiny st-faint">{remaining} questions left today</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
          <button className="st-icon-btn" onClick={() => camRef.current?.click()} aria-label="Take a photo of a question" disabled={!!health && !health.vision} title={health && !health.vision ? 'Photo questions are not switched on yet' : 'Take a photo'}><Camera size={18} /></button>
          <button className="st-icon-btn" onClick={() => fileRef.current?.click()} aria-label="Choose a picture" disabled={!!health && !health.vision}><ImagePlus size={18} /></button>
          <textarea ref={area} className="st-input" rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ask ${tutorName === 'your tutor' ? 'anything' : tutorName}…`} aria-label="Your question"
            style={{ minHeight: 44, maxHeight: 150, resize: 'none', padding: '10px 14px', flex: 1, lineHeight: 1.4 }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia?.('(hover: hover)').matches) { e.preventDefault(); send(); } }} />
          {mic && (
            <button className="st-icon-btn" onClick={() => void toggleMic()} aria-label={listening ? 'Stop the microphone' : 'Speak your question'} aria-pressed={!!listening}
              style={listening ? { background: 'var(--st-accent)', color: 'var(--st-accent-ink)', borderColor: 'transparent' } : undefined}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>
          )}
          {busy
            ? <button className="st-icon-btn" onClick={() => abort.current?.abort()} aria-label="Stop the answer" style={{ background: 'var(--st-surface2)' }}><Square size={16} /></button>
            : <button id="st-send" className="st-icon-btn" onClick={() => send()} disabled={uploading > 0 || (!text.trim() && pics.length === 0)} aria-label="Send" style={{ background: 'var(--st-accent)', color: 'var(--st-accent-ink)', borderColor: 'transparent' }}><Send size={17} /></button>}
        </div>
        <p className="st-tiny st-faint" style={{ textAlign: 'center', marginTop: 6 }}>Your tutor can make mistakes. For something important, check with your teacher or your book.</p>
      </div>

      {sheet === 'rename' && conv && <RenameSheet conv={conv} onClose={() => setSheet(null)} onDone={(c) => setConv(c)} />}
      {sheet === 'context' && <ContextSheet subjectId={subjectId} topic={conv?.topic || ''} convId={convRef.current} subjects={subjects} onClose={() => setSheet(null)} onDone={(sid, c) => { setSubjectId(sid); if (c) setConv(c); toast('Subject updated for the next answers.'); }} />}
      {sheet === 'delete' && conv && (
        <Sheet title="Delete this chat?" onClose={() => setSheet(null)}>
          <p className="st-small st-muted">The messages and any pictures in this chat are deleted for good.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn kind="ghost" onClick={() => setSheet(null)}>Keep it</Btn>
            <Btn kind="primary" style={{ flex: 1 }} onClick={async () => { const r = await studyApi.deleteConv(conv.id); if (r.ok) { toast('Chat deleted.'); backStudy(); } else toast(r.error); }}>Delete</Btn>
          </div>
        </Sheet>
      )}
    </>
  );
};

const RenameSheet: React.FC<{ conv: StudyConversation; onClose: () => void; onDone: (c: StudyConversation) => void }> = ({ conv, onClose, onDone }) => {
  const { toast } = useStudy();
  const [t, setT] = useState(conv.title);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Rename chat" onClose={onClose}>
      <Field label="Name"><input className="st-input" value={t} maxLength={120} autoFocus onChange={(e) => setT(e.target.value)} /></Field>
      <div style={{ marginTop: 14 }}><Btn kind="primary" block busy={busy} onClick={async () => { setBusy(true); const r = await studyApi.renameConv(conv.id, t); setBusy(false); if (r.ok) { onDone(r.data); onClose(); } else toast(r.error); }}>Save</Btn></div>
    </Sheet>
  );
};

const ContextSheet: React.FC<{ subjectId: string | null; topic: string; convId: string | null; subjects: Array<{ id: string; name: string }>; onClose: () => void; onDone: (subjectId: string | null, c?: StudyConversation) => void }> = ({ subjectId, topic, convId, subjects, onClose, onDone }) => {
  const { toast } = useStudy();
  const [sid, setSid] = useState(subjectId || '');
  const [tp, setTp] = useState(topic);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="What is this chat about?" onClose={onClose}>
      <p className="st-small st-muted" style={{ marginBottom: 12 }}>The tutor uses this to match your subject. If you do not set a chapter, it will not guess your syllabus.</p>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Subject"><select className="st-input" value={sid} onChange={(e) => setSid(e.target.value)}><option value="">Any subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Chapter or topic (optional)"><input className="st-input" value={tp} maxLength={100} onChange={(e) => setTp(e.target.value)} placeholder="e.g. Laws of motion" /></Field>
        <Btn kind="primary" block busy={busy} onClick={async () => {
          if (!convId) { onDone(sid || null); onClose(); return; }
          setBusy(true);
          const r = await studyApi.convContext(convId, sid || null, tp);
          setBusy(false);
          if (r.ok) { onDone(sid || null, r.data); onClose(); } else toast(r.error);
        }}>Use this</Btn>
      </div>
    </Sheet>
  );
};
export default Chat;
