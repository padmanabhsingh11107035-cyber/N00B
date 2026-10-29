import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Box, Layers, LocateFixed, Lock, LogOut, MapPinOff, MoreVertical, RefreshCw, Route, Share2, Trash2, UserMinus, Users } from 'lucide-react';
import type { FamilyApi, RoomState } from '../../family/api';
import { agoText, distanceM, formatCode, formatDistance, freshness, initialOf, pinHue, speedText, type Fix, type Freshness } from '../../family/geo';
import { autoShareOn, reportInformed, setReportInformed } from '../../family/consent';
import type { Problem } from '../../family/locate';
import { refreshReport, startTracker, tracker } from '../../family/trackerLive';
import type { PinData } from '../../family/markers';
import { keepAwake } from '../../booth/camera';
import { MapCanvas, type MapApi, type MapLook, type TrailData } from './MapCanvas';
import { DayPanel } from './DayPanel';
import { ReportSheet } from './Sheets';
import { Avatar, copyText, Modal, shareInvite, Switch, Toast } from './parts';

// A room: the detailed map full-screen with everybody's picture on their exact place, and a sheet below that lists the people (drag it up to see all of them).
interface Props {
  api: FamilyApi;
  roomId: string;
  place: Fix | null;
  origin: string;
  onBack: () => void;
  onGone: (why: 'left' | 'deleted' | 'removed') => void;
}
interface Prefs { look: MapLook; awake: boolean }
const PREFS_SLOT = 'noob_family_prefs_v1';
const readPrefs = (): Prefs => {
  try { const j = JSON.parse(localStorage.getItem(PREFS_SLOT) || '{}'); return { look: j.look === 'streets' ? 'streets' : 'night', awake: j.awake === true }; } catch { return { look: 'night', awake: false }; }
};
const savePrefs = (p: Prefs): void => { try { localStorage.setItem(PREFS_SLOT, JSON.stringify(p)); } catch { /* a private window keeps nothing */ } };

const PEEK = 184;
const snaps = (): number[] => [PEEK, Math.round(window.innerHeight * 0.52), Math.round(window.innerHeight - 112)];
const POLL_MS = 5000;

