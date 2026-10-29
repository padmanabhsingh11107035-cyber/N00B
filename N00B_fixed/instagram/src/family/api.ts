import type { Fix } from './geo.ts';
import type { PushItem } from './dayRecorder.ts';
import type { Seg } from './timeline.ts';

// NOOB Family Map: what the screens ask for (FamilyApi) and how the database answers are read. Two implementations exist: liveApi.ts (the real database) and demoApi.ts (made-up people in
// memory, so the design can be seen without an account). This file has no imports from the app, so it is tested on its own.

export interface FamilyRoom {
  id: string; code: string; name: string; emoji: string; ownerId: string;
  role: 'owner' | 'member'; sharing: boolean; memberCount: number; createdAt: string; locked: boolean;
  /** the day report: I share where I went today with this room */
  report: boolean;
}
export interface FamilyMember {
  id: string; name: string; username: string; avatar: string; role: 'owner' | 'member'; sharing: boolean; me: boolean;
  /** shares the day report (and the location) with this room */
  report: boolean;
  lat: number | null; lng: number | null; accuracy: number | null; heading: number | null; speed: number | null; updatedAt: string | null;
}
export type FamilyError =
  | 'not_signed_in' | 'switched_off' | 'bad_name' | 'bad_code' | 'not_found' | 'too_many_tries' | 'room_full' | 'too_many_rooms' | 'room_locked' | 'not_member' | 'not_owner' | 'failed';
export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: FamilyError };
export interface RoomState { room: FamilyRoom; members: FamilyMember[]; now: number }
/** one person's report of today, as the database hands it out and the phone has opened it (day = the calendar day in `tz`, the person's own time zone) */
export interface DaySource { on: boolean; now: number; day: string; tz: string; segs: Seg[]; updatedAt: number | null; unreadable: number }

/** the database cannot be reached ('down'), the Family Map functions are not installed yet ('setup'), or there is no login any more ('login') */
export class FamilyOffline extends Error {
  kind: 'down' | 'setup' | 'login';
  constructor(kind: 'down' | 'setup' | 'login', message: string = kind) { super(message); this.name = 'FamilyOffline'; this.kind = kind; }
}

export interface FamilyApi {
  readonly mode: 'live' | 'demo';
  /** the id of the person who is logged in (the "keep sharing" switch is remembered per person) */
  userId(): Promise<string | null>;
  /** the person's "share my location" switch: what a new room starts with */
  getPrefs(): Promise<{ shareDefault: boolean; reportDefault: boolean }>;
  /** "share my day report" for all rooms at once (deleted at 00:00 every night; switching it off deletes it at once) */
  setReportAll(on: boolean): Promise<Outcome>;
  /** the rooms that get my day report right now (null: could not be asked) */
  reportRooms(): Promise<string[] | null>;
  /** send the stays and trips of today to one room (locked on the phone first); false = they did not arrive */
  pushDay(roomId: string, day: string, tz: string, items: PushItem[]): Promise<boolean>;
  /** the report of today of one person in a room */
  getDay(roomId: string, userId: string): Promise<Outcome<{ day: DaySource }>>;
  /** "share my location" for all rooms at once */
  setSharingAll(on: boolean): Promise<Outcome>;
  /** the owner locks a room (nobody new can join) or unlocks it */
  setLocked(roomId: string, on: boolean): Promise<Outcome>;
  myRooms(): Promise<FamilyRoom[]>;
  createRoom(name: string, emoji: string, share: boolean): Promise<Outcome<{ room: FamilyRoom }>>;
  joinRoom(code: string, share: boolean): Promise<Outcome<{ room: FamilyRoom }>>;
  roomState(roomId: string): Promise<Outcome<RoomState>>;
  pushLocation(fix: Fix): Promise<void>;
  setSharing(roomId: string, on: boolean): Promise<Outcome>;
  leaveRoom(roomId: string): Promise<Outcome>;
  removeMember(roomId: string, userId: string): Promise<Outcome>;
  rotateCode(roomId: string): Promise<Outcome<{ code: string }>>;
  deleteRoom(roomId: string): Promise<Outcome>;
}

export const ERROR_TEXT: Record<FamilyError, string> = {
  not_signed_in: 'Please log in to NOOB first.',
  switched_off: 'Family Map is switched off for now. Please try again later.',
  bad_name: 'Give the room a name (up to 40 letters).',
  bad_code: 'A code has 8 letters and numbers, like K7QM-2XPD.',
  not_found: 'No room has that code. Check it with the person who made the room.',
  too_many_tries: 'Too many wrong codes. Please wait 10 minutes and try again.',
  room_full: 'This room is full (20 people).',
  too_many_rooms: 'You are in 10 rooms already. Leave one first.',
  room_locked: 'This room is locked, so nobody new can join. Ask the person who made it to unlock it.',
  not_member: 'You are not in this room any more.',
  not_owner: 'Only the person who made the room can do that.',
  failed: 'Something went wrong. Please try again.'
};

const KNOWN = new Set(Object.keys(ERROR_TEXT));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

export function parseRoom(j: any): FamilyRoom {
  return {
    id: str(j?.id), code: str(j?.code), name: str(j?.name), emoji: str(j?.emoji), ownerId: str(j?.ownerId),
    role: j?.role === 'owner' ? 'owner' : 'member', sharing: j?.sharing !== false, memberCount: num(j?.memberCount) ?? 1, createdAt: str(j?.createdAt), locked: j?.locked === true, report: j?.report === true
  };
}
/** `resolve` turns a stored picture into an address (services/supabase.ts resolveMedia); anything that is not an http(s), relative, data or blob address is dropped */
export function parseMember(j: any, resolve: (v: string) => string): FamilyMember {
  const avatar = resolve(str(j?.avatar));
  return {
    id: str(j?.id), name: str(j?.name) || str(j?.username) || 'Someone', username: str(j?.username), avatar: /^(https?:|data:image\/|blob:|\/)/i.test(avatar) ? avatar : '',
    role: j?.role === 'owner' ? 'owner' : 'member', sharing: j?.sharing !== false, me: j?.me === true, report: j?.report === true,
    lat: num(j?.lat), lng: num(j?.lng), accuracy: num(j?.accuracy), heading: num(j?.heading), speed: num(j?.speed), updatedAt: typeof j?.updatedAt === 'string' ? j.updatedAt : null
  };
}
export function parseOutcome(j: any): Outcome {
  if (j && j.ok === true) return { ok: true };
  const e = String(j?.error || '');
  return { ok: false, error: (KNOWN.has(e) ? e : 'failed') as FamilyError };
}
export function parseRoomOutcome(j: any): Outcome<{ room: FamilyRoom }> {
  return j && j.ok === true && j.room ? { ok: true, room: parseRoom(j.room) } : (parseOutcome(j) as { ok: false; error: FamilyError });
}
export function parseStateOutcome(j: any, resolve: (v: string) => string): Outcome<RoomState> {
  if (!(j && j.ok === true && j.room)) return parseOutcome(j) as { ok: false; error: FamilyError };
  const now = Date.parse(str(j.now));
  return { ok: true, room: parseRoom(j.room), members: (Array.isArray(j.members) ? j.members : []).map((m: unknown) => parseMember(m, resolve)), now: Number.isFinite(now) ? now : Date.now() };
}
