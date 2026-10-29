import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CloudOff, LogIn, RefreshCw, Sparkles, Wrench } from 'lucide-react';
import './family.css';
import { ERROR_TEXT, FamilyOffline, type FamilyApi, type FamilyRoom } from '../../family/api';
import type { Fix, LatLng } from '../../family/geo';
import { askForLocation, permissionState, type Problem } from '../../family/locate';
import { Gate } from './Gate';
import { RoomView } from './RoomView';
import { AllowSheet, CreateSheet, JoinSheet, MadeSheet } from './Sheets';
import { Notice, Toast } from './parts';

// NOOB Family Map: a room for a family (or friends) where everybody sees everybody's live place on a map. This file is the order of the screens:
//   first page (earth + Create room / Join room + the rooms you are in) -> allow the location -> make a room (its code) or join one (type its code) -> the room's map.
// A room stays on the person's account: opening the page later shows it in "Your rooms" and one tap enters it, no code to type again.
type Step =
  | { s: 'boot' }
  | { s: 'offline'; kind: 'down' | 'setup' }
  | { s: 'login' }
  | { s: 'gate' }
  | { s: 'allow'; next: 'create' | 'join' }
  | { s: 'create' }
  | { s: 'made' }
  | { s: 'join' }
  | { s: 'room'; id: string };

const LAST_ROOM_SLOT = 'noob_family_last_v1';
const readLast = (): string => { try { return localStorage.getItem(LAST_ROOM_SLOT) || ''; } catch { return ''; } };
const writeLast = (id: string): void => { try { localStorage.setItem(LAST_ROOM_SLOT, id); } catch { /* a private window keeps nothing */ } };

export interface FamilyMapProps {
  api: FamilyApi;
  onClose: () => void;
  /** the address of the website, for the invitation link */
  origin: string;
  /** the code of an invitation link: opens the Join screen with it filled in */
  startCode?: string;
  /** shown on the "can not be reached" screen: a way to see the made-up demo */
  onDemo?: () => void;
  /** the page was opened without a login (the standalone page only) */
  loggedOut?: boolean;
}

