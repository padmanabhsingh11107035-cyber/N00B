import React, { useEffect, useRef } from 'react';
import { Grade, NO_GRADE, Wheel, isPlainGrade } from './types';
import { Btn, Section, Slider } from './ui';
import { mediaTarget } from './panels';
import type { StudioCtl } from './StudioApp';

// The Color tab: three colour wheels (shadows, midtones, highlights), a spectrum to wash the whole picture in one colour, a live histogram and a few starting looks.
// The picture is graded by the same shader as everything else (gl.ts), so the preview, the exported picture and the exported video all agree.

// the wheel's colour ring: the colour at a point of the wheel is the colour the puck there adds (hue = angle from the right, counter-clockwise)
const HUES = 'conic-gradient(' + Array.from({ length: 13 }, (_, i) => `hsl(${(90 - i * 30 + 720) % 360} 100% 50%) ${(i / 12) * 100}%`).join(', ') + ')';
const DISC = `radial-gradient(circle at center, #3f3f46 0%, rgba(63,63,70,0.82) 22%, rgba(63,63,70,0) 100%), ${HUES}`;

const WheelPad: React.FC<{ label: string; hint: string; value: Wheel; onChange: (w: Wheel) => void; testId: string }> = ({ label, hint, value, onChange, testId }) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const from = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = -(e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    onChange({ ...value, x: +x.toFixed(3), y: +y.toFixed(3) });
  };
  const key = (e: React.KeyboardEvent) => {
    const s = e.shiftKey ? 0.15 : 0.04;
    const d = e.key === 'ArrowLeft' ? [-s, 0] : e.key === 'ArrowRight' ? [s, 0] : e.key === 'ArrowUp' ? [0, s] : e.key === 'ArrowDown' ? [0, -s] : null;
    if (d) { e.preventDefault(); e.stopPropagation(); const x = value.x + d[0], y = value.y + d[1], m = Math.hypot(x, y); onChange({ ...value, x: m > 1 ? x / m : x, y: m > 1 ? y / m : y }); }
    else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Home') { e.preventDefault(); e.stopPropagation(); onChange({ ...value, x: 0, y: 0 }); }
  };
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <div className="text-[11px] font-bold text-zinc-200 text-center leading-tight">{label}<span className="block text-[9px] font-medium text-zinc-500">{hint}</span></div>
      <div
        ref={ref} data-testid={testId} role="slider" tabIndex={0} aria-label={`${label} colour wheel`} aria-valuetext={`x ${value.x.toFixed(2)}, y ${value.y.toFixed(2)}`}
        onPointerDown={(e) => { dragging.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the drag still works while the pointer is over the wheel */ } from(e); }}
        onPointerMove={(e) => { if (dragging.current) from(e); }}
        onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}
        onDoubleClick={() => onChange({ ...value, x: 0, y: 0 })}
        onKeyDown={key}
        className="relative w-full aspect-square max-w-[104px] rounded-full touch-none cursor-crosshair ring-2 ring-zinc-700 focus-visible:ring-fuchsia-400 outline-none"
        style={{ background: DISC }}
      >
        <span className="absolute inset-[22%] rounded-full border border-white/10 pointer-events-none" />
        <span className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 pointer-events-none" /><span className="absolute top-1/2 left-0 right-0 h-px bg-white/10 pointer-events-none" />
        <span
          className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-zinc-900 shadow pointer-events-none"
          style={{ left: `${50 + value.x * 50}%`, top: `${50 - value.y * 50}%` }}
        />
      </div>
      <input
        type="range" min={-100} max={100} value={value.l} aria-label={`${label} brightness`}
        onChange={(e) => onChange({ ...value, l: parseInt(e.target.value, 10) })}
        onDoubleClick={() => onChange({ ...value, l: 0 })}
        className="w-full accent-fuchsia-500 h-5"
      />
      <div className="text-[10px] font-mono text-zinc-400">{value.l > 0 ? '+' : ''}{value.l}</div>
    </div>
  );
};

