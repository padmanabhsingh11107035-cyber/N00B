import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, KeyRound, Lock, MapPin, Plus, Smartphone } from 'lucide-react';
import type { FamilyRoom } from '../../family/api';
import type { LatLng } from '../../family/geo';
import { MapCanvas, type MapApi } from './MapCanvas';
import { Switch } from './parts';

// The first page: the turning earth on top (about 35% of the page), then the two buttons, then the rooms the person is already in (tap one: no code to type again) and the one switch
// "Share my location" (remembered: the location is asked once and never again until the person switches it off).
interface Props {
  rooms: FamilyRoom[];
  lastId: string;
  place: LatLng | null;
  demo: boolean;
  onCreate: () => void;
  onJoin: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
  shareAll: boolean;
  onShareAll: (on: boolean) => void;
  /** the Android app can keep sharing while it is closed */
  bgSupported: boolean;
  bgOn: boolean;
  onBg: (on: boolean) => void;
}
export const Gate: React.FC<Props> = ({ rooms, lastId, place, demo, onCreate, onJoin, onOpen, onBack, shareAll, onShareAll, bgSupported, bgOn, onBg }) => {
  const map = useRef<MapApi | null>(null);
  const [broken, setBroken] = useState(false);
  const [ready, setReady] = useState(false);
  // once the person has allowed the location the earth flies in to where they are
  useEffect(() => { if (place && ready) map.current?.fly(place, 10.5); }, [place, ready]);
  const sorted = [...rooms].sort((a, b) => (a.id === lastId ? -1 : b.id === lastId ? 1 : 0));
  return (
    <div className="fm-gate">
      <div className="fm-gate-map">
        {broken ? <div className="fm-globe-fallback" aria-hidden="true" /> : <MapCanvas variant="globe" look="night" pins={[]} apiRef={map} onReady={() => setReady(true)} onFail={() => setBroken(true)} className="fm-fill" />}
        <div className="fm-gate-fade" />
        <button type="button" className="fm-chip fm-gate-back" onClick={onBack}><ArrowLeft size={15} /> NOOB</button>
        {demo && <span className="fm-demo-tag">DEMO</span>}
      </div>
      <div className="fm-gate-body">
        <div className="fm-gate-inner">
          <div className="fm-brand"><span className="fm-brand-dot" />FAMILY MAP</div>
          <h1>Everyone you love, <em>live</em> on one map</h1>
          <p className="fm-lead">Make a private room, share its code, and see each other move in real time. Free, and only for the people in your room.</p>
          <div className="fm-actions">
            <button type="button" className="fm-btn fm-btn--primary" onClick={onCreate} data-testid="family-create"><Plus size={20} strokeWidth={2.6} /> Create room</button>
            <button type="button" className="fm-btn fm-btn--glass" onClick={onJoin} data-testid="family-join"><KeyRound size={19} strokeWidth={2.4} /> Join room</button>
          </div>
          {sorted.length > 0 && (
            <div className="fm-rooms">
              <div className="fm-rooms-title">Your rooms</div>
              {sorted.map((r) => (
                <button type="button" key={r.id} className={`fm-room${r.id === lastId ? ' is-last' : ''}`} onClick={() => onOpen(r.id)} data-testid="family-room">
                  <span className="fm-room-emoji">{r.emoji || '🏠'}</span>
                  <span className="fm-room-main"><b>{r.name}</b><small>{r.memberCount} {r.memberCount === 1 ? 'person' : 'people'}{r.role === 'owner' ? ' · you made it' : ''}{r.locked ? ' · locked' : ''}{!r.sharing ? ' · sharing paused' : ''}</small></span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          )}
          <div className="fm-share" data-testid="family-share-card">
            <div className="fm-line">
              <span className="fm-line-icon"><MapPin size={17} /></span>
              <span><b>Share my location</b><small>{shareAll ? 'On: your rooms see where you are. Allowed once, never asked again.' : 'Off: nobody sees where you are. Turn it on any time.'}</small></span>
              <Switch on={shareAll} onChange={onShareAll} label="Share my location" />
            </div>
            {bgSupported ? (
              <div className="fm-line">
                <span className="fm-line-icon"><Smartphone size={17} /></span>
                <span><b>Keep sharing when NOOB is closed</b><small>{bgOn ? 'A small notification stays on while it works.' : 'Sharing stops when the app is closed.'}</small></span>
                <Switch on={bgOn} onChange={onBg} label="Keep sharing when NOOB is closed" />
              </div>
            ) : (
              <p className="fm-share-note">Sharing works while NOOB is open. To keep sharing when the app is closed, use the NOOB Android app.</p>
            )}
          </div>
          <p className="fm-note"><Lock size={13} /> Places are end-to-end encrypted: only the people in your room can see them, not even NOOB.</p>
        </div>
      </div>
    </div>
  );
};
