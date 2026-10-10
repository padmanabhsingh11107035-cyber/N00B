import React, { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { getThemePreference, setThemePreference, subscribeToTheme, type ThemePreference } from '../../utils/theme';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor }
];

// Dark / Light / System. "System" follows the device's own setting, so it flips by itself when the phone does.
export const AppearanceSetting: React.FC = () => {
  const [preference, setPreference] = useState<ThemePreference>(() => getThemePreference());
  useEffect(() => subscribeToTheme((next) => setPreference(next)), []);

  return (
    <div className="w-full p-2.5 rounded-xl space-y-2.5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-noob/20 border border-noob/30 flex items-center justify-center shrink-0">
          <Sun className="w-4 h-4 text-noob" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-white block">Appearance</span>
          <span className="text-[10px] text-zinc-400 block truncate">System follows your device</span>
        </div>
      </div>
      <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1.5">
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setThemePreference(value)}
              className={`py-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                active ? 'border-noob bg-noob/15 text-noob' : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
