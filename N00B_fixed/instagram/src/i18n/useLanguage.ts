import { useSyncExternalStore } from 'react';
import { getLanguage, getPercent, subscribe } from './engine.ts';

// The language the app is showing right now; the component re-renders when it changes.
export function useLanguage(): string {
  return useSyncExternalStore(subscribe, getLanguage, () => 'en');
}

// How much of the app is available in the current language, 0-100 (100 for English).
export function useLanguagePercent(): number {
  return useSyncExternalStore(subscribe, getPercent, () => 100);
}