export const FamilyMap: React.FC<FamilyMapProps> = ({ api, onClose, origin, startCode = '', onDemo, loggedOut = false }) => {
  const [step, setStep] = useState<Step>({ s: 'boot' });
  const [rooms, setRooms] = useState<FamilyRoom[]>([]);
  const [lastId, setLastId] = useState(readLast);
  const [place, setPlace] = useState<Fix | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState<FamilyRoom | null>(null);
  const [toast, setToast] = useState('');
  const invited = useRef(startCode);
  const say = useCallback((t: string): void => { setToast(t); window.setTimeout(() => setToast(''), 2800); }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const list = await api.myRooms();
      setRooms(list);
      setStep((s) => (s.s === 'boot' || s.s === 'offline' ? { s: 'gate' } : s));
      return true;
    } catch (e) {
      const kind = e instanceof FamilyOffline ? e.kind : 'down';
      setStep(kind === 'login' ? { s: 'login' } : { s: 'offline', kind });
      return false;
    }
  }, [api]);

  useEffect(() => {
    if (loggedOut) return;
    void refresh().then((ok) => { if (ok && invited.current) { invited.current = ''; void begin('join'); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedOut, refresh]);

  const found = (fix: Fix): void => { setPlace(fix); (api as FamilyApi & { setAnchor?: (p: LatLng) => void }).setAnchor?.(fix); };

  // Create / Join: if the browser already has the location permission nothing is asked; otherwise the "Turn on your location" step comes first
  const begin = async (next: 'create' | 'join'): Promise<void> => {
    setError(''); setProblem(null); setShare(true);
    if ((await permissionState()) === 'granted') {
      const a = await askForLocation();
      if (a.ok) found(a.fix); else setShare(false);
      setStep({ s: next });
      return;
    }
    setStep({ s: 'allow', next });
  };
  const allow = async (next: 'create' | 'join'): Promise<void> => {
    setBusy(true);
    const a = await askForLocation();
    setBusy(false);
    if ('fix' in a) { found(a.fix); setProblem(null); setShare(true); setStep({ s: next }); } else setProblem(a.reason);
  };
  const without = (next: 'create' | 'join'): void => { setShare(false); setProblem(null); setStep({ s: next }); };

  const open = (id: string): void => { writeLast(id); setLastId(id); setStep({ s: 'room', id }); };
  const create = async (name: string, emoji: string): Promise<void> => {
    setBusy(true); setError('');
    const r = await api.createRoom(name, emoji, share);
    setBusy(false);
    if (r.ok) { setMade(r.room); writeLast(r.room.id); setLastId(r.room.id); await refresh(); setStep({ s: 'made' }); } else setError(ERROR_TEXT[r.error]);
  };
  const join = async (code: string): Promise<void> => {
    setBusy(true); setError('');
    const r = await api.joinRoom(code, share);
    setBusy(false);
    if (r.ok) { await refresh(); open(r.room.id); } else setError(ERROR_TEXT[r.error]);
  };
  const gone = (why: 'left' | 'deleted' | 'removed'): void => {
    if (readLast()) writeLast('');
    setLastId('');
    say(why === 'left' ? 'You left the room' : why === 'deleted' ? 'The room was deleted' : 'You are not in that room any more');
    setStep({ s: 'gate' });
    void refresh();
  };

  const demo = api.mode === 'demo';
  let body: React.ReactNode;
  if (loggedOut || step.s === 'login') {
    body = (
      <Notice icon={<LogIn size={30} />} title="Log in to use Family Map" text="Family Map is for NOOB members, so each person in a room is a real account. Log in to NOOB, then open Family Map again.">
        <button type="button" className="fm-btn fm-btn--primary" onClick={onClose}><LogIn size={19} /> Open NOOB</button>
        {onDemo && <button type="button" className="fm-btn fm-btn--glass" onClick={onDemo}><Sparkles size={19} /> See a demo first</button>}
      </Notice>
    );
  } else if (step.s === 'boot') {
    body = <div className="fm-boot" role="status"><span className="fm-spinner" /><p>Opening Family Map…</p></div>;
  } else if (step.s === 'offline') {
    body = step.kind === 'setup' ? (
      <Notice icon={<Wrench size={30} />} title="Family Map is being set up" text="This part of NOOB is not switched on yet. Please check back in a little while.">
        <button type="button" className="fm-btn fm-btn--primary" onClick={() => void refresh()}><RefreshCw size={19} /> Try again</button>
        <button type="button" className="fm-btn fm-btn--ghost" onClick={onClose}>Back to NOOB</button>
      </Notice>
    ) : (
      <Notice icon={<CloudOff size={30} />} title="NOOB cannot be reached" text="Family Map needs the NOOB servers to know who is in your room. Check your connection, or try again in a few minutes.">
        <button type="button" className="fm-btn fm-btn--primary" onClick={() => void refresh()}><RefreshCw size={19} /> Try again</button>
        {onDemo && <button type="button" className="fm-btn fm-btn--glass" onClick={onDemo}><Sparkles size={19} /> See a demo instead</button>}
        <button type="button" className="fm-btn fm-btn--ghost" onClick={onClose}>Back to NOOB</button>
      </Notice>
    );
  } else if (step.s === 'room') {
    body = <RoomView api={api} roomId={step.id} place={place} origin={origin} onBack={() => { setStep({ s: 'gate' }); void refresh(); }} onGone={gone} />;
  } else {
    body = (
      <>
        <Gate rooms={rooms} lastId={lastId} place={place} demo={demo} onCreate={() => void begin('create')} onJoin={() => void begin('join')} onOpen={open} onBack={onClose} />
        {step.s === 'allow' && <AllowSheet next={step.next} problem={problem} busy={busy} onAllow={() => void allow(step.next)} onWithout={() => without(step.next)} onClose={() => setStep({ s: 'gate' })} />}
        {step.s === 'create' && <CreateSheet error={error} busy={busy} onCreate={(n, e) => void create(n, e)} onClose={() => setStep({ s: 'gate' })} />}
        {step.s === 'join' && <JoinSheet initial={startCode} error={error} busy={busy} sharing={share} onJoin={(c) => void join(c)} onClose={() => setStep({ s: 'gate' })} />}
        {step.s === 'made' && made && <MadeSheet room={made} origin={origin} onOpen={() => open(made.id)} />}
      </>
    );
  }
  return <div className="fm-root force-dark" data-testid="family-map">{body}<Toast text={toast} /></div>;
};

export default FamilyMap;
