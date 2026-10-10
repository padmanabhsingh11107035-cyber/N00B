import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { readResumeField, writeResumeField } from './pageResume';
import type { ResumePage } from './pageResume';

// Like useState, but the value is kept while this page is open and handed back after a refresh / reopening the app
// (see pageResume.ts). Only for progress worth keeping: a half-typed message, the tab someone was on, ...
export function useResumeState<T>(userId: string, page: ResumePage, field: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const saved = readResumeField<T>(userId, page, field);
    return saved === undefined ? initial : saved;
  });
  useEffect(() => { writeResumeField(userId, page, field, value); }, [userId, page, field, value]);
  return [value, setValue];
}
