import React from 'react';
import { ArrowLeft } from 'lucide-react';
import './nzPage.css';

/** The top of an "nz" page: Back, an icon, the title and one line under it (and an optional tag on the right). See nzPage.css. */
export const NzHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; onBack: () => void; tag?: string }> = ({ icon, title, subtitle, onBack, tag }) => (
  <header className="nz-head">
    <button type="button" onClick={onBack} className="nz-back" aria-label="Back"><ArrowLeft size={20} /></button>
    <div className="nz-badge" aria-hidden="true">{icon}</div>
    <div className="nz-titles">
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {tag && <span className="nz-tag">{tag}</span>}
  </header>
);
