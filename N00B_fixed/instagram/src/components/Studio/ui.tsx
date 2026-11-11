import React from 'react';
import { RotateCcw } from 'lucide-react';

// The small parts every panel is made of.
export const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <section className="sx-section">
    <div className="sx-section-head flex items-center justify-between mb-2">
      <h3 className="sx-section-title">{title}</h3>
      {right}
    </div>
    <div className="space-y-2.5">{children}</div>
  </section>
);

export const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; reset?: number; unit?: string; testId?: string }> = ({ label, value, min, max, step = 1, onChange, reset, unit = '', testId }) => (
  <div>
    <div className="flex items-center justify-between text-[11px] mb-0.5">
      <label className="sx-label font-semibold">{label}</label>
      <span className="flex items-center gap-1">
        <input
          type="number" value={Number.isFinite(value) ? +value.toFixed(2) : 0} min={min} max={max} step={step}
          onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v))); }}
          aria-label={`${label} value`}
          className="sx-num w-14 rounded-md px-1 py-0.5 text-right text-[11px]"
        />
        <span className="text-zinc-500 w-3">{unit}</span>
        {reset !== undefined && (
          <button onClick={() => onChange(reset)} aria-label={`Reset ${label}`} disabled={value === reset} className="sx-iconbtn w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 disabled:opacity-20"><RotateCcw className="w-3 h-3" /></button>
        )}
      </span>
    </div>
    <input
      type="range" value={value} min={min} max={max} step={step} data-testid={testId}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      aria-label={label}
      className="sx-range w-full h-6"
      style={{ ['--sx-fill' as string]: `${max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0}%` }}
    />
  </div>
);

export const Chips: React.FC<{ options: Array<{ id: string; label: string; hint?: string }>; value: string; onChange: (id: string) => void; cols?: number }> = ({ options, value, onChange, cols }) => (
  <div className="flex flex-wrap gap-1.5" style={cols ? { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
    {options.map((o) => (
      <button
        key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id} title={o.hint}
        className={`sx-chip ${value === o.id ? 'is-on' : ''}`}
      >{o.label}</button>
    ))}
  </div>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'plain' | 'danger' }> = ({ tone = 'plain', className = '', ...p }) => (
  <button
    {...p}
    className={`sx-btn ${tone === 'primary' ? 'sx-btn-primary' : tone === 'danger' ? 'sx-btn-danger' : 'sx-btn-plain'} ${className}`}
  />
);

export const ColorInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; swatches?: string[] }> = ({ label, value, onChange, swatches }) => (
  <div>
    <div className="sx-label text-[11px] font-semibold mb-1">{label}</div>
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} aria-label={label} className="sx-colorwell w-8 h-8 rounded-full bg-transparent p-0" />
      {(swatches || SWATCHES).map((c) => (
        <button key={c} onClick={() => onChange(c)} aria-label={`${label} ${c}`} className={`sx-swatch w-6 h-6 rounded-full ${value.toLowerCase() === c ? 'is-on' : ''}`} style={{ background: c }} />
      ))}
    </div>
  </div>
);

export const SWATCHES = ['#ffffff', '#000000', '#ff4d6d', '#ffd23f', '#3ddc84', '#00c2ff', '#7c4dff', '#ff8a3d', '#ffe38a'];

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="sx-empty m-3 p-4 rounded-2xl text-center text-[12px]">{children}</div>
);
