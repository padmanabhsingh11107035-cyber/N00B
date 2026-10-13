import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, MessageSquareText, RotateCw, Send, Square, Volume2, VolumeX } from 'lucide-react';
import { aiHealth, newRef, streamChat, transcribe, type AiHealth } from '../../../services/studyAi';
import { languageLabel, speechLang } from '../../../utils/studyCatalog';
import { canRecognize, canRecord, canSpeak, describeVoiceError, listen, record, speak, stopSpeaking, type Listener, type RecorderHandle } from '../../../utils/studyVoice';
import { useStudy } from '../StudyContext';
import { goStudy } from '../studyStore';
import { Markdown } from '../Markdown';
import { Btn, Orb, Page } from '../ui';
import type { PageProps } from '../StudyApp';

// Talk to the tutor: tap, speak, see your words (and fix them), send, and listen to the answer. The microphone is on only while the screen says so,
// the recording (if the device has no recognition of its own) is turned into words and thrown away, and the answer is read aloud only on this screen,
// where the student chose to talk (with a button to stop it or switch it off).
type Phase = 'idle' | 'listening' | 'recording' | 'review' | 'thinking' | 'speaking' | 'answered';
const AUTO_KEY = 'noob.study.readAloud';

const Voice: React.FC<PageProps> = ({ params }) => {
  const { me, subjects, toast } = useStudy();
  const tutorName = me?.profile?.tutor?.name?.trim() || 'your tutor';
  const lang = me?.profile?.tutor?.language || me?.profile?.language || 'en';
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; } });
  const conv = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const listener = useRef<Listener | null>(null);
  const recorder = useRef<RecorderHandle | null>(null);
  const subject = typeof params.subject === 'string' ? params.subject : null;
  const subjectName = subject ? subjects.find((s) => s.id === subject)?.name : '';

  useEffect(() => { void aiHealth().then((r) => { if (r.ok) setHealth(r.data); }); return () => { abort.current?.abort(); stopSpeaking(); listener.current?.stop(); recorder.current?.cancel(); }; }, []);
  const device = canRecognize();
  const canListen = device || (canRecord() && !!health?.speechToText);

  const startListening = async () => {
    setError(null); stopSpeaking();
    if (device) {
      let last = '';
      listener.current = listen(speechLang(lang), {
        onText: (t) => { last = t; setHeard(t); },
        onEnd: () => { listener.current = null; setPhase(last.trim() ? 'review' : 'idle'); if (!last.trim()) setError(describeVoiceError('no-speech')); },
        onError: (c) => { const m = describeVoiceError(c); if (m) setError(m); setPhase('idle'); }
      });
      if (listener.current) { setHeard(''); setPhase('listening'); }
    } else if (canListen) {
      try { recorder.current = await record(); setHeard(''); setPhase('recording'); } catch (err) { setError(describeVoiceError((err as Error)?.name || '')); }
    } else setError(describeVoiceError('unsupported'));
  };
  const stopListening = async () => {
    if (phase === 'listening') { listener.current?.stop(); return; }
    if (phase === 'recording') {
      const h = recorder.current; recorder.current = null;
      setPhase('thinking');
      const clip = h ? await h.stop() : null;
      if (!clip) { setPhase('idle'); setError(describeVoiceError('no-speech')); return; }
      const r = await transcribe(clip.base64, clip.mime, lang.split('-')[0]);
      if (r.ok && r.data.text) { setHeard(r.data.text); setPhase('review'); } else { setPhase('idle'); setError(r.ok ? describeVoiceError('no-speech') : r.error); }
    }
  };

  const sendHeard = async () => {
    const message = heard.trim();
    if (!message) return;
    setError(null); setAnswer(''); setPhase('thinking');
    const ctl = new AbortController(); abort.current = ctl;
    let full = '';
    const res = await streamChat({ message, conversationId: conv.current, subjectId: subject, mode: 'chat', clientRef: newRef() }, (e) => {
      if (e.t === 'meta') conv.current = e.conversationId;
      else if (e.t === 'delta') { full += e.text; setAnswer(full); }
      else if (e.t === 'error') setError(e.message);
    }, ctl.signal);
    abort.current = null;
    if (!res.ok) { if (res.code !== 'aborted') setError(res.error); setPhase('idle'); return; }
    if (!full.trim()) { setPhase('idle'); if (!error) setError('The tutor did not answer. Please try again.'); return; }
    if (auto && canSpeak()) { setPhase('speaking'); speak(full, speechLang(lang), { preferredVoice: me?.profile?.tutor?.voice, onEnd: () => setPhase('answered') }); }
    else setPhase('answered');
  };
  const interrupt = () => { stopSpeaking(); abort.current?.abort(); setPhase(answer ? 'answered' : 'idle'); };
  const toggleAuto = () => { const v = !auto; setAuto(v); try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* it lasts until the app closes */ } if (!v) stopSpeaking(); };

  const label = { idle: 'Tap to talk', listening: 'Listening… tap to stop', recording: 'Recording… tap to stop', review: 'Check your words, then send', thinking: `${tutorName === 'your tutor' ? 'Thinking' : `${tutorName} is thinking`}…`, speaking: 'Reading the answer…', answered: 'Tap to ask more' }[phase];
  const live = phase === 'listening' || phase === 'recording';

  return (
    <Page title="Talk to your tutor" subtitle={`${languageLabel(lang)}${subjectName ? ` · ${subjectName}` : ''}`}>
      <div style={{ display: 'grid', gap: 18, justifyItems: 'center', textAlign: 'center' }}>
        {health && !health.configured && <div className="st-notice st-notice-warn" style={{ width: '100%', textAlign: 'left' }}>The tutor is not switched on yet, so it cannot answer. You can still try the microphone.</div>}
        {!canListen && health && <div className="st-notice st-notice-warn" style={{ width: '100%', textAlign: 'left' }}>{describeVoiceError('unsupported')}</div>}
        <button
          className="st-tutor-orb"
          onClick={() => { if (live) void stopListening(); else if (phase === 'speaking' || phase === 'thinking') interrupt(); else void startListening(); }}
          disabled={!canListen}
          aria-label={live ? 'Stop listening' : phase === 'speaking' ? 'Stop the answer' : 'Start talking'}
          style={{ width: 132, height: 132, border: 0, cursor: canListen ? 'pointer' : 'not-allowed', display: 'grid', placeItems: 'center', color: 'var(--st-accent-ink)', transform: live ? 'scale(1.06)' : 'none', transition: 'transform .3s', opacity: canListen ? 1 : 0.5 }}
        >
          {live ? <MicOff size={42} /> : phase === 'speaking' ? <Volume2 size={42} /> : <Mic size={42} />}
        </button>
        <p className="st-title st-h3" role="status" aria-live="polite">{label}</p>
        {live && <p className="st-small st-muted">The microphone is on. It switches off when you tap again.</p>}

        {(phase === 'review' || heard) && phase !== 'idle' && (
          <div style={{ width: '100%', display: 'grid', gap: 10, textAlign: 'left' }}>
            <textarea className="st-input" value={heard} onChange={(e) => setHeard(e.target.value)} aria-label="What I heard" readOnly={live || phase === 'thinking'} style={{ minHeight: 84 }} />
            {phase === 'review' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <Btn onClick={() => void startListening()}><RotateCw size={15} /> Say it again</Btn>
                <Btn kind="primary" style={{ flex: 1 }} disabled={!heard.trim()} onClick={() => void sendHeard()}><Send size={16} /> Send</Btn>
              </div>
            )}
          </div>
        )}

        {error && <div className="st-notice st-notice-warn" role="alert" style={{ width: '100%', textAlign: 'left' }}>{error}</div>}

        {answer && (
          <div className="st-card-flat st-in" style={{ width: '100%', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Orb size={24} /><span className="st-small st-muted" style={{ fontWeight: 800 }}>{tutorName === 'your tutor' ? 'Your tutor' : tutorName}</span></div>
            <Markdown text={answer} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {canSpeak() && <Btn small kind={auto ? 'plain' : 'ghost'} onClick={toggleAuto} aria-pressed={auto}>{auto ? <Volume2 size={15} /> : <VolumeX size={15} />} {auto ? 'Reading answers aloud' : 'Answers are silent'}</Btn>}
          {phase === 'speaking' && <Btn small onClick={interrupt}><Square size={14} /> Stop</Btn>}
          {answer && canSpeak() && phase === 'answered' && <Btn small onClick={() => { setPhase('speaking'); speak(answer, speechLang(lang), { onEnd: () => setPhase('answered') }); }}><Volume2 size={15} /> Hear it again</Btn>}
          {conv.current && <Btn small onClick={() => goStudy('chat', { conversation: conv.current })}><MessageSquareText size={15} /> Open the full chat</Btn>}
        </div>
        <p className="st-tiny st-faint" style={{ maxWidth: 320 }}>The microphone listens only while you tap it. NOOB does not keep your voice, only the words, in your chat. (Your phone or browser may use its own speech service to turn sound into words.)</p>
      </div>
    </Page>
  );
};
export default Voice;
