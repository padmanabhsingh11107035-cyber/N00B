import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, KeyRound, Lock, Plus } from 'lucide-react';
import type { FamilyRoom } from '../../family/api';
import type { LatLng } from '../../family/geo';
import { MapCanvas, type MapApi } from './MapCanvas';

// The first page: the turning earth on top (about 35% of the page), then the two buttons, then the rooms the person is already in (tap one: no code to type again).
interface Props {
  rooms: FamilyRoom[];
  lastId: string;
  place: LatLng | null;
  demo: boolean;
  onCreate: () => void;
  onJoin: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
}
export const Gate: React.FC<Props> = ({ rooms, lastId, place, demo, onCreate, onJoin, onOpen, onBack }) => {
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
                  <span className="fm-room-main"><b>{r.name}</b><small>{r.memberCount} {r.memberCount === 1 ? 'person' : 'people'}{r.role === 'owner' ? ' · you made it' : ''}{!r.sharing ? ' · sharing paused' : ''}</small></span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          )}
          <p className="fm-note"><Lock size={13} /> Your place is shown only to people in your room. Pause or leave any time.</p>
        </div>
      </div>
    </div>
  );
};
