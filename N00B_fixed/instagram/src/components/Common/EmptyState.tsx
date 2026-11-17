import React from 'react';
import './emptyState.css';

// One look for "nothing here yet" screens: a soft round icon, a short title, one friendly line. Colours follow the text colour around it, so it works in dark and light.
export function EmptyState({ icon, title, text, compact, testId }: { icon: React.ReactNode; title: string; text?: string; compact?: boolean; testId?: string }) {
  return (
    <div className={`es-wrap${compact ? ' es-compact' : ''}`} data-testid={testId}>
      <div className="es-ico" aria-hidden="true">{icon}</div>
      <div className="es-title">{title}</div>
      {text ? <div className="es-text">{text}</div> : null}
    </div>
  );
}

export default EmptyState;
