import React, { useEffect, useMemo, useState } from 'react';
import { Check, Moon, Monitor, Play, RotateCcw, Sun, Volume2 } from 'lucide-react';
import { ALARM_SOUNDS, CHAT_THEMES, resetPrefs, savePrefs, usePrefs, type ThemeChoice, type VoicePref } from '../../../utils/studyPrefs';
import { playTune, stopAlarm } from '../../../utils/studyAlarm';
import { canSpeak, speak, stopSpeaking } from '../../../utils/studyVoice';
import { speechLang } from '../../../utils/studyCatalog';
import { useStudy } from '../StudyContext';
import { Btn, Chip, Field, Page, Toggle } from '../ui';
import type { PageProps } from '../StudyApp';

// The voices this phone has (the list fills in a moment after the page opens on some phones)
function useVoices(): SpeechSynthesisVoice[] {
  const [list, setList] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!canSpeak()) return;
    const synth = window.speechSynthesis;
    const read = () => setList(synth.getVoices());
    read();
    synth.addEventListener?.('voiceschanged', read);
    return () => synth.removeEventListener?.('voiceschanged', read);
  }, []);
  return list;
}

const THEMES: Array<{ id: ThemeChoice; label: string; icon: React.ReactNode }> = [
  { id: 'system', label: 'Like my phone', icon: <Monitor size={16} /> },
  { id: 'light', label: 'Light', icon: <Sun size={16} /> },
  { id: 'dark', label: 'Dark', icon: <Moon size={16} /> }
];

const VoicePicker: React.FC<{ title: string; hint: string; value: VoicePref; voices: SpeechSynthesisVoice[]; lang: string; sample: string; onChange: (v: VoicePref) => void }> = ({ title, hint, value, voices, lang, sample, onChange }) => {
  const base = lang.split('-')[0].toLowerCase();
  // the voices for the learning language first, then the rest (a voice chosen earlier that is gone from this phone is kept visible as unavailable)
  const sorted = useMemo(() => {
    const mine = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
    const rest = voices.filter((v) => !v.lang.toLowerCase().startsWith(base));
    return { mine, rest };
  }, [voices, base]);
  const missing = !!value.name && !voices.some((v) => v.name === value.name);
  if (!canSpeak()) return (
    <div className="st-card-flat"><p className="st-h3 st-title">{title}</p><p className="st-small st-muted" style={{ marginTop: 4 }}>This browser cannot speak aloud, so there is no voice to choose here.</p></div>
  );
  return (
    <div className="st-card-flat" style={{ display: 'grid', gap: 10 }}>
      <div><p className="st-h3 st-title">{title}</p><p className="st-tiny st-faint" style={{ marginTop: 2 }}>{hint}</p></div>
      <Field label="Voice">
        <select className="st-input" value={value.name || ''} onChange={(e) => onChange({ ...value, name: e.target.value || null })} aria-label={title + ' voice'}>
          <option value="">Automatic (best for your language)</option>
          {missing && <option value={value.name!}>{value.name} (not on this phone)</option>}
          {sorted.mine.length > 0 && <optgroup label="Your language">{sorted.mine.map((v) => <option key={v.name + v.lang} value={v.name}>{v.name} ({v.lang})</option>)}</optgroup>}
          {sorted.rest.length > 0 && <optgroup label="Other languages">{sorted.rest.map((v) => <option key={v.name + v.lang} value={v.name}>{v.name} ({v.lang})</option>)}</optgroup>}
        </select>
      </Field>
      <div className="st-grid2">
        <Field label={`Speed ${value.rate.toFixed(2)}×`}><input type="range" min={0.5} max={1.6} step={0.05} value={value.rate} onChange={(e) => onChange({ ...value, rate: Number(e.target.value) })} style={{ width: '100%' }} aria-label={title + ' speed'} /></Field>
        <Field label={`Pitch ${value.pitch.toFixed(2)}`}><input type="range" min={0.6} max={1.6} step={0.05} value={value.pitch} onChange={(e) => onChange({ ...value, pitch: Number(e.target.value) })} style={{ width: '100%' }} aria-label={title + ' pitch'} /></Field>
      </div>
      <div><Btn small onClick={() => speak(sample, lang, { preferredVoice: value.name, rate: value.rate, pitch: value.pitch })}><Volume2 size={15} /> Hear it</Btn></div>
      {voices.length === 0 && <p className="st-tiny st-faint">Your phone has not shared its voices yet. Wait a moment, or leave this on Automatic.</p>}
    </div>
  );
};

