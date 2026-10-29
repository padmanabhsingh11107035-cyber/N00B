import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bike, Car, Footprints, Lock, RefreshCw, Route, WifiOff } from 'lucide-react';
import type { DaySource, FamilyApi, FamilyMember } from '../../family/api';
import { formatDistance, pinHue, type LatLng } from '../../family/geo';
import { assembleDay, dayKey, fmtClock, fmtDayTitle, fmtDuration, localZone, MODE_TEXT, type DayItem, type Mode } from '../../family/timeline';
import type { TrailData } from './MapCanvas';
import { Avatar } from './parts';

// The DAY REPORT of one person: where they went today. A list of the places they stayed at and the trips between them (like Google's Timeline), with the same thing drawn on the map above.
// It is opened from a person's row in the room. Everything shown is of TODAY in that person's own time zone: at their 00:00 the list empties by itself and a new day begins.
interface Props {
  api: FamilyApi;
  roomId: string;
  member: FamilyMember;
  onBack: () => void;
  /** draw (or clear) the route on the map */
  onTrail: (t: TrailData | null) => void;
  onFit: (points: LatLng[]) => void;
  onFly: (p: LatLng) => void;
  /** my own report is off: switch it on */
  onTurnOn: () => void;
}
const REFRESH_MS = 30000;
const MODE_ICON = { w: Footprints, c: Bike, d: Car } as const;
const length = (m: number): string => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

