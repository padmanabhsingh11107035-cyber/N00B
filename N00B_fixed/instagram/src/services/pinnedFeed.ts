// What the admin has pinned to the top of the Feed page, kept in one place so the feed, the post menu, the reel menu and the video menu
// all agree and update together.
import { useSyncExternalStore } from 'react';
import { fetchPinnedFeedItems, setFeedItemPinned } from './api';
import type { PinnedFeedItem } from '../types';

let items: PinnedFeedItem[] = [];
let loadedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getPinnedFeedItems(): PinnedFeedItem[] { return items; }
export function isFeedItemPinned(kind: PinnedFeedItem['kind'], id: string): boolean {
  return items.some((p) => p.kind === kind && p.itemId === id);
}

// Reloads from the server (at most once every 20 seconds unless forced).
export function refreshPinnedFeed(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - loadedAt < 20_000) return Promise.resolve();
  inFlight = fetchPinnedFeedItems()
    .then((list) => { items = list; loadedAt = Date.now(); emit(); })
    .catch(() => undefined)
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function clearPinnedFeed(): void { items = []; loadedAt = 0; emit(); }

export async function toggleFeedPin(kind: PinnedFeedItem['kind'], id: string): Promise<{ success: boolean; pinned?: boolean; error?: string }> {
  const res = await setFeedItemPinned(kind, id, !isFeedItemPinned(kind, id));
  if (res.success) await refreshPinnedFeed(true);
  return res;
}

export function usePinnedFeedItems(): PinnedFeedItem[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    getPinnedFeedItems,
    getPinnedFeedItems
  );
}
