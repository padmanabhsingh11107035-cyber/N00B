import React from 'react';

// Small, dependency-free charts (plain SVG): a line, bars, a histogram and a pie (donut). Used by the student's progress page and the administrator's panels.
// They follow the colours of the page around them (text uses the current colour) and carry a plain-words description for screen readers.
export const PALETTE = ['#e38b69', '#b9a8f2', '#7fd1ac', '#f2c46d', '#6fb1f2', '#e57fa8', '#9ad06b', '#c79b7a', '#8ad0d6', '#d6a2e8'];

const nice = (max: number): number => {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
};
const fmt = (n: number): string => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n * 10) / 10));
// the number in the middle of a pie shrinks as it gets longer, so it always stays inside the hole
export const bigText = (s: string): number => (s.length <= 4 ? 19 : s.length <= 6 ? 16 : s.length <= 8 ? 13 : 11);
const short = (s: string, n = 9): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export const Empty: React.FC<{ text?: string; height?: number }> = ({ text = 'Nothing to show yet', height = 120 }) => (
  <div role="img" aria-label={text} style={{ height, display: 'grid', placeItems: 'center', opacity: 0.6, fontSize: 13, textAlign: 'center', padding: 8 }}>{text}</div>
);

// ---- a line over time (with a soft area under it)
export interface LinePoint { x: string; y: number }
export const LineChart: React.FC<{ points: LinePoint[]; height?: number; color?: string; label: string; unit?: string; area?: boolean; max?: number }> = ({ points, height = 170, color = PALETTE[0], label, unit = '', area = true, max }) => {
  if (!points.length || points.every((p) => !p.y)) return <Empty text={'No ' + label.toLowerCase() + ' yet'} height={height} />;
  const W = 340, H = height, L = 30, R = 10, T = 12, B = 24;
  const top = max ?? nice(Math.max(...points.map((p) => p.y)));
  const x = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + (1 - Math.min(1, v / top)) * (H - T - B);
  const line = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.y).toFixed(1)).join(' ');
  const areaPath = line + ' L' + x(points.length - 1).toFixed(1) + ' ' + (H - B) + ' L' + x(0).toFixed(1) + ' ' + (H - B) + ' Z';
  const best = points.reduce((a, p) => (p.y > a.y ? p : a), points[0]);
  const gid = 'lc' + label.replace(/\W/g, '') + points.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label}: highest ${fmt(best.y)}${unit} on ${best.x}, latest ${fmt(points[points.length - 1].y)}${unit}`} style={{ display: 'block' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} stroke="currentColor" strokeOpacity="0.12" /><text x={L - 5} y={y(top * f) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.6">{fmt(top * f)}</text></g>)}
      {area && <path d={areaPath} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {points.length <= 31 && points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.y)} r={i === points.length - 1 ? 4 : 2.2} fill={color}><title>{p.x}: {fmt(p.y)}{unit}</title></circle>)}
      <text x={L} y={H - 6} fontSize="10" fill="currentColor" opacity="0.6">{short(points[0].x, 12)}</text>
      <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.6">{short(points[points.length - 1].x, 12)}</text>
    </svg>
  );
};

// ---- bars (also used as a histogram: pass bins as bars with a small gap)
export interface Bar { label: string; value: number; color?: string }
export const BarChart: React.FC<{ bars: Bar[]; height?: number; color?: string; label: string; unit?: string; gap?: number; showValues?: boolean }> = ({ bars, height = 170, color = PALETTE[1], label, unit = '', gap = 6, showValues = true }) => {
  if (!bars.length || bars.every((b) => !b.value)) return <Empty text={'No ' + label.toLowerCase() + ' yet'} height={height} />;
  const W = 340, H = height, L = 8, R = 8, T = 18, B = 26;
  const top = nice(Math.max(...bars.map((b) => b.value)));
  const bw = (W - L - R - gap * (bars.length - 1)) / bars.length;
  const tall = bars.reduce((a, b) => (b.value > a.value ? b : a), bars[0]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label}: the most is ${tall.label} with ${fmt(tall.value)}${unit}`} style={{ display: 'block' }}>
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="currentColor" strokeOpacity="0.2" />
      {bars.map((b, i) => {
        const h = Math.max(b.value > 0 ? 2 : 0, (b.value / top) * (H - T - B));
        const x = L + i * (bw + gap);
        return (
          <g key={i}>
            <rect x={x} y={H - B - h} width={bw} height={h} rx={Math.min(5, bw / 3)} fill={b.color || color}><title>{b.label}: {fmt(b.value)}{unit}</title></rect>
            {showValues && bars.length <= 12 && b.value > 0 && <text x={x + bw / 2} y={H - B - h - 4} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.8">{fmt(b.value)}</text>}
            {(bars.length <= 10 || i % Math.ceil(bars.length / 8) === 0) && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="9.5" fill="currentColor" opacity="0.65">{short(b.label, bars.length > 8 ? 6 : 9)}</text>}
          </g>
        );
      })}
    </svg>
  );
};

