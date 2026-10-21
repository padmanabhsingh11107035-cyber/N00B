import React from 'react';
import { RotateCcw } from 'lucide-react';

// The small parts every panel is made of.
export const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <section className="px-3 py-2.5 border-b border-zinc-800/80">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">{title}</h3>
      {right}
    </div>
    <div className="space-y-2.5">{children}</div>
  </section>
);

export const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; reset?: number; unit?: string; testId?: string }> = ({ label, value, min, max, step = 1, onChange, reset, unit = '', testId }) => (
  <div>
    <div className="flex items-center justify-between text-[11px] mb-0.5">
      <label className="font-semibold text-zinc-200">{label}</label>
      <span className="flex items-center gap-1">
        <input
          type="number" value={Number.isFinite(value) ? +value.toFixed(2) : 0} min={min} max={max} step={step}
          onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v))); }}
          aria-label={`${label} value`}
          className="w-14 bg-zinc-900 border border-zinc-700 rounded-md px-1 py-0.5 text-right text-[11px] text-white"
        />
        <span className="text-zinc-500 w-3">{unit}</span>
        {reset !== undefined && (
          <button onClick={() => onChange(reset)} aria-label={`Reset ${label}`} disabled={value === reset} className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white disabled:opacity-20"><RotateCcw className="w-3 h-3" /></button>
        )}
      </span>
    </div>
    <input
      type="range" value={value} min={min} max={max} step={step} data-testid={testId}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      aria-label={label}
      className="w-full accent-fuchsia-500 h-6"
    />
  </div>
);

export const Chips: React.FC<{ options: Array<{ id: string; label: string; hint?: string }>; value: string; onChange: (id: string) => void; cols?: number }> = ({ options, value, onChange, cols }) => (
  <div className="flex flex-wrap gap-1.5" style={cols ? { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
    {options.map((o) => (
      <button
        key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id} title={o.hint}
        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${value === o.id ? 'bg-fuchsia-500 border-fuchsia-300 text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}
      >{o.label}</button>
    ))}
  </div>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'plain' | 'danger' }> = ({ tone = 'plain', className = '', ...p }) => (
  <button
    {...p}
    className={`px-3 py-2 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors ${
      tone === 'primary' ? 'bg-fuchsia-500 hover:bg-fuchsia-400 text-white' : tone === 'danger' ? 'bg-rose-500/20 border border-rose-400/40 text-rose-200 hover:bg-rose-500/30' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700'
    } ${className}`}
  />
);

export const ColorInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; swatches?: string[] }> = ({ label, value, onChange, swatches }) => (
  <div>
    <div className="text-[11px] font-semibold text-zinc-200 mb-1">{label}</div>
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} aria-label={label} className="w-8 h-8 rounded-md border border-zinc-600 bg-transparent p-0" />
      {(swatches || SWATCHES).map((c) => (
        <button key={c} onClick={() => onChange(c)} aria-label={`${label} ${c}`} className={`w-6 h-6 rounded-full border-2 ${value.toLowerCase() === c ? 'border-white' : 'border-zinc-700'}`} style={{ background: c }} />
      ))}
    </div>
  </div>
);

export const SWATCHES = ['#ffffff', '#000000', '#ff4d6d', '#ffd23f', '#3ddc84', '#00c2ff', '#7c4dff', '#ff8a3d', '#ffe38a'];

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="m-3 p-4 rounded-xl border border-dashed border-zinc-700 text-center text-[12px] text-zinc-400">{children}</div>
);
