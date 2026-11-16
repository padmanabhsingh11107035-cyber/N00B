import React, { useEffect, useState } from 'react';
import { ArrowLeft, Home, VenetianMask } from 'lucide-react';
import type { User } from '../../types';
import { fetchAnonMessage, type AnonMessage } from '../../services/api';
import { AnonCard, loadStats, useCanManagePolls } from '../Feed/HomeMix';
import '../Feed/home.css';
import './fun.css';

// One anonymous thought on its own page (/thought/<id>): what the Share button of a thought sends. Anyone can read it; liking, commenting and reporting ask them to log in.
// It is still only {id, body, pictures, time}: the database never says who wrote it.
export const ThoughtPage: React.FC<{ currentUser: User | null; id: string; onBack: () => void; onHome: () => void }> = ({ currentUser, id, onBack, onHome }) => {
  const [m, setM] = useState<AnonMessage | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'gone' | 'error'>('loading');
  const canManage = useCanManagePolls(!!currentUser);
  useEffect(() => {
    let alive = true;
    setState('loading');
    void fetchAnonMessage(id)
      .then((x) => { if (!alive) return; if (x) { setM(x); setState('ok'); loadStats('anon', [id]); } else setState('gone'); })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [id]);
  return (
    <div className="fx-root fixed inset-0 edge-own z-[96] overflow-y-auto overscroll-contain hm-thought" data-fx="thought" data-noob-keep="1" role="region" aria-label="Anonymous thought" data-testid="thought-page">
      <div className="fx-bar">
        <div className="fx-wrap">
          <div className="fx-bar-row">
            <button type="button" onClick={onBack} aria-label="Go back" className="fx-ib"><ArrowLeft className="w-5 h-5" aria-hidden="true" /></button>
            <h1 className="fx-bar-title">Anonymous thought</h1>
            <button type="button" onClick={onHome} aria-label="Back to the Home page" title="Home" className="fx-ib"><Home className="w-5 h-5" aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      <div className="fx-wrap">
        <div className="fx-body" style={{ paddingTop: 16 }}>
          {state === 'loading' && <p className="hm-note" role="status">Loading…</p>}
          {state === 'error' && <p className="hm-note" role="alert">Could not load it. Please check your connection and try again.</p>}
          {state === 'gone' && (
            <div className="hm-card" data-testid="thought-gone" style={{ margin: 0, textAlign: 'center' }}>
              <VenetianMask className="w-8 h-8 mx-auto" aria-hidden="true" style={{ opacity: .6 }} />
              <p className="hm-body" style={{ marginTop: 10 }}>This thought is no longer there.</p>
              <button type="button" onClick={onHome} className="hm-vote">Go to the Home page</button>
            </div>
          )}
          {state === 'ok' && m && <div style={{ margin: '0 -10px' }}><AnonCard m={m} currentUser={currentUser} canManage={canManage} onRemoved={() => setState('gone')} /></div>}
        </div>
      </div>
    </div>
  );
};

export default ThoughtPage;
