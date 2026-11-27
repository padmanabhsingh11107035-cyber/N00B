import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { useSheetDrag } from '../../utils/sheetDrag';
import { SheetGrip } from '../Common/SheetGrip';
import {
  ACTIVITY_OPTIONS, EMPTY_FILTER, EXTRA_OPTIONS, FROM_OPTIONS, KIND_OPTIONS, SORT_OPTIONS, TIME_OPTIONS, activeCount,
  toggleActivity, toggleExtra, toggleFrom, toggleKind, type FilterOption, type HomeFilter
} from '../../utils/homeFilter';

// The Home "Filters" sheet, laid out like a shop's filter sheet: groups down the left, the choices of the open group on the right with a tick (or a dot, when only one can be chosen),
// "Clear all" at the bottom left and a big "Show N" button at the bottom right. Colours come from the Home page's own colour line (styles: .hf-* in Feed/home.css), dark and light.
type GroupId = 'kinds' | 'sort' | 'activity' | 'time' | 'from' | 'extras';
const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'kinds', label: 'Content' }, { id: 'sort', label: 'Sort by' }, { id: 'activity', label: 'Your activity' },
  { id: 'time', label: 'Posted' }, { id: 'from', label: 'From' }, { id: 'extras', label: 'More' }
];

interface Props {
  value: HomeFilter;
  /** how many things Home would show with this filter (so the button can say "Show 12") */
  countFor: (f: HomeFilter) => number;
  onApply: (f: HomeFilter) => void;
  onClose: () => void;
}

export const HomeFilterSheet: React.FC<Props> = ({ value, countFor, onApply, onClose }) => {
  const [draft, setDraft] = useState<HomeFilter>(value);
  const [group, setGroup] = useState<GroupId>('kinds');
  const drag = useSheetDrag(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const count = useMemo(() => countFor(draft), [draft, countFor]);

  const badge = (id: GroupId): number => {
    switch (id) {
      case 'kinds': return draft.kinds.length;
      case 'sort': return draft.sort !== 'default' ? 1 : 0;
      case 'activity': return draft.activity.length;
      case 'time': return draft.time !== 'any' ? 1 : 0;
      case 'from': return draft.from.length;
      default: return draft.extras.length;
    }
  };

  const row = <T extends string>(o: FilterOption<T>, on: boolean, single: boolean, press: () => void) => (
    <button key={o.id} type="button" role={single ? 'radio' : 'checkbox'} aria-checked={on} className={`hf-opt${on ? ' is-on' : ''}`} onClick={press} data-testid={`hf-opt-${o.id}`}>
      <span className="hf-opt-text"><b>{o.label}</b>{o.hint ? <small>{o.hint}</small> : null}</span>
      <span className={`hf-mark${single ? ' is-round' : ''}`} aria-hidden="true">{on ? (single ? <i /> : <Check size={14} strokeWidth={3.2} />) : null}</span>
    </button>
  );

  let options: React.ReactNode;
  switch (group) {
    case 'kinds': options = KIND_OPTIONS.map((o) => row(o, draft.kinds.includes(o.id), false, () => setDraft(toggleKind(draft, o.id)))); break;
    case 'sort': options = SORT_OPTIONS.map((o) => row(o, draft.sort === o.id, true, () => setDraft({ ...draft, sort: o.id }))); break;
    case 'activity': options = ACTIVITY_OPTIONS.map((o) => row(o, draft.activity.includes(o.id), false, () => setDraft(toggleActivity(draft, o.id)))); break;
    case 'time': options = TIME_OPTIONS.map((o) => row(o, draft.time === o.id, true, () => setDraft({ ...draft, time: o.id }))); break;
    case 'from': options = FROM_OPTIONS.map((o) => row(o, draft.from.includes(o.id), false, () => setDraft(toggleFrom(draft, o.id)))); break;
    default: options = EXTRA_OPTIONS.map((o) => row(o, draft.extras.includes(o.id), false, () => setDraft(toggleExtra(draft, o.id))));
  }
  const current = GROUPS.find((g) => g.id === group)!;

  return createPortal(
    <div className="hf-layer" role="dialog" aria-modal="true" aria-label="Filters" onClick={stop} onPointerDown={stop} onTouchStart={stop} onDoubleClick={stop} data-noob-keep="1">
      <div ref={drag.backdropRef} className="hf-backdrop" onPointerUp={onClose} aria-hidden="true" />
      <div ref={drag.sheetRef} className="hf-sheet" data-testid="home-filter-sheet">
        <SheetGrip drag={drag} alwaysBar barClassName="bg-transparent">
          <div className="hf-bar" aria-hidden="true"><span /></div>
        </SheetGrip>
        <div className="hf-head">
          <b>Filters</b>
          <button type="button" className="hf-x" onClick={onClose} aria-label="Close filters"><X size={20} /></button>
        </div>
        <div className="hf-body">
          <nav className="hf-rail" aria-label="Filter groups">
            {GROUPS.map((g) => (
              <button key={g.id} type="button" className={`hf-tab${g.id === group ? ' is-on' : ''}`} onClick={() => setGroup(g.id)} data-testid={`hf-group-${g.id}`}>
                <span>{g.label}</span>{badge(g.id) > 0 ? <em>{badge(g.id)}</em> : null}
              </button>
            ))}
          </nav>
          <div className="hf-opts" role={group === 'sort' || group === 'time' ? 'radiogroup' : 'group'} aria-label={current.label}>
            <h3>{current.label}</h3>
            {options}
          </div>
        </div>
        <div className="hf-foot">
          <button type="button" className="hf-clear" disabled={activeCount(draft) === 0} onClick={() => setDraft(EMPTY_FILTER)} data-testid="hf-clear">Clear all</button>
          <button type="button" className="hf-apply" onClick={() => { onApply(draft); onClose(); }} data-testid="hf-apply">{count > 0 ? `Show ${count > 99 ? '99+' : count}` : 'Nothing matches'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