// ---- a pie (donut) with a legend
export const Donut: React.FC<{ slices: Bar[]; size?: number; label: string; unit?: string; centre?: string }> = ({ slices, size = 150, label, unit = '', centre }) => {
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((a, s) => a + s.value, 0);
  if (!total) return <Empty text={'No ' + label.toLowerCase() + ' yet'} height={size} />;
  const r = 52, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={`${label}: ${data.map((s) => `${s.label} ${Math.round((s.value / total) * 100)} percent`).join(', ')}`} style={{ flex: 'none' }}>
        <g transform="rotate(-90 70 70)">
          {data.map((s, i) => {
            const len = (s.value / total) * C;
            const el = <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth="22" strokeDasharray={`${Math.max(0, len - (data.length > 1 ? 1.5 : 0))} ${C}`} strokeDashoffset={-acc}><title>{s.label}: {fmt(s.value)}{unit}</title></circle>;
            acc += len;
            return el;
          })}
        </g>
        <text x="70" y="68" textAnchor="middle" fontSize={bigText(centre ?? fmt(total))} fontWeight="800" fill="currentColor">{centre ?? fmt(total)}</text>
        <text x="70" y="84" textAnchor="middle" fontSize="9.5" fill="currentColor" opacity="0.65">{unit.trim() || 'total'}</text>
      </svg>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 5, minWidth: 150, flex: '1 1 160px' }}>
        {data.map((s, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minWidth: 0 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: s.color || PALETTE[i % PALETTE.length], flex: 'none' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.label}</span>
            <b style={{ flex: 'none' }}>{fmt(s.value)}{unit} <span style={{ opacity: 0.55, fontWeight: 600 }}>{Math.round((s.value / total) * 100)}%</span></b>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---- a number with a caption (used above the charts)
export const Stat: React.FC<{ value: string | number; label: string; hint?: string; tone?: string }> = ({ value, label, hint, tone }) => (
  <div style={{ minWidth: 0 }}>
    <p style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: tone }}>{value}</p>
    <p style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{label}</p>
    {hint && <p style={{ fontSize: 11, opacity: 0.5, marginTop: 1 }}>{hint}</p>}
  </div>
);

// a day written as YYYY-MM-DD, as "14 Oct"
export const dayLabel = (ymd: string): string => {
  const d = new Date(String(ymd).slice(0, 10) + 'T12:00:00Z');
  return isNaN(d.getTime()) ? String(ymd) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

// a short label under each bar of a day-by-day chart: the date, with the month on the first bar and on the 1st of a month ("14 Sep", 15, 16 ... 1 Oct, 2, 3)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayTick = (ymd: string, i: number): string => {
  const day = Number(String(ymd).slice(8, 10)), mon = MON[Number(String(ymd).slice(5, 7)) - 1];
  if (!day || !mon) return String(ymd);
  return i === 0 || day === 1 ? `${day} ${mon}` : String(day);
};