/** The spectrum: left to right the hue, top to bottom less and less colour. Whatever is picked is washed over the whole picture. */
const Spectrum: React.FC<{ g: Grade; onChange: (patch: Partial<Grade>) => void }> = ({ g, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const from = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    onChange({ washHue: Math.round(x * 359), washSat: +(1 - y).toFixed(2), washAmt: g.washAmt || 25 });
  };
  return (
    <div
      ref={ref} data-testid="color-spectrum" role="slider" tabIndex={0} aria-label="Colour wash: hue and strength of colour" aria-valuetext={`hue ${g.washHue}, colour ${Math.round(g.washSat * 100)}%`}
      onPointerDown={(e) => { dragging.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the drag still works while the pointer is over the spectrum */ } from(e); }}
      onPointerMove={(e) => { if (dragging.current) from(e); }}
      onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}
      onKeyDown={(e) => {
        const s = e.shiftKey ? 20 : 5;
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); onChange({ washHue: (g.washHue + 360 - s) % 360 }); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); onChange({ washHue: (g.washHue + s) % 360 }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); onChange({ washSat: Math.min(1, g.washSat + s / 100) }); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); onChange({ washSat: Math.max(0, g.washSat - s / 100) }); }
      }}
      className="relative w-full h-28 rounded-xl cursor-crosshair touch-none ring-1 ring-zinc-700 focus-visible:ring-fuchsia-400 outline-none overflow-hidden"
      style={{ background: 'linear-gradient(to bottom, rgba(110,110,118,0) 0%, rgba(80,80,88,0.95) 100%), linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}
    >
      <span
        className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow pointer-events-none"
        style={{ left: `${(g.washHue / 359) * 100}%`, top: `${(1 - g.washSat) * 100}%`, background: `hsl(${g.washHue} ${Math.round(g.washSat * 100)}% 50%)`, opacity: g.washAmt > 0 ? 1 : 0.5 }}
      />
    </div>
  );
};

/** The brightness of the picture as a mountain range for each of red, green and blue (read from what is on the stage, a few times a second). */
const Histogram: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const tmp = document.createElement('canvas');
    tmp.width = 96; tmp.height = 96;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    const draw = () => {
      const src = document.querySelector<HTMLCanvasElement>('[data-testid="studio-canvas"]');
      const out = ref.current;
      if (!src || !out || !tctx || src.width < 2) return;
      try {
        tctx.drawImage(src, 0, 0, 96, 96);
        const px = tctx.getImageData(0, 0, 96, 96).data;
        const bins = [new Array(64).fill(0), new Array(64).fill(0), new Array(64).fill(0)];
        for (let i = 0; i < px.length; i += 4) { bins[0][px[i] >> 2]++; bins[1][px[i + 1] >> 2]++; bins[2][px[i + 2] >> 2]++; }
        const max = Math.max(1, ...bins.flatMap((b) => b.slice(1, 63)));
        const c = out.getContext('2d')!;
        c.clearRect(0, 0, out.width, out.height);
        c.globalCompositeOperation = 'lighter';
        const cols = ['rgba(255,70,70,0.75)', 'rgba(70,255,100,0.75)', 'rgba(80,140,255,0.75)'];
        bins.forEach((b, ci) => {
          c.fillStyle = cols[ci];
          c.beginPath(); c.moveTo(0, out.height);
          b.forEach((v, i) => c.lineTo((i / 63) * out.width, out.height - Math.min(1, v / max) * out.height));
          c.lineTo(out.width, out.height); c.closePath(); c.fill();
        });
      } catch { /* the stage is not ready yet */ }
    };
    draw();
    const id = window.setInterval(draw, 400);
    return () => window.clearInterval(id);
  }, []);
  return <canvas ref={ref} width={256} height={72} aria-label="Histogram of the picture" data-testid="color-histogram" className="w-full h-[72px] rounded-lg bg-zinc-900 border border-zinc-800" />;
};

const w = (hueDeg: number, amt: number, l = 0): Wheel => ({ x: +(Math.cos((hueDeg * Math.PI) / 180) * amt).toFixed(3), y: +(Math.sin((hueDeg * Math.PI) / 180) * amt).toFixed(3), l });
const LOOKS: Array<{ id: string; name: string; g: Grade }> = [
  { id: 'teal-orange', name: 'Teal & orange', g: { ...NO_GRADE, lift: w(190, 0.55), gain: w(35, 0.6), gamma: w(0, 0, 4) } },
  { id: 'warm-film', name: 'Warm film', g: { ...NO_GRADE, lift: w(40, 0.25, 6), gamma: w(30, 0.2), gain: w(40, 0.35, -4) } },
  { id: 'cold-night', name: 'Cold night', g: { ...NO_GRADE, lift: w(235, 0.5), gamma: w(220, 0.25, -8), gain: w(210, 0.2, -6) } },
  { id: 'matte', name: 'Matte fade', g: { ...NO_GRADE, lift: w(0, 0, 22), gain: w(0, 0, -12) } },
  { id: 'bleach', name: 'Moody green', g: { ...NO_GRADE, lift: w(130, 0.3, -4), gamma: w(100, 0.2, -10), gain: w(60, 0.15) } },
  { id: 'sunset', name: 'Sunset wash', g: { ...NO_GRADE, washHue: 22, washSat: 0.9, washAmt: 45, gain: w(35, 0.3) } }
];