export const RoomView: React.FC<Props> = ({ api, roomId, place, origin, onBack, onGone }) => {
  const [data, setData] = useState<RoomState | null>(null);
  const [fix, setFix] = useState<Fix | null>(place);
  const [geo, setGeo] = useState<Problem | null>(null);
  const [now, setNow] = useState(Date.now());
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [tilted, setTilted] = useState(false);
  const [sel, setSel] = useState('');
  const [menu, setMenu] = useState(false);
  const [ask, setAsk] = useState('');
  const [h, setH] = useState(PEEK);
  const [dragging, setDragging] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [broken, setBroken] = useState(false);
  const [toast, setToast] = useState('');
  const [dayFor, setDayFor] = useState('');
  const [askReport, setAskReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const map = useRef<MapApi | null>(null);
  const hRef = useRef(PEEK);
  hRef.current = h;
  const fitted = useRef(false);
  const fixRef = useRef<Fix | null>(place);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const sharing = !!data && data.room.sharing;
  const knownIds = useRef<Set<string> | null>(null);
  const say = useCallback((t: string): void => { setToast(t); window.setTimeout(() => setToast(''), 2400); }, []);

  // ---- the room and its people, every 5 seconds while the page is on the screen
  const load = useCallback(async (): Promise<void> => {
    const r = await api.roomState(roomId);
    if (r.ok) { setData(r); setNow(Date.now()); } else if (r.error === 'not_member') onGone('removed');
  }, [api, roomId, onGone]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    const visible = (): void => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [load]);

  // ---- this phone's own place: the app's one tracker follows the phone and sends the place (locked) to the rooms the person shares with; this screen only shows "you" on the map
  useEffect(() => {
    const off = tracker.subscribe((t) => { if (t.fix) { fixRef.current = t.fix; setFix(t.fix); } setGeo(t.problem); });
    void startTracker(api, true);
    const clock = window.setInterval(() => setNow(Date.now()), 15000);
    return () => {
      off(); window.clearInterval(clock);
      // the tracker goes on by itself when this person keeps sharing while NOOB is open; otherwise it stops with the screen
      void api.userId().then((uid) => { if (!(api.mode === 'live' && uid && autoShareOn(uid))) tracker.stop(); });
    };
  }, [api]);
  // a place goes out at once when sharing comes back on
  useEffect(() => { if (sharing && fixRef.current) void api.pushLocation({ ...fixRef.current, at: Date.now() }); }, [sharing, api]);
  // somebody new in the room
  useEffect(() => {
    if (!data) return;
    const known = knownIds.current;
    if (known) { const fresh = data.members.find((m) => !m.me && !known.has(m.id)); if (fresh) say(`${fresh.name} joined the room`); }
    knownIds.current = new Set(data.members.map((m) => m.id));
  }, [data, say]);
  useEffect(() => (prefs.awake ? keepAwake() : undefined), [prefs.awake]);
  useEffect(() => { if (!ask) return; const t = window.setTimeout(() => setAsk(''), 4000); return () => window.clearTimeout(t); }, [ask]);
  const update = (p: Partial<Prefs>): void => { const next = { ...prefs, ...p }; setPrefs(next); savePrefs(next); };

  // ---- the people, with where they are and how fresh it is
  const rows = useMemo(() => {
    const list = (data?.members ?? []).map((m) => {
      const own = m.me && fix;
      const lat = own ? fix.lat : m.lat, lng = own ? fix.lng : m.lng;
      const st: Freshness = own ? 'live' : freshness(m.updatedAt, now);
      const dist = !m.me && fix && lat != null && lng != null ? distanceM(fix, { lat, lng }) : null;
      let status: string;
      if (!m.sharing) status = m.me ? 'You paused sharing' : 'Paused sharing';
      else if (lat == null || lng == null) status = m.me ? (geo === 'denied' ? 'Location is blocked' : 'Finding your place…') : 'Waiting for a place…';
      else if (st === 'live') status = speedText(own ? fix.speed : m.speed) || 'Live now';
      else status = `Last seen ${agoText(m.updatedAt, now)}`;
      return { m, lat, lng, st, dist, status };
    });
    return list.sort((a, b) => Number(b.m.me) - Number(a.m.me) || (a.dist ?? 1e12) - (b.dist ?? 1e12));
  }, [data, fix, now, geo]);
  const pins = useMemo<PinData[]>(() => rows.flatMap((r) => (r.lat == null || r.lng == null || r.st === 'none' || (!r.m.sharing && !r.m.me)) ? [] : [{
    id: r.m.id, name: r.m.name, avatar: r.m.avatar, lat: r.lat, lng: r.lng, state: r.st, me: r.m.me, moving: ((r.m.me ? fix?.speed : r.m.speed) ?? 0) > 1.5, hue: pinHue(r.m.id), initial: initialOf(r.m.name)
  }]), [rows, fix]);
  const liveCount = rows.filter((r) => r.m.sharing && r.st === 'live').length;
  // the day report of one person: their route on the map, the list in the sheet (everybody else's pin steps aside)
  const dayMember = dayFor ? data?.members.find((m) => m.id === dayFor) ?? null : null;
  const shown = useMemo(() => (dayFor ? pins.filter((p) => p.id === dayFor) : pins), [pins, dayFor]);
  const onTrail = useCallback((t: TrailData | null): void => { map.current?.trail(t); }, []);
  const onFit = useCallback((pts: { lat: number; lng: number }[]): void => { map.current?.fit(pts, hRef.current + 40); }, []);
  const onFly = useCallback((p: { lat: number; lng: number }): void => { map.current?.fly(p, 16); }, []);
  const openDay = (id: string): void => { setDayFor(id); setSel(''); setH((v) => Math.max(v, snaps()[1])); };
  const closeDay = (): void => { setDayFor(''); map.current?.trail(null); map.current?.fit(pins, snaps()[0] + 40); };
  useEffect(() => { if (dayFor && data && !dayMember) setDayFor(''); }, [dayFor, data, dayMember]);

  // the first time the map is ready and the people are known, show all of them
  useEffect(() => {
    if (!mapReady || !data || fitted.current || !pins.length) return;
    fitted.current = true;
    map.current?.fit(pins, snaps()[0] + 40);
  }, [mapReady, data, pins]);

  const room = data?.room;
  const owner = room?.role === 'owner';
  const picked = (id: string): void => {
    setSel((s) => (s === id ? '' : id));
    const r = rows.find((x) => x.m.id === id);
    if (r && r.lat != null && r.lng != null) map.current?.fly({ lat: r.lat, lng: r.lng }, 16);
  };

  // ---- the sheet: a tap on its handle opens / closes it, a drag moves it, it settles on the nearest of three heights
  const down = (e: React.PointerEvent): void => { try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the finger is tracked anyway */ } drag.current = { y: e.clientY, h }; setDragging(true); };
  const move = (e: React.PointerEvent): void => { const d = drag.current; if (d) setH(Math.min(snaps()[2], Math.max(PEEK - 24, d.h + d.y - e.clientY))); };
  const up = (e: React.PointerEvent): void => {
    const d = drag.current; drag.current = null; setDragging(false);
    if (!d) return;
    const s = snaps();
    if (Math.abs(e.clientY - d.y) < 6) { setH(d.h <= s[0] + 4 ? s[1] : s[0]); return; }
    setH(s.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a)));
  };

  const run = async (kind: 'leave' | 'delete' | 'code' | 'remove', userId = ''): Promise<void> => {
    setAsk('');
    if (kind === 'leave') { const r = await api.leaveRoom(roomId); if (r.ok) onGone('left'); else say('Could not leave. Try again.'); }
    else if (kind === 'delete') { const r = await api.deleteRoom(roomId); if (r.ok) onGone('deleted'); else say('Could not delete. Try again.'); }
    else if (kind === 'code') { const r = await api.rotateCode(roomId); if (r.ok) { say('New code ready. The old one stopped working.'); void load(); } else say('Could not make a new code.'); }
    else { const r = await api.removeMember(roomId, userId); if (r.ok) { say('Removed from the room'); setSel(''); void load(); } else say('Could not remove. Try again.'); }
  };
  const lockRoom = async (on: boolean): Promise<void> => {
    setData((d) => (d ? { ...d, room: { ...d.room, locked: on } } : d));
    const r = await api.setLocked(roomId, on);
    if (!r.ok) say('Could not change that. Try again.');
    void load();
  };
  const setSharing = async (on: boolean): Promise<void> => {
    setData((d) => (d ? { ...d, room: { ...d.room, sharing: on } } : d));
    const r = await api.setSharing(roomId, on);
    if (!r.ok) say('Could not change that. Try again.');
    refreshReport();
    void load();
  };
  // "my day report" for all my rooms; the first time it is explained (it shows where a person went, not only where they are)
  const turnReport = async (on: boolean): Promise<void> => {
    setBusy(true);
    const r = await api.setReportAll(on);
    setBusy(false); setAskReport(false);
    if (!r.ok) { say('Could not change that. Try again.'); return; }
    if (on) setReportInformed();
    refreshReport();
    void load();
    say(on ? 'Day report is on. It is deleted every night at 12.' : 'Day report is off. What was recorded today is deleted.');
  };
  const switchReport = (on: boolean): void => {
    if (!on) { void turnReport(false); return; }
    if (!sharing) { say('Turn on Share my location first.'); return; }
    if (reportInformed()) void turnReport(true); else setAskReport(true);
  };
  const invite = async (): Promise<void> => { if (!room) return; const r = await shareInvite(room, origin); if (r === 'copied') say('Invitation copied'); };

  return (
    <div className="fm-room-screen" style={{ ['--fm-sheet-h' as string]: `${h}px` }}>
      {broken ? <div className="fm-map-broken"><MapPinOff size={30} /><p>This phone cannot show the map. The list below still works.</p></div>
        : <MapCanvas variant="room" look={prefs.look} pins={shown} apiRef={map} onStay={() => undefined} onPin={(id) => { setSel(id); setH((v) => Math.max(v, snaps()[1])); const r = rows.find((x) => x.m.id === id); if (r && r.lat != null && r.lng != null) map.current?.fly({ lat: r.lat, lng: r.lng }, 16); }}
            onReady={() => setMapReady(true)} onFail={() => setBroken(true)} className="fm-fill" />}

      <div className="fm-top">
        <button type="button" className="fm-round" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="fm-top-title"><b>{room ? `${room.emoji || '🏠'} ${room.name}` : 'Loading…'}</b><small>{room ? `${liveCount} live · ${room.memberCount} ${room.memberCount === 1 ? 'person' : 'people'}` : ' '}</small></div>
        <button type="button" className="fm-round" onClick={() => setMenu(true)} aria-label="Room menu" data-testid="family-menu"><MoreVertical size={20} /></button>
      </div>

      {geo === 'denied' && <div className="fm-banner fm-banner--warn" role="alert"><MapPinOff size={16} /> Location is blocked, so your family cannot see you. Allow it in your browser settings.</div>}
      {data && !sharing && geo !== 'denied' && <div className="fm-banner" role="status"><MapPinOff size={16} /> You paused sharing. Nobody sees where you are. <button type="button" onClick={() => void setSharing(true)}>Resume</button></div>}

      <div className="fm-fabs" style={{ bottom: h + 14 }}>
        <button type="button" className="fm-round" aria-label="Show everyone" onClick={() => map.current?.fit(pins, h + 40)}><Users size={19} /></button>
        <button type="button" className="fm-round" aria-label="Show me" onClick={() => { const f = fixRef.current; if (f) map.current?.fly(f, 16); else say('Still finding your place…'); }}><LocateFixed size={19} /></button>
        <button type="button" className={`fm-round${prefs.look === 'streets' ? ' is-on' : ''}`} aria-label="Change map style" onClick={() => update({ look: prefs.look === 'night' ? 'streets' : 'night' })}><Layers size={19} /></button>
        <button type="button" className={`fm-round${tilted ? ' is-on' : ''}`} aria-label="3D view" onClick={() => { map.current?.tilt(!tilted); setTilted(!tilted); }}><Box size={19} /></button>
      </div>

      <div className={`fm-sheet${dragging ? ' is-dragging' : ''}`} style={{ height: h }}>
        <div className="fm-sheet-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><span /></div>
        {!dayFor && <div className="fm-sheet-head">
          <div className="fm-avstack">{rows.slice(0, 4).map((r) => <Avatar key={r.m.id} id={r.m.id} name={r.m.name} src={r.m.avatar} size={36} state={r.m.sharing ? r.st : 'paused'} />)}</div>
          <div className="fm-sheet-count"><b>{liveCount} live now</b><small>{data ? `${rows.length} in this room` : 'Loading…'}</small></div>
          <button type="button" className="fm-chip fm-chip--solid" onClick={() => void invite()}><Share2 size={14} /> Invite</button>
        </div>}
        <div className="fm-sheet-list">
          {dayFor && dayMember && <DayPanel key={dayFor} api={api} roomId={roomId} member={dayMember} onBack={closeDay} onTrail={onTrail} onFit={onFit} onFly={onFly} onTurnOn={() => switchReport(true)} />}
          {!dayFor && rows.map((r) => (
            <div key={r.m.id} className={`fm-person${sel === r.m.id ? ' is-sel' : ''}`}>
              <div className="fm-person-row">
                <button type="button" className="fm-person-main" onClick={() => picked(r.m.id)} data-testid="family-person">
                  <Avatar id={r.m.id} name={r.m.name} src={r.m.avatar} size={46} state={r.m.sharing ? r.st : 'paused'} />
                  <span className="fm-person-text"><b>{r.m.me ? 'You' : r.m.name}{r.m.role === 'owner' ? <i>Owner</i> : null}</b><small className={r.st === 'live' && r.m.sharing ? 'is-live' : ''}>{r.status}</small></span>
                  <span className="fm-person-dist">{r.dist != null ? formatDistance(r.dist) : ''}</span>
                </button>
                {r.m.report && <button type="button" className="fm-day-btn" onClick={() => openDay(r.m.id)} aria-label={`${r.m.me ? 'Your' : `${r.m.name}'s`} day: where ${r.m.me ? 'you' : 'they'} went today`} title="Where they went today" data-testid="family-day-open"><Route size={18} /></button>}
              </div>
              {sel === r.m.id && !r.m.me && owner && (
                <div className="fm-person-actions">
                  <button type="button" className="fm-small fm-small--danger" onClick={() => (ask === `rm:${r.m.id}` ? void run('remove', r.m.id) : setAsk(`rm:${r.m.id}`))}>
                    <UserMinus size={15} /> {ask === `rm:${r.m.id}` ? 'Tap again to remove' : `Remove ${r.m.name}`}
                  </button>
                </div>
              )}
            </div>
          ))}
          {!dayFor && !data && <div className="fm-skeleton" aria-hidden="true"><i /><i /><i /></div>}
        </div>
      </div>

      {menu && room && (
        <Modal title={`${room.emoji || '🏠'} ${room.name}`} onClose={() => { setMenu(false); setAsk(''); }}>
          <div className="fm-menu">
            <div className="fm-code-card">
              <small>Room code</small>
              <button type="button" className="fm-code fm-code--sm" onClick={async () => say((await copyText(formatCode(room.code))) ? 'Code copied' : 'Press and hold to copy')}>{formatCode(room.code)}</button>
              <button type="button" className="fm-btn fm-btn--glass" onClick={() => void invite()}><Share2 size={17} /> Share invite</button>
              <small className="fm-enc"><Lock size={12} /> Places in this room are end-to-end encrypted</small>
            </div>
            <div className="fm-line"><span><b>Share my location</b><small>{sharing ? 'People in this room see you on the map.' : 'Paused: nobody in this room sees you.'}</small></span><Switch on={sharing} onChange={(v) => void setSharing(v)} label="Share my location" /></div>
            <div className="fm-line" data-testid="family-report-menu"><span><b>My day report</b><small>{room.report && sharing ? 'Your rooms see where you went today. Deleted every night at 12.' : 'Off. Show your rooms the places you went today. Deleted every night at 12.'}</small></span><Switch on={room.report && sharing} onChange={switchReport} label="My day report" /></div>
            <div className="fm-line"><span><b>Keep screen on</b><small>A website can only send your place while this page is open.</small></span><Switch on={prefs.awake} onChange={(v) => update({ awake: v })} label="Keep screen on" /></div>
            {owner && <div className="fm-line"><span><b>Lock the room</b><small>{room.locked ? 'Locked: nobody new can join, even with the code.' : 'Lock it once everybody has joined, so the code cannot be used.'}</small></span><Switch on={room.locked} onChange={(v) => void lockRoom(v)} label="Lock the room" /></div>}
            {owner && <button type="button" className="fm-menu-btn" onClick={() => (ask === 'code' ? void run('code') : setAsk('code'))}><RefreshCw size={17} /> {ask === 'code' ? 'Tap again: old code stops working' : 'Make a new code'}</button>}
            <button type="button" className="fm-menu-btn fm-menu-btn--danger" onClick={() => (ask === 'leave' ? void run('leave') : setAsk('leave'))} data-testid="family-leave"><LogOut size={17} /> {ask === 'leave' ? 'Tap again to leave' : 'Leave room'}</button>
            {owner && <button type="button" className="fm-menu-btn fm-menu-btn--danger" onClick={() => (ask === 'delete' ? void run('delete') : setAsk('delete'))}><Trash2 size={17} /> {ask === 'delete' ? 'Tap again to delete for everyone' : 'Delete room for everyone'}</button>}
          </div>
        </Modal>
      )}
      {askReport && <ReportSheet busy={busy} onTurnOn={() => void turnReport(true)} onClose={() => setAskReport(false)} />}
      <Toast text={toast} />
    </div>
  );
};
