import React from 'react';
import type { StudyGate } from '../../../services/studyApi';
import { leaveStudy } from '../studyStore';
import { Btn } from '../ui';

// What a student sees while the administrator has NOOB STUDY on "coming soon" (or off): the logo, a kind message, and the way back. Nothing else is reachable:
// the database refuses every study request until it is opened.
const ComingSoon: React.FC<{ gate: Pick<StudyGate, 'mode' | 'message'> }> = ({ gate }) => {
  const off = gate.mode === 'off';
  return (
    <div className="st-scroll" style={{ display: 'grid', placeItems: 'center', background: '#000' }}>
      <div style={{ textAlign: 'center', padding: 28, maxWidth: 420 }} className="st-in">
        <img src="/noob-study-logo.svg" alt="NOOB STUDY" width={168} height={168} style={{ margin: '0 auto' }} draggable={false} />
        <p className="st-eyebrow" style={{ marginTop: 22 }}>NOOB STUDY</p>
        <h1 className="st-title st-h1" style={{ fontSize: 30, marginTop: 6 }}>{off ? 'Taking a short break' : 'Coming soon'}</h1>
        <p className="st-muted" style={{ marginTop: 12, lineHeight: 1.6 }}>
          {gate.message || (off ? 'NOOB STUDY is switched off for a little while. Please check back soon.' : 'Your AI tutor, weekly tests, study plans and a calm place to learn are almost ready. We will open the doors very soon.')}
        </p>
        <div style={{ marginTop: 26 }}><Btn kind="primary" onClick={leaveStudy}>Back to NOOB</Btn></div>
      </div>
    </div>
  );
};
export default ComingSoon;
