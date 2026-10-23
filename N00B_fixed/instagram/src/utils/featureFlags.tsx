import { createContext, useContext } from 'react';

// Which pages are switched OFF for this person. The app (App.tsx) fills it from the administrator's settings; an administrator always gets an empty set (they see everything).
// Outside the app (a test, a page drawn alone) it is empty, so everything is on.
export const FeatureFlagsContext = createContext<ReadonlySet<string>>(new Set<string>());

/** true while the page is on for this person (see utils/features.ts for the page keys) */
export function useFeatureOn(key: string): boolean {
  return !useContext(FeatureFlagsContext).has(key);
}

/** the whole set of switched-off pages */
export function useFeaturesOff(): ReadonlySet<string> {
  return useContext(FeatureFlagsContext);
}
