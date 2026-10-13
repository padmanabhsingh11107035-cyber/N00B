import React, { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { MAX_SUBJECTS, applyCombo, combosFor, hasSubject, subjectsFor, toggleSubject, type ChosenSubject } from '../../utils/studyCatalog';
import { Btn, Chip, Field, ProgressBar } from './ui';

// Choosing one to six subjects: suggestions for the student's class and stream, quick combinations, and their own custom subjects.
// The limit is enforced here (the buttons stop) and again in the database.
export const SubjectPicker: React.FC<{
  level: string | null; stream?: string | null; value: ChosenSubject[]; onChange: (list: ChosenSubject[]) => void; error: string | null; setError: (e: string | null) => void;
}> = ({ level, stream, value, onChange, error, setError }) => {
  const [custom, setCustom] = useState('');
  const suggestions = useMemo(() => subjectsFor(level, stream), [level, stream]);
  const combos = useMemo(() => combosFor(level, stream), [level, stream]);
  const addCustom = () => {
    const r = toggleSubject(value, custom, 'custom');
    onChange(r.list); setError(r.error);
    if (!r.error) setCustom('');
  };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="st-card-flat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div><p className="st-title st-h3">{value.length} of {MAX_SUBJECTS} chosen</p><p className="st-tiny st-muted">Choose between 1 and {MAX_SUBJECTS}. You can change them any time.</p></div>
        <div style={{ width: 90 }}><ProgressBar value={(value.length / MAX_SUBJECTS) * 100} label="Subjects chosen" /></div>
      </div>
      {combos.length > 0 && (
        <Field label="Quick pick">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{combos.map((c) => <Chip key={c.id} onClick={() => { onChange(applyCombo(c)); setError(null); }}>{c.label}</Chip>)}</div>
        </Field>
      )}
      <Field label={suggestions.length ? 'Tap to add or remove' : 'Add your subjects below'}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {suggestions.map((sg) => {
            const on = hasSubject(value, sg.name);
            return <Chip key={sg.name} on={on} disabled={!on && value.length >= MAX_SUBJECTS} onClick={() => { const r = toggleSubject(value, sg.name, 'catalogue'); onChange(r.list); setError(r.error); }}>{on && <Check size={14} />}{sg.name}</Chip>;
          })}
        </div>
      </Field>
      <Field label="Something missing? Add your own" hint="Your own subjects are marked as custom, because we do not know their syllabus.">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="st-input" value={custom} maxLength={60} placeholder="e.g. Robotics club" onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
          <Btn onClick={addCustom} aria-label="Add subject"><Plus size={18} /></Btn>
        </div>
      </Field>
      {value.length > 0 && (
        <Field label="Your subjects (tap one to remove it)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{value.map((sb) => (
            <button key={sb.name} type="button" className="st-chip" data-on="true" onClick={() => { const r = toggleSubject(value, sb.name); onChange(r.list); setError(r.error); }} aria-label={`Remove ${sb.name}`}>
              {sb.name}{sb.kind === 'custom' ? ' · custom' : ''} ✕
            </button>))}</div>
        </Field>
      )}
      {error && <div className="st-notice st-notice-warn" role="alert">{error}</div>}
    </div>
  );
};
