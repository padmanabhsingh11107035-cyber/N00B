import type { FamilyApi, FamilyMember, FamilyRoom, Outcome, RoomState } from './api.ts';
import { isCode, normaliseCode, type Fix, type LatLng } from './geo.ts';

// A made-up Family Map that lives in memory (open /family?demo=1): a sample room with people who walk, cycle and drive around the visitor's own place, one who paused sharing and one who
// has not been heard of for a while, so the whole design can be seen without an account or a database. Nothing is stored or sent anywhere; reloading the page forgets it.
const FALLBACK: LatLng = { lat: 19.076, lng: 72.8777 };
const SAMPLE_CODE = 'K7QM2XPD';

const face = (bg1: string, bg2: string, shirt: string, skin: string, hair: string, hairShape: number): string => {
  const hairs = [
    `<path d='M19 27c0-10 6-15 13-15s13 5 13 15c-3-6-8-8-13-8s-10 2-13 8z' fill='${hair}'/>`,
    `<path d='M18 30c-2-12 5-19 14-19s16 7 14 19c0 6 2 11 3 14-4-1-6-4-7-8-5-2-12-2-17 0-1 4-3 7-7 8 1-3 3-8 0-14z' fill='${hair}'/>`,
    `<path d='M19 26c1-9 7-13 13-13s12 4 13 13c-3-4-8-6-13-6s-10 2-13 6z' fill='${hair}'/><circle cx='32' cy='10' r='5' fill='${hair}'/>`,
    `<path d='M20 24c2-8 7-11 12-11s10 3 12 11c-4-3-8-4-12-4s-8 1-12 4z' fill='${hair}'/>`
  ];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${bg1}'/><stop offset='1' stop-color='${bg2}'/></linearGradient></defs><rect width='64' height='64' fill='url(#g)'/><path d='M6 64c2-15 13-21 26-21s24 6 26 21z' fill='${shirt}'/><rect x='28' y='36' width='8' height='9' rx='3' fill='${skin}'/><circle cx='32' cy='28' r='13' fill='${skin}'/>${hairs[hairShape]}<circle cx='27' cy='29' r='1.6' fill='#2b2140'/><circle cx='37' cy='29' r='1.6' fill='#2b2140'/><path d='M28 34q4 3.5 8 0' stroke='#2b2140' stroke-width='1.6' fill='none' stroke-linecap='round'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

interface Walker { id: string; name: string; avatar: string; dx: number; dy: number; amp: number; period: number; phase: number; sharing: boolean; staleMin: number; role: 'owner' | 'member' }
const WALKERS: Walker[] = [
  { id: 'demo-priya', name: 'Priya', avatar: face('#7c5cff', '#25d4ff', '#ff7aa8', '#f1c8a5', '#2a1d3a', 1), dx: 900, dy: 650, amp: 25, period: 240, phase: 0.4, sharing: true, staleMin: 0, role: 'owner' },
  { id: 'demo-aarav', name: 'Aarav', avatar: face('#ffb84d', '#ff5d73', '#38bdf8', '#e6b48f', '#16121f', 3), dx: -700, dy: 380, amp: 140, period: 240, phase: 2.1, sharing: true, staleMin: 0, role: 'member' },
  { id: 'demo-rohan', name: 'Rohan', avatar: face('#2ee59d', '#1d8fff', '#a78bfa', '#c68e6a', '#1b1b24', 0), dx: 260, dy: -1250, amp: 520, period: 400, phase: 4.2, sharing: true, staleMin: 0, role: 'member' },
  { id: 'demo-diya', name: 'Diya', avatar: face('#ff8ad4', '#7c5cff', '#fbbf24', '#f1c8a5', '#3b2418', 2), dx: -1500, dy: -700, amp: 30, period: 200, phase: 1, sharing: false, staleMin: 0, role: 'member' },
  { id: 'demo-dadi', name: 'Dadi', avatar: face('#94a3b8', '#475569', '#f472b6', '#e1b997', '#e5e7eb', 2), dx: 2300, dy: 1500, amp: 12, period: 300, phase: 3, sharing: true, staleMin: 25, role: 'member' }
];

const ME_ID = 'demo-me';
const mk = (id: string, name: string, emoji: string, role: 'owner' | 'member', count: number): FamilyRoom =>
  ({ id, code: SAMPLE_CODE, name, emoji, ownerId: role === 'owner' ? ME_ID : 'demo-priya', role, sharing: true, memberCount: count, createdAt: new Date().toISOString() });

export function createDemoApi(): FamilyApi & { setAnchor(p: LatLng): void } {
  let anchor: LatLng = FALLBACK, anchored = false, myFix: Fix | null = null;
  let rooms: FamilyRoom[] = [mk('demo-room-1', 'The Sharma Family', '🏠', 'member', 6)];
  let sharing = true;

  const metersToDeg = (dx: number, dy: number): LatLng => ({ lat: anchor.lat + dy / 111320, lng: anchor.lng + dx / (111320 * Math.cos((anchor.lat * Math.PI) / 180)) });
  const at = (w: Walker, tSec: number) => {
    const a = (2 * Math.PI * tSec) / w.period + w.phase;
    const x = w.dx + w.amp * Math.sin(a), y = w.dy + w.amp * Math.cos(a * 1.3);
    const vx = w.amp * Math.cos(a) * ((2 * Math.PI) / w.period), vy = -w.amp * 1.3 * Math.sin(a * 1.3) * ((2 * Math.PI) / w.period);
    return { ...metersToDeg(x, y), speed: Math.hypot(vx, vy), heading: (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360 };
  };
  const state = (roomId: string): Outcome<RoomState> => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return { ok: false, error: 'not_member' };
    const now = Date.now(), t = now / 1000;
    const here = myFix || { ...anchor, accuracy: 12, heading: null, speed: 0, at: now };
    const members: FamilyMember[] = [{
      id: ME_ID, name: 'You', username: 'you', avatar: face('#8b6bff', '#25d4ff', '#34d399', '#e6b48f', '#241a33', 3), role: room.role, sharing, me: true,
      lat: sharing ? here.lat : null, lng: sharing ? here.lng : null, accuracy: here.accuracy, heading: here.heading, speed: here.speed, updatedAt: sharing ? new Date(now - 2000).toISOString() : null
    }];
    for (const w of WALKERS.slice(0, Math.max(1, Math.min(WALKERS.length, room.memberCount - 1)))) {
      const p = at(w, t);
      const visible = w.sharing;
      members.push({
        id: w.id, name: w.name, username: w.name.toLowerCase(), avatar: w.avatar, role: w.role, sharing: w.sharing, me: false,
        lat: visible ? p.lat : null, lng: visible ? p.lng : null, accuracy: visible ? 15 : null, heading: visible && p.speed > 1 ? p.heading : null, speed: visible ? p.speed : null,
        updatedAt: visible ? new Date(now - (w.staleMin ? w.staleMin * 60000 : 1500 + ((w.phase * 997) % 6000))).toISOString() : null
      });
    }
    return { ok: true, room: { ...room, sharing }, members, now };
  };
  const wait = <T,>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 180));

  return {
    mode: 'demo',
    setAnchor(p) { if (!anchored) { anchor = p; anchored = true; } },
    myRooms: () => wait(rooms.map((r) => ({ ...r }))),
    createRoom(name, emoji) {
      const n = name.trim();
      if (!n || n.length > 40) return wait({ ok: false, error: 'bad_name' });
      const room = { ...mk(`demo-room-${rooms.length + 1}`, n, emoji, 'owner', 3), code: ['H3R9TWNA', 'ZC4V8BEJ', 'PW5N6RTA'][rooms.length % 3] };
      rooms = [...rooms, room];
      return wait({ ok: true, room });
    },
    joinRoom(code) {
      const c = normaliseCode(code);
      if (!isCode(c)) return wait({ ok: false, error: 'bad_code' });
      if (c === 'AAAAAAAA') return wait({ ok: false, error: 'not_found' });
      const found = rooms.find((r) => r.code === c);
      if (found) return wait({ ok: true, room: found });
      const room = mk(`demo-room-${rooms.length + 1}`, 'Weekend Gang', '🎒', 'member', 4);
      rooms = [...rooms, { ...room, code: c }];
      return wait({ ok: true, room: { ...room, code: c } });
    },
    roomState: (id) => wait(state(id)),
    async pushLocation(fix) { myFix = fix; this.setAnchor?.(fix); },
    async setSharing(_id, on) { sharing = on; rooms = rooms.map((r) => ({ ...r, sharing: on })); return { ok: true }; },
    async leaveRoom(id) { rooms = rooms.filter((r) => r.id !== id); return { ok: true }; },
    async removeMember() { return { ok: true }; },
    async rotateCode(id) {
      const code = ['M5T8QHWA', 'D9XK3CRP', 'U2LB7NZE'][Math.floor(Date.now() / 1000) % 3];
      rooms = rooms.map((r) => (r.id === id ? { ...r, code } : r));
      return { ok: true, code };
    },
    async deleteRoom(id) { rooms = rooms.filter((r) => r.id !== id); return { ok: true }; }
  };
}
