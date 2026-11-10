import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Globe, Search } from 'lucide-react';
import './languagePicker.css';
import { DEFAULT_LANGUAGE, LANGUAGES, deviceLanguage, findLanguage, searchLanguages, type LanguageInfo } from '../../i18n/languages.ts';
import { useLanguage, useLanguagePercent } from '../../i18n/useLanguage.ts';

interface LanguagePickerProps {
  value: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

// A searchable list of every language, each written in its own language (so anyone can find theirs, whatever the app is showing).
export const LanguagePicker: React.FC<LanguagePickerProps> = ({ value, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const suggested = useMemo(() => {
    const code = deviceLanguage();
    return code !== DEFAULT_LANGUAGE && code !== value ? findLanguage(code) : undefined;
  }, [value]);
  const shown = useMemo(() => searchLanguages(query), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const row = (l: LanguageInfo) => {
    const selected = l.code === value;
    let h = 0;
    for (const ch of l.code) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return (
      <button key={l.code} type="button" onClick={() => onSelect(l.code)} aria-current={selected ? 'true' : undefined} className="lp-row">
        <span className="lp-dot" aria-hidden="true" style={{ ['--a' as string]: `hsl(${h} 85% 58%)`, ['--b' as string]: `hsl(${(h + 50) % 360} 85% 52%)` }}>{l.name.slice(0, 2)}</span>
        <span translate="no" className="lp-names">
          <span className="lp-native" dir="auto">{l.native}</span>
          <span className="lp-en">{l.name}</span>
        </span>
        {selected && <span className="lp-tick"><Check size={16} strokeWidth={3} /></span>}
      </button>
    );
  };

  return (
    <div className="lp-page" role="dialog" aria-modal="true" aria-label="Choose your language">
      <header className="lp-head">
        <div className="lp-top">
          <button type="button" onClick={onClose} className="lp-back" aria-label="Back"><ArrowLeft size={20} /></button>
          <h3 className="lp-title">Choose your language</h3>
        </div>
        <p className="lp-sub">Menus, buttons and messages will use it. Posts and reels stay as they were written.</p>
        <div className="lp-search">
          <Search size={18} />
          <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search languages" autoComplete="off" />
        </div>
      </header>
      <div className="lp-list">
        {!query.trim() && suggested && (
          <>
            <p className="lp-label">Suggested for this device</p>
            {row(suggested)}
            <p className="lp-label">All languages ({LANGUAGES.length})</p>
          </>
        )}
        {shown.map(row)}
        {shown.length === 0 && <p className="lp-empty">No language found. Try another spelling.</p>}
      </div>
      <Progress />
    </div>
  );
};

// A quiet note while a newly chosen language is still being prepared (the first person to pick a language waits a little; then everyone gets it at once).
const Progress: React.FC = () => {
  const lang = useLanguage();
  const percent = useLanguagePercent();
  if (lang === DEFAULT_LANGUAGE || percent >= 100) return null;
  return (
    <div className="lp-progress">
      <i />
      <span>Getting this language ready… {percent}%. Anything not ready yet shows in English.</span>
    </div>
  );
};

// A small button showing the current language; tapping it opens the picker.
export const LanguageButton: React.FC<{ onClick: () => void; className?: string }> = ({ onClick, className = '' }) => {
  const lang = useLanguage();
  const info = findLanguage(lang);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-white/10 hover:border-cyan-400/50 text-xs font-bold text-zinc-200 hover:text-white cursor-pointer transition-colors ${className}`}
      aria-label="Language"
    >
      <Globe className="w-3.5 h-3.5 text-cyan-400" />
      <span translate="no" dir="auto">{info?.native ?? 'English'}</span>
    </button>
  );
};
