import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Globe, Search, X } from 'lucide-react';
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
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const row = (l: LanguageInfo) => {
    const selected = l.code === value;
    return (
      <button
        key={l.code}
        type="button"
        onClick={() => onSelect(l.code)}
        aria-current={selected ? 'true' : undefined}
        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left cursor-pointer transition-colors ${selected ? 'bg-cyan-500/15 border border-cyan-400/40' : 'hover:bg-white/5 border border-transparent'}`}
      >
        <span translate="no" className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-white truncate" dir="auto">{l.native}</span>
          <span className="block text-[11px] text-zinc-500 truncate">{l.name}</span>
        </span>
        {selected && <Check className="w-4 h-4 text-cyan-300 shrink-0" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Choose your language" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-md h-[85vh] sm:h-[80vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <header className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-cyan-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-white">Choose your language</h3>
            <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">Menus, buttons and messages will use it. Posts and reels stay as they were written.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </header>

        <div className="p-3 border-b border-zinc-800">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search languages"
              autoComplete="off"
              className="w-full bg-[#141418] text-sm text-white pl-9 pr-3 py-2.5 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {!query.trim() && suggested && (
            <div className="pb-1">
              <p className="px-3.5 pt-1 pb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Suggested for this device</p>
              {row(suggested)}
              <p className="px-3.5 pt-3 pb-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">All languages ({LANGUAGES.length})</p>
            </div>
          )}
          {shown.map(row)}
          {shown.length === 0 && <p className="text-center text-xs text-zinc-500 py-10">No language found. Try another spelling.</p>}
        </div>
        <Progress />
      </div>
    </div>
  );
};

// A quiet note while a newly chosen language is still being prepared (the first person to pick a language waits a little; then everyone gets it at once).
const Progress: React.FC = () => {
  const lang = useLanguage();
  const percent = useLanguagePercent();
  if (lang === DEFAULT_LANGUAGE || percent >= 100) return null;
  return (
    <div className="px-4 py-2.5 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
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
