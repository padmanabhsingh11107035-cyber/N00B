import React, { useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { NOOB_MODELS } from '../../data/noobModels';
import ModelBox3D from './ModelBox3D';
import './noobModels.css';

// NOOB Models (three-line menu): a page of curved boxes, each with a 3D model turning inside it. The models come from data/noobModels.ts. Styles: nm-* in noobModels.css.
interface Props { onClose: () => void }

export const NoobModelsPage: React.FC<Props> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="nm-root fixed inset-0 z-[210] edge-own" role="dialog" aria-label="NOOB Models" data-testid="noob-models-page">
      <header className="nm-head">
        <button type="button" onClick={onClose} className="nm-back" aria-label="Close" data-testid="noob-models-close"><ChevronLeft className="w-5 h-5" /></button>
        <h1>NOOB Models</h1>
      </header>
      <div className="nm-scroll">
        <div className="nm-grid">
          {NOOB_MODELS.map((m) => (
            <article key={m.id} className="nm-box" data-testid="noob-model-box">
              <ModelBox3D src={m.src} name={m.name} />
              <div className="nm-cap"><b>{m.name}</b><span>{m.blurb}</span></div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NoobModelsPage;
