import React, { useState } from 'react';
import { Check, Copy, KeyRound, Loader2, MapPin, Share2, ShieldCheck, Sparkles, Users } from 'lucide-react';
import type { FamilyRoom } from '../../family/api';
import { formatCode, isCode, normaliseCode } from '../../family/geo';
import type { Problem } from '../../family/locate';
import { copyText, Modal, shareInvite } from './parts';

// The steps between the first page and a room: ask for the location, make a room (and show its code), join with a code.
const WHY = [
  { icon: <Users size={18} />, text: 'Only the people in your room can see where you are.' },
  { icon: <ShieldCheck size={18} />, text: 'Pause sharing or leave the room whenever you want.' },
  { icon: <MapPin size={18} />, text: 'Only your latest place is kept, never a trail of where you went.' }
];
const PROBLEM_TEXT: Record<Problem, string> = {
  denied: 'Location is blocked for this site. Allow Location for NOOB in your browser or phone settings, then tap Try again.',
  unavailable: 'Your phone could not find its place. Check that Location is on, then try again.',
  timeout: 'Finding your place took too long. Go near a window or outside and try again.',
  unsupported: 'This browser cannot share a place.'
};

export const AllowSheet: React.FC<{ next: 'create' | 'join'; problem: Problem | null; busy: boolean; onAllow: () => void; onWithout: () => void; onClose: () => void }> = ({ next, problem, busy, onAllow, onWithout, onClose }) => (
  <Modal onClose={onClose}>
    <div className="fm-allow">
      <div className="fm-allow-hero" aria-hidden="true"><span className="fm-ring fm-ring--1" /><span className="fm-ring fm-ring--2" /><span className="fm-ring fm-ring--3" /><MapPin size={34} strokeWidth={2.4} /></div>
      <h2>Turn on your location</h2>
      <p className="fm-lead">{next === 'create' ? 'Your room shows everyone on a live map, starting with you.' : 'To appear on the map for your family, NOOB needs to know where you are.'}</p>
      <ul className="fm-why">{WHY.map((w, i) => <li key={i}><span>{w.icon}</span>{w.text}</li>)}</ul>
      {problem && <p className="fm-warn" role="alert">{PROBLEM_TEXT[problem]}</p>}
      <button type="button" className="fm-btn fm-btn--primary" onClick={onAllow} disabled={busy} data-testid="family-allow">
        {busy ? <Loader2 size={19} className="fm-spin" /> : <MapPin size={19} />} {problem ? 'Try again' : 'Allow location'}
      </button>
      {problem && <button type="button" className="fm-btn fm-btn--ghost" onClick={onWithout}>{next === 'join' ? 'Join without sharing for now' : 'Make the room without sharing for now'}</button>}
      {!problem && <button type="button" className="fm-btn fm-btn--ghost" onClick={onClose}>Not now</button>}
    </div>
  </Modal>
);

const EMOJIS = ['🏠', '👨‍👩‍👧‍👦', '💞', '🎒', '🏖️', '🐶', '⭐', '🚗'];

export const CreateSheet: React.FC<{ error: string; busy: boolean; onCreate: (name: string, emoji: string) => void; onClose: () => void }> = ({ error, busy, onCreate, onClose }) => {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  return (
    <Modal title="Create a room" onClose={onClose}>
      <form className="fm-form" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !busy) onCreate(name.trim(), emoji); }}>
        <label className="fm-label" htmlFor="fm-room-name">Room name</label>
        <input id="fm-room-name" className="fm-input" value={name} maxLength={40} placeholder="The Sharma Family" autoComplete="off" onChange={(e) => setName(e.target.value)} data-testid="family-name" />
        <div className="fm-label">Pick a picture</div>
        <div className="fm-emojis" role="radiogroup" aria-label="Room picture">
          {EMOJIS.map((x) => <button type="button" key={x} role="radio" aria-checked={emoji === x} className={`fm-emoji${emoji === x ? ' is-on' : ''}`} onClick={() => setEmoji(x)}>{x}</button>)}
        </div>
        {error && <p className="fm-warn" role="alert">{error}</p>}
        <button type="submit" className="fm-btn fm-btn--primary" disabled={!name.trim() || busy} data-testid="family-make">
          {busy ? <Loader2 size={19} className="fm-spin" /> : <Sparkles size={19} />} Create room
        </button>
      </form>
    </Modal>
  );
};

/** the moment after a room is made: its code, big, ready to send */
export const MadeSheet: React.FC<{ room: FamilyRoom; origin: string; onOpen: () => void }> = ({ room, origin, onOpen }) => {
  const [note, setNote] = useState('');
  const say = (t: string): void => { setNote(t); window.setTimeout(() => setNote(''), 2200); };
  return (
    <Modal onClose={onOpen}>
      <div className="fm-made">
        <div className="fm-made-badge"><Check size={26} strokeWidth={3} /></div>
        <h2>{room.emoji} {room.name} is ready</h2>
        <p className="fm-lead">Send this code to your family. They tap <b>Join room</b> and type it once; after that the room stays on their NOOB.</p>
        <button type="button" className="fm-code" onClick={async () => say((await copyText(formatCode(room.code))) ? 'Code copied' : 'Press and hold to copy')} aria-label={`Room code ${formatCode(room.code)}. Tap to copy`} data-testid="family-code">
          {formatCode(room.code)}
        </button>
        <div className="fm-made-row">
          <button type="button" className="fm-btn fm-btn--glass" onClick={async () => { const r = await shareInvite(room, origin); if (r === 'copied') say('Invitation copied'); }}><Share2 size={18} /> Share invite</button>
          <button type="button" className="fm-btn fm-btn--glass" onClick={async () => say((await copyText(formatCode(room.code))) ? 'Code copied' : 'Press and hold to copy')}><Copy size={18} /> Copy code</button>
        </div>
        <button type="button" className="fm-btn fm-btn--primary" onClick={onOpen} data-testid="family-open-map"><MapPin size={19} /> Open the map</button>
        <p className="fm-note fm-note--tight" aria-live="polite">{note || 'Anyone with this code can join, so send it only to people you trust.'}</p>
      </div>
    </Modal>
  );
};

export const JoinSheet: React.FC<{ initial: string; error: string; busy: boolean; sharing: boolean; onJoin: (code: string) => void; onClose: () => void }> = ({ initial, error, busy, sharing, onJoin, onClose }) => {
  const [code, setCode] = useState(formatCode(initial));
  const ok = isCode(normaliseCode(code));
  return (
    <Modal title="Join a room" onClose={onClose}>
      <form className="fm-form" onSubmit={(e) => { e.preventDefault(); if (ok && !busy) onJoin(normaliseCode(code)); }}>
        <label className="fm-label" htmlFor="fm-room-code">Room code</label>
        <input id="fm-room-code" className="fm-input fm-input--code" value={code} inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
          placeholder="K7QM-2XPD" onChange={(e) => setCode(formatCode(e.target.value))} data-testid="family-code-input" />
        <p className="fm-hint">{sharing ? 'You will appear on the map for the people in this room.' : 'You will only watch for now. You can start sharing from inside the room.'}</p>
        {error && <p className="fm-warn" role="alert">{error}</p>}
        <button type="submit" className="fm-btn fm-btn--primary" disabled={!ok || busy} data-testid="family-join-go">
          {busy ? <Loader2 size={19} className="fm-spin" /> : <KeyRound size={19} />} Join room
        </button>
      </form>
    </Modal>
  );
};
