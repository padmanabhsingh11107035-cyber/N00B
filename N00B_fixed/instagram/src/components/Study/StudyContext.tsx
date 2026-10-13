import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../../types';
import { studyApi } from '../../services/studyApi';
import type { StudyMe, StudySubject } from '../../utils/studyTypes';
import { browserTimeZone } from '../../utils/studyTime';
import { subjectColor, type SubjectColor } from './ui';

// What every NOOB STUDY screen shares: the signed-in student, their saved profile and subjects, and a small "toast" message.

interface StudyCtx {
  user: User;
  me: StudyMe | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setMe: (me: StudyMe) => void;
  tz: string;
  subjects: StudySubject[];
  subjectName: (id: string | null | undefined) => string;
  colorOf: (id: string | null | undefined) => SubjectColor;
  toast: (text: string) => void;
  // the student chose to look around before setting up (remembered on this device)
  skipped: boolean;
  skipSetup: () => void;
}

const Ctx = createContext<StudyCtx | null>(null);
export const useStudy = (): StudyCtx => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStudy must be used inside NOOB STUDY');
  return v;
};

export const StudyProvider: React.FC<{ user: User; children: React.ReactNode }> = ({ user, children }) => {
  const [me, setMeState] = useState<StudyMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const skipKey = `noob.study.skip.${user.id}`;
  const [skipped, setSkipped] = useState(() => { try { return localStorage.getItem(skipKey) === '1'; } catch { return false; } });
  const skipSetup = useCallback(() => { setSkipped(true); try { localStorage.setItem(skipKey, '1'); } catch { /* private mode: it lasts until the app is closed */ } }, [skipKey]);

  const reload = useCallback(async () => {
    const res = await studyApi.me();
    if (res.ok) { setMeState(res.data); setError(null); } else { setError(res.error); }
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload, user.id]);

  const toast = useCallback((text: string) => {
    setToastText(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastText(null), 2800);
  }, []);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const value = useMemo<StudyCtx>(() => {
    const subjects = me?.subjects || [];
    const byId = new Map<string, StudySubject>(subjects.map((s): [string, StudySubject] => [s.id, s]));
    return {
      user, me, loading, error, reload, setMe: setMeState,
      tz: me?.profile?.timezone || browserTimeZone(),
      subjects,
      subjectName: (id) => (id && byId.get(id)?.name) || '',
      colorOf: (id) => subjectColor((id && byId.get(id)?.name) || ''),
      toast, skipped, skipSetup
    };
  }, [user, me, loading, error, reload, toast, skipped, skipSetup]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastText && <div className="st-toast" role="status" aria-live="polite">{toastText}</div>}
    </Ctx.Provider>
  );
};
