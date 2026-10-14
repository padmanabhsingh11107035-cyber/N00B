import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowRightLeft, Check, ChevronLeft, Copy, Languages, Loader2, X } from 'lucide-react';
import { LANGUAGES, findLanguage } from '../../i18n/languages';
import { useLanguage } from '../../i18n/useLanguage';
import { chooseLanguage } from '../../i18n/account';
import {
  getAutoTranslate, setAutoTranslateSaved, syncAutoTranslate, subscribeAuto, translatedOnScreen, translateOne, languageLabel, alreadyInLanguage
} from '../../i18n/contentTranslator';

interface TranslatorPageProps {
  onClose: () => void;
}

const MAX = 1500;
// languages people ask for most, offered as quick buttons
const QUICK = ['en', 'hi', 'gu', 'mr', 'bn', 'ta', 'te', 'pa', 'ur', 'es'];

// Profile > ⋮ > Translator. (1) Type or paste any text and get it in another language. (2) Switch on "Translate the whole app": the writing you see (captions, comments,
// bios) is shown in your language, as you scroll. Text only: pictures and videos are not changed. Private chats are never translated on their own.
export const TranslatorPage: React.FC<TranslatorPageProps> = ({ onClose }) => {
  const appLang = useLanguage();
  const [text, setText] = useState('');
  const [to, setTo] = useState(appLang);
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [auto, setAuto] = useState(() => getAutoTranslate());
  const count = useSyncExternalStore(subscribeAuto, translatedOnScreen, () => 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sorted = useMemo(() => [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name)), []);

  const translate = async () => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t || busy) return;
    setBusy(true);
    setError('');
    setOut('');
    if (alreadyInLanguage(t, to)) {
      setBusy(false);
      setOut(t);
      setError(`This text already looks like ${languageLabel(to)}.`);
      return;
    }
    const res = await translateOne(t, to);
    setBusy(false);
    if (res.text) setOut(res.text);
    else setError(res.busy ? 'The translator is busy right now. Please try again in a minute.' : 'Could not translate this. Please check your connection and try again.');
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(out); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setError('Could not copy.'); }
  };

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    setAutoTranslateSaved(next);
    syncAutoTranslate(appLang);
  };

  // one language for the whole app and the translator: the menus, and (when switched on) everything people wrote
  const chooseAppLanguage = (code: string) => { void chooseLanguage(code).then(() => syncAutoTranslate(code)); };

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 text-zinc-50 flex flex-col overflow-hidden" role="dialog" aria-label="Translator" data-testid="translator-page">
      <header className="flex items-center gap-2 px-3 py-3 border-b border-zinc-800 shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-900 text-zinc-200 cursor-pointer" aria-label="Back"><ChevronLeft className="w-5 h-5" /></button>
        <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center"><Languages className="w-4 h-4 text-sky-300" /></div>
        <h1 className="text-base font-black">Translator</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 max-w-xl w-full mx-auto">
        {/* 1. translate any text */}
        <section className="rounded-3xl bg-zinc-900/70 border border-zinc-800 p-4 space-y-3">
          <h2 className="text-sm font-black">Translate any text</h2>
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value.slice(0, MAX)); setOut(''); setError(''); }}
              placeholder="Type or paste what you want to translate…"
              rows={4}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-3.5 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400 resize-none"
              data-testid="translator-input"
            />
            {text && (
              <button onClick={() => { setText(''); setOut(''); setError(''); }} className="absolute top-2 right-2 p-1.5 rounded-full text-zinc-500 hover:text-white cursor-pointer" aria-label="Clear"><X className="w-3.5 h-3.5" /></button>
            )}
            <span className="absolute bottom-2 right-3 text-[10px] text-zinc-500">{text.length}/{MAX}</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((code) => (
              <button
                key={code}
                onClick={() => { setTo(code); setOut(''); }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer border ${to === code ? 'bg-sky-400 text-black border-sky-400' : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'}`}
                translate="no"
              >
                {findLanguage(code)?.native ?? code}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-zinc-500 shrink-0" />
            <label className="sr-only" htmlFor="translator-to">Translate to</label>
            <select
              id="translator-to"
              value={to}
              onChange={(e) => { setTo(e.target.value); setOut(''); }}
              className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-400"
              data-testid="translator-to"
            >
              {sorted.map((l) => <option key={l.code} value={l.code}>{l.name} — {l.native}</option>)}
            </select>
          </div>

          <button
            onClick={() => void translate()}
            disabled={!text.trim() || busy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-sky-400 text-black text-sm font-black disabled:opacity-50 cursor-pointer"
            data-testid="translator-go"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
            {busy ? 'Translating…' : `Translate to ${languageLabel(to)}`}
          </button>
          {error && <p className="text-xs text-amber-300" role="alert">{error}</p>}
          {out && (
            <div className="rounded-2xl bg-zinc-950 border border-sky-500/30 p-3.5 space-y-2" data-testid="translator-output">
              <p className="text-sm text-white whitespace-pre-wrap break-words" dir="auto" translate="no">{out}</p>
              <button onClick={() => void copy()} className="flex items-center gap-1.5 text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </section>

        {/* 2. translate everything that is written on the screen */}
        <section className="rounded-3xl bg-zinc-900/70 border border-zinc-800 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-black">Translate the whole app</h2>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Captions, comments and bios you see are shown in <strong className="text-white" translate="no">{languageLabel(appLang)}</strong>, as you scroll. Switch it off and the original writing comes back.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={auto}
              onClick={toggleAuto}
              className={`relative w-12 h-7 rounded-full shrink-0 transition-colors cursor-pointer ${auto ? 'bg-sky-400' : 'bg-zinc-700'}`}
              aria-label="Translate the whole app"
              data-testid="translator-auto"
            >
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${auto ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div>
            <p className="text-[11px] font-bold text-zinc-300 mb-1.5">The language of the app and the translator</p>
            <select
              value={appLang}
              onChange={(e) => { chooseAppLanguage(e.target.value); setTo(e.target.value); }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-400"
              data-testid="translator-app-language"
            >
              {sorted.map((l) => <option key={l.code} value={l.code}>{l.name} — {l.native}</option>)}
            </select>
          </div>

          {auto && <p className="text-[11px] text-sky-300" data-testid="translator-count">{count > 0 ? `${count} text${count === 1 ? '' : 's'} translated so far` : 'Looking for text to translate…'}</p>}
        </section>

        <ul className="text-[11px] text-zinc-500 space-y-1.5 px-1 pb-6 list-disc pl-5">
          <li>Only text is translated. Pictures and videos stay as they are.</li>
          <li>Private chats are end-to-end encrypted, so they are never translated on their own. Press and hold a message, then tap Translate: only that one message is sent.</li>
          <li>A translation is a good guess, not a promise. Names, @handles and hashtags are kept as they are.</li>
        </ul>
      </div>
    </div>
  );
};