const Appearance: React.FC<PageProps> = () => {
  const prefs = usePrefs();
  const { me, toast } = useStudy();
  const voices = useVoices();
  const lang = speechLang(me?.profile?.tutor?.language || me?.profile?.language);
  useEffect(() => () => { stopSpeaking(); stopAlarm(); }, []);

  return (
    <Page title="Looks and sounds" subtitle="Saved on this phone">
      <div style={{ display: 'grid', gap: 18 }}>
        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="st-title st-h2">Colours</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Colour mode">
            {THEMES.map((t) => <Chip key={t.id} on={prefs.theme === t.id} onClick={() => savePrefs({ theme: t.id })}>{t.icon}{t.label}</Chip>)}
          </div>
          <p className="st-tiny st-faint">“Like my phone” follows your phone’s own dark or light setting, also at night when it changes by itself.</p>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="st-title st-h2">Chat with the tutor</h2>
          <div className="st-grid3" role="group" aria-label="Chat theme">
            {CHAT_THEMES.map((c) => (
              <button key={c.id} type="button" className="st-row-btn" aria-pressed={prefs.chat === c.id} onClick={() => savePrefs({ chat: c.id })}
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 10, borderColor: prefs.chat === c.id ? c.accent : undefined, boxShadow: prefs.chat === c.id ? `0 0 0 2px ${c.accent}55` : undefined }}>
                <span style={{ display: 'block', height: 46, borderRadius: 12, background: c.wall === 'transparent' ? 'var(--st-surface2)' : c.wall, border: '1px solid var(--st-border)', position: 'relative' }}>
                  <i style={{ position: 'absolute', right: 6, top: 6, width: '46%', height: 12, borderRadius: '9px 9px 3px 9px', background: c.accent, opacity: 0.85 }} />
                  <i style={{ position: 'absolute', left: 6, bottom: 6, width: '56%', height: 12, borderRadius: '3px 9px 9px 9px', background: 'var(--st-surface)', border: '1px solid var(--st-border)' }} />
                </span>
                <span className="st-tiny" style={{ fontWeight: 800, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>{prefs.chat === c.id && <Check size={12} />}{c.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="st-title st-h2">Voices</h2>
          <VoicePicker title="AI tutor’s voice" hint="Used when the tutor reads an answer aloud and in the voice tutor." value={prefs.aiVoice} voices={voices} lang={lang} sample="Hello! I am your study tutor. Ask me anything, and we will work it out together." onChange={(aiVoice) => savePrefs({ aiVoice })} />
          <VoicePicker title="Study voice" hint="Reads your notes, flashcards and documents to you." value={prefs.studyVoice} voices={voices} lang={lang} sample="Photosynthesis is how plants turn light, water and air into food." onChange={(studyVoice) => savePrefs({ studyVoice })} />
          <p className="st-tiny st-faint">The voices come from your phone, so they are free and work without internet. A different phone may have different ones.</p>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="st-title st-h2">Alarm for your studies</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Alarm sound">
            {ALARM_SOUNDS.map((a) => (
              <Chip key={a.id} on={prefs.alarm.sound === a.id} onClick={() => { savePrefs((p) => ({ alarm: { ...p.alarm, sound: a.id } })); playTune(a.id, prefs.alarm.volume); }}>{a.label}</Chip>
            ))}
          </div>
          <Field label={`Volume ${Math.round(prefs.alarm.volume * 100)}%`}>
            <input type="range" min={0} max={1} step={0.05} value={prefs.alarm.volume} onChange={(e) => savePrefs((p) => ({ alarm: { ...p.alarm, volume: Number(e.target.value) } }))} style={{ width: '100%' }} aria-label="Alarm volume" />
          </Field>
          <Toggle on={prefs.alarm.speak} onChange={(v) => savePrefs((p) => ({ alarm: { ...p.alarm, speak: v } }))} label="Say a message after the sound" hint="For example “Time is up. Well done, take a short break.”" />
          {prefs.alarm.speak && <VoicePicker title="Alarm voice" hint="The voice that says the message." value={prefs.alarm.voice} voices={voices} lang={lang} sample="Time is up. Well done! Take a short break." onChange={(voice) => savePrefs((p) => ({ alarm: { ...p.alarm, voice } }))} />}
          <div><Btn small onClick={() => { const secs = playTune(prefs.alarm.sound, prefs.alarm.volume); if (!secs) toast('This phone did not allow sound just now.'); else if (prefs.alarm.speak && canSpeak()) window.setTimeout(() => speak('Time is up. Well done! Take a short break.', lang, { preferredVoice: prefs.alarm.voice.name, rate: prefs.alarm.voice.rate, pitch: prefs.alarm.voice.pitch }), secs * 1000 + 200); }}><Play size={15} /> Try the alarm</Btn></div>
          <p className="st-tiny st-faint">The alarm rings when a focus session or break ends while NOOB is open. A web page cannot wake a phone that is asleep, so keep the screen on for a session you must not miss.</p>
        </section>

        <div><Btn kind="ghost" onClick={() => { resetPrefs(); toast('Back to the usual look and sounds.'); }}><RotateCcw size={15} /> Reset all of these</Btn></div>
      </div>
    </Page>
  );
};
export default Appearance;
