import React from 'react';
import { RotateCcw } from 'lucide-react';

// The small parts every panel is made of. Every panel uses the same three patterns: a Section (label + stack of controls), a Slider (label left, value and reset right) and Chips (a wrapped choice row).
export const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <section className="sx-section">
    <div className="sx-section-head flex items-center justify-between">
      <h3 className="sx-section-title">{title}</h3>
      {right}
    </div>
    <div className="sx-stack">{children}</div>
  </section>
);

export const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; reset?: number; unit?: string; testId?: string }> = ({ label, value, min, max, step = 1, onChange, reset, unit = '', testId }) => (
  <div className="sx-slider">
    <div className="sx-slider-head">
      <label className="sx-label">{label}</label>
      <span className="sx-slider-val">
        <input
          type="number" inputMode="decimal" value={Number.isFinite(value) ? +value.toFixed(2) : 0} min={min} max={max} step={step}
          onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v))); }}
          aria-label={`${label} value`}
          className="sx-num"
        />
        <span className="sx-unit">{unit}</span>
        {reset !== undefined && (
          <button onClick={() => onChange(reset)} aria-label={`Reset ${label}`} disabled={value === reset} className="sx-reset"><RotateCcw className="w-3.5 h-3.5" /></button>
        )}
      </span>
    </div>
    <input
      type="range" value={value} min={min} max={max} step={step} data-testid={testId}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      aria-label={label}
      className="sx-range w-full"
      style={{ ['--sx-fill' as string]: `${max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0}%` }}
    />
  </div>
);

export const Chips: React.FC<{ options: Array<{ id: string; label: string; hint?: string }>; value: string; onChange: (id: string) => void; cols?: number; scroll?: boolean }> = ({ options, value, onChange, cols, scroll }) => (
  <div className={`sx-chips flex ${scroll ? "sx-chips-scroll" : "flex-wrap"} gap-1.5`} style={cols ? { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
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
  <div className="sx-color">
    <div className="sx-label">{label}</div>
    <div className="sx-color-row">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} aria-label={label} className="sx-colorwell" />
      {(swatches || SWATCHES).map((c) => (
        <button key={c} onClick={() => onChange(c)} aria-label={`${label} ${c}`} aria-pressed={value.toLowerCase() === c} className={`sx-swatch ${value.toLowerCase() === c ? 'is-on' : ''}`} style={{ background: c }} />
      ))}
    </div>
  </div>
);

export const SWATCHES = ['#ffffff', '#000000', '#ff4d6d', '#ffd23f', '#3ddc84', '#00c2ff', '#7c4dff', '#ff8a3d', '#ffe38a'];

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="sx-empty">{children}</div>
);
