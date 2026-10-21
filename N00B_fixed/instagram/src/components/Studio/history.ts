import { useCallback, useRef, useState } from 'react';
import { Project } from './types';

// Undo / redo: the project is plain data, so history is just earlier copies of it. A slider that is being dragged sends many changes with the same key; they count as one step.
interface State { present: Project; past: Project[]; future: Project[] }
const LIMIT = 120;

export function useHistory(initial: Project) {
  const [s, setS] = useState<State>({ present: initial, past: [], future: [] });
  const lastKey = useRef('');
  const lastAt = useRef(0);

  const update = useCallback((fn: (p: Project) => Project, key?: string) => {
    setS((cur) => {
      const next = fn(cur.present);
      if (next === cur.present) return cur;
      const now = Date.now();
      const together = !!key && key === lastKey.current && now - lastAt.current < 900 && cur.past.length > 0;
      lastKey.current = key || '';
      lastAt.current = now;
      return { present: next, past: together ? cur.past : [...cur.past, cur.present].slice(-LIMIT), future: [] };
    });
  }, []);
  const undo = useCallback(() => setS((cur) => {
    if (cur.past.length === 0) return cur;
    lastKey.current = '';
    return { present: cur.past[cur.past.length - 1], past: cur.past.slice(0, -1), future: [cur.present, ...cur.future] };
  }), []);
  const redo = useCallback(() => setS((cur) => {
    if (cur.future.length === 0) return cur;
    lastKey.current = '';
    return { present: cur.future[0], past: [...cur.past, cur.present], future: cur.future.slice(1) };
  }), []);
  /** Replace everything (a new project, a template): the old one can still be undone back to. */
  const replace = useCallback((p: Project, forget = false) => setS((cur) => (forget ? { present: p, past: [], future: [] } : { present: p, past: [...cur.past, cur.present].slice(-LIMIT), future: [] })), []);

  return { project: s.present, update, undo, redo, replace, canUndo: s.past.length > 0, canRedo: s.future.length > 0, changed: s.past.length > 0 };
}