export const DayPanel: React.FC<Props> = ({ api, roomId, member, onBack, onTrail, onFit, onFly, onTurnOn }) => {
  const [src, setSrc] = useState<DaySource | null>(null);
  const [bad, setBad] = useState(false);
  const [sel, setSel] = useState('');
  const [tick, setTick] = useState(0);
  const got = useRef(0);
  const fitted = useRef(false);
  const hue = pinHue(member.id);

  const load = useCallback(async (): Promise<void> => {
    const r = await api.getDay(roomId, member.id);
    if (r.ok) { got.current = Date.now(); setSrc(r.day); setBad(false); } else setBad(true);
  }, [api, roomId, member.id]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, REFRESH_MS);
    const clock = window.setInterval(() => setTick((n) => n + 1), 15000);
    const seen = (): void => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', seen);
    return () => { window.clearInterval(timer); window.clearInterval(clock); document.removeEventListener('visibilitychange', seen); };
  }, [load]);

  const tz = src?.tz || localZone();
  const nowMs = src ? src.now + (Date.now() - got.current) : Date.now();
  const today = dayKey(nowMs, tz);
  // the person's day is over (their clock passed 00:00): ask for the new one at once; nothing of the old day is shown meanwhile
  useEffect(() => { if (src && src.on && src.day && src.day !== today) void load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = useMemo(() => (src && src.on ? assembleDay(src.segs, { day: today, tz, now: nowMs, updatedAt: src.updatedAt }) : null), [src, tick, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // the route on the map
  useEffect(() => {
    if (!view) { onTrail(null); return; }
    const trips = view.items.filter((i) => i.kind === 'trip' && i.path).map((i) => ({ id: i.id, path: i.path as LatLng[], mode: i.m as Mode }));
    const stays = view.items.filter((i) => i.kind === 'stay').map((i) => ({ id: i.id, at: { lat: i.lat as number, lng: i.lng as number }, n: i.place as number, ongoing: i.ongoing, r: i.r ?? 0 }));
    onTrail({ hue, trips, stays, selected: sel });
    const all = [...trips.flatMap((t) => t.path), ...stays.map((s) => s.at)];
    if (all.length && !fitted.current) { fitted.current = true; onFit(all); }
  }, [view, sel, hue, onTrail, onFit]);
  useEffect(() => () => onTrail(null), [onTrail]);

  const pick = (it: DayItem): void => {
    setSel(it.id);
    if (it.kind === 'stay') onFly({ lat: it.lat as number, lng: it.lng as number });
    else if (it.path && it.path.length) onFit(it.path);
  };
  const clock = (ms: number): string => fmtClock(ms, tz);
  const range = (it: DayItem): string => `${clock(it.a)} – ${it.ongoing ? 'now' : clock(it.b)} · ${fmtDuration((it.ongoing ? nowMs : it.b) - it.a)}`;
  const who = member.me ? 'Your day' : `${member.name}'s day`;

  let body: React.ReactNode;
  if (bad && !src) {
    body = <div className="fm-day-empty"><WifiOff size={26} /><p>Could not load the day report. Check your connection.</p><button type="button" className="fm-small" onClick={() => void load()}><RefreshCw size={15} /> Try again</button></div>;
  } else if (!src) {
    body = <div className="fm-skeleton" aria-hidden="true"><i /><i /><i /></div>;
  } else if (!src.on) {
    body = member.me ? (
      <div className="fm-day-empty"><Route size={28} /><p>Your day report is off, so your rooms do not see where you went. Turn it on to share the places you stay at and your trips, today only. It is deleted every night at 12.</p>
        <button type="button" className="fm-btn fm-btn--primary" onClick={onTurnOn}><Route size={19} /> Turn on my day report</button></div>
    ) : (
      <div className="fm-day-empty"><Route size={28} /><p>{member.name} has not turned on the day report, so there is nothing to show.</p></div>
    );
  } else if (!view || !view.items.length) {
    body = (
      <div className="fm-day-empty"><Route size={28} />
        <p>{member.me ? 'Nothing recorded yet today.' : `Nothing from ${member.name} yet today.`} A place shows up after about 5 minutes in one spot, a trip once it is over a minute long.</p>
        {member.me && <p className="fm-day-hint">A website only records while NOOB is open on your phone. The NOOB Android app records all day, also when it is closed.</p>}
      </div>
    );
  } else {
    body = (
      <>
        <div className="fm-day-stats">
          <div className="fm-stat"><b>{length(view.stats.distanceM)}</b><small>Travelled</small></div>
          <div className="fm-stat"><b>{view.stats.places}</b><small>{view.stats.places === 1 ? 'Place' : 'Places'}</small></div>
          <div className="fm-stat"><b>{view.stats.movingMs >= 60000 ? fmtDuration(view.stats.movingMs) : '0 min'}</b><small>On the move</small></div>
        </div>
        <ul className="fm-rail" style={{ ['--hue' as string]: hue }}>
          {view.items.map((it) => {
            if (it.kind === 'gap') {
              return (
                <li key={it.id} className="fm-rail-gap" data-testid="family-day-gap">
                  <span className="fm-rail-ic"><WifiOff size={14} /></span>
                  <span className="fm-rail-text"><b>No location</b><small>{clock(it.a)} – {it.ongoing ? 'now' : clock(it.b)} · the phone was offline or the app was closed</small></span>
                </li>
              );
            }
            const Icon = it.kind === 'trip' ? MODE_ICON[it.m as Mode] : null;
            return (
              <li key={it.id}>
                <button type="button" className={`fm-rail-item${sel === it.id ? ' is-sel' : ''}${it.kind === 'stay' ? ' is-stay' : ''}${it.ongoing ? ' is-now' : ''}`} onClick={() => pick(it)} data-testid="family-day-item">
                  <span className="fm-rail-ic">{Icon ? <Icon size={15} /> : it.place}</span>
                  <span className="fm-rail-text">
                    <b>{it.kind === 'stay' ? `Place ${it.place}${it.ongoing ? ' · here now' : ''}` : `${MODE_TEXT[it.m as Mode]} · ${formatDistance(it.d as number)}`}</b>
                    <small>{range(it)}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {view.from != null && view.from > view.start + 15 * 60000 && <p className="fm-day-hint">The report of this day began at {clock(view.from)}.</p>}
      </>
    );
  }

  return (
    <div className="fm-day" data-testid="family-day">
      <div className="fm-day-head">
        <button type="button" className="fm-round fm-round--sm" onClick={onBack} aria-label="Back to the people"><ArrowLeft size={18} /></button>
        <Avatar id={member.id} name={member.name} src={member.avatar} size={40} state="live" />
        <div className="fm-day-title"><b>{who}</b><small>{fmtDayTitle(nowMs, tz)}</small></div>
      </div>
      {body}
      <p className="fm-day-note"><Lock size={12} /> End-to-end encrypted. Deleted every night at 12 ({tz.replace(/_/g, ' ')}), then a new day begins.</p>
    </div>
  );
};

export default DayPanel;
