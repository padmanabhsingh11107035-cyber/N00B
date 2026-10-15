// The People list of Explore: what to show, in which order, and how a fresh answer is folded into a list that is already on screen.
import type { User } from '../types';

/** Everyone except NOOB's own AI account. */
export function realPeople(list: User[] | null | undefined): User[] {
  return (list || []).filter((u: any) => !u.isAi && u.username !== 'noob_ai' && u.id !== 'u_noob_ai');
}

/** Accounts the admin pinned stay first (in their order); everyone else is shuffled. */
export function shufflePeople(list: User[], random: () => number = Math.random): User[] {
  const pinned = list.filter((u: any) => u.pinned);
  const others = list.filter((u: any) => !u.pinned);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  return [...pinned, ...others];
}

/** A fresh answer for a list that is already showing: same order, up-to-date details, people who left removed, new people added at the end - so the list never jumps under a finger. */
export function mergePeople(shown: User[], fresh: User[]): User[] {
  const byId = new Map(fresh.map((u) => [u.id, u] as const));
  const kept = shown.filter((u) => byId.has(u.id)).map((u) => byId.get(u.id) as User);
  const keptIds = new Set(kept.map((u) => u.id));
  return [...kept, ...shufflePeople(fresh.filter((u) => !keptIds.has(u.id)))];
}