export const ColorPanel: React.FC<{ ctl: StudioCtl }> = ({ ctl }) => {
  const t = mediaTarget(ctl);
  if (!t) return <div className="m-3 p-4 rounded-xl border border-dashed border-zinc-700 text-center text-[12px] text-zinc-400">Add a photo or video first (Media tab), then grade its colour here.</div>;
  const g = t.grade || NO_GRADE;
  const set = (patch: Partial<Grade>, key = `${t.id}:grade`) => ctl.updateLayer(t.id, { grade: { ...g, ...patch } }, key);
  const plain = isPlainGrade(t.grade);
  return (
    <>
      <Section title="Colour wheels" right={<button onClick={() => ctl.updateLayer(t.id, { grade: undefined })} disabled={plain} className="text-[10px] font-bold text-fuchsia-300 disabled:opacity-30" data-testid="color-reset">Reset all</button>}>
        <p className="text-[11px] text-zinc-400 -mt-1">Grading: <b className="text-white">{t.name}</b>. Drag a dot towards a colour to add that colour to that part of the picture. Double-click a wheel to reset it.</p>
        <div className="grid grid-cols-3 gap-2">
          <WheelPad label="Shadows" hint="Lift" value={g.lift} onChange={(v) => set({ lift: v }, `${t.id}:lift`)} testId="wheel-lift" />
          <WheelPad label="Midtones" hint="Gamma" value={g.gamma} onChange={(v) => set({ gamma: v }, `${t.id}:gamma`)} testId="wheel-gamma" />
          <WheelPad label="Highlights" hint="Gain" value={g.gain} onChange={(v) => set({ gain: v }, `${t.id}:gain`)} testId="wheel-gain" />
        </div>
      </Section>
      <Section title="Colour wash" right={<button onClick={() => set({ washAmt: 0, washHue: 0, washSat: 1 })} disabled={g.washAmt === 0} className="text-[10px] font-bold text-fuchsia-300 disabled:opacity-30">Reset</button>}>
        <Spectrum g={g} onChange={(p) => set(p, `${t.id}:wash`)} />
        <Slider label="Strength" value={g.washAmt} min={0} max={100} onChange={(v) => set({ washAmt: v }, `${t.id}:washamt`)} reset={0} unit="%" testId="color-wash-strength" />
      </Section>
      <Section title="Histogram">
        <Histogram />
      </Section>
      <Section title="Starting looks">
        <div className="grid grid-cols-2 gap-1.5">
          {LOOKS.map((l) => (
            <button key={l.id} onClick={() => ctl.updateLayer(t.id, { grade: l.g })} data-testid={`look-${l.id}`} className="rounded-lg bg-zinc-900 border border-zinc-700 hover:border-fuchsia-400 px-2 py-2 text-left text-[11px] font-bold flex items-center gap-2">
              <span className="flex -space-x-1">
                {[l.g.lift, l.g.gamma, l.g.gain].map((wh, i) => <span key={i} className="w-3.5 h-3.5 rounded-full border border-zinc-900" style={{ background: Math.hypot(wh.x, wh.y) < 0.02 ? '#52525b' : `hsl(${(Math.atan2(wh.y, wh.x) * 180) / Math.PI} 80% 55%)` }} />)}
              </span>
              <span className="truncate">{l.name}</span>
            </button>
          ))}
        </div>
        {ctl.project.mode === 'video' && ctl.project.layers.filter((x) => x.type === 'media').length > 1 && (
          <Btn className="w-full" onClick={() => ctl.update((p) => ({ ...p, layers: p.layers.map((x) => (x.type === 'media' ? { ...x, grade: t.grade } : x)) }))} disabled={plain}>Use this grade on every clip</Btn>
        )}
      </Section>
    </>
  );
};
