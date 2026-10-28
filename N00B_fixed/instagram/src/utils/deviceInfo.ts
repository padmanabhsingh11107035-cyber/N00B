// What NOOB reads about the device and the place, as told in the Terms and the Privacy Policy: the operating system, the battery level where the browser shares it (an iPhone does not),
// and the approximate place of the connection (city, region, country, worked out by NOOB's own web address /__geo, never by a third party). Pure parts first, so they can be tested.

export interface DeviceInfo { os: string; battery: number | null; charging: boolean | null }

/** "Android 14", "iOS 17.5", "Windows", "macOS", "Linux", "ChromeOS": from the browser's own description of itself. */
export function osFromAgent(ua: string, platform = '', touchPoints = 0): string {
  const u = String(ua || '');
  let m = /Android[ /]([0-9]+(?:\.[0-9]+)?)/i.exec(u);
  if (m) return `Android ${m[1]}`;
  if (/Android/i.test(u)) return 'Android';
  m = /(?:iPhone|iPad|iPod)[^)]*?OS ([0-9]+)[_.]([0-9]+)/i.exec(u) || /CPU (?:iPhone )?OS ([0-9]+)[_.]([0-9]+)/i.exec(u);
  if (m) return `iOS ${m[1]}.${m[2]}`;
  if (/iPhone|iPad|iPod/i.test(u) || (/Macintosh|MacIntel/i.test(u + platform) && touchPoints > 1)) return 'iOS';
  if (/CrOS/i.test(u)) return 'ChromeOS';
  if (/Windows/i.test(u)) return 'Windows';
  if (/Mac OS X|Macintosh|MacIntel/i.test(u + platform)) return 'macOS';
  if (/Linux|X11/i.test(u)) return 'Linux';
  return 'Unknown';
}

/** battery level as a whole number from 0 to 100, or null when it is not a real level */
export function batteryPercent(level: unknown): number | null {
  const n = Number(level);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 100) : null;
}

/** What the administrator sees as the battery of a person at their last visit: the level (with a charging mark), how low it is, or why there is no level. null when no device was ever reported. */
export interface BatteryBadge { text: string; tone: 'low' | 'mid' | 'ok' | 'none'; level: number | null }
export function batteryBadge(u: { deviceOs?: string | null; deviceBattery?: number | null; deviceCharging?: boolean | null; deviceInfoAt?: string | null }): BatteryBadge | null {
  if (typeof u.deviceBattery === 'number' && u.deviceBattery >= 0 && u.deviceBattery <= 100) {
    const lv = Math.round(u.deviceBattery);
    return { text: `${lv}%${u.deviceCharging ? ' charging' : ''}`, tone: lv <= 20 ? 'low' : lv <= 50 ? 'mid' : 'ok', level: lv };
  }
  if (!u.deviceOs && !u.deviceInfoAt) return null;
  return { text: /^iOS/i.test(u.deviceOs || '') ? 'hidden by iPhone' : 'not shared by this browser', tone: 'none', level: null };
}

/** When something is due again: never more often than `everyMs`, remembered in `store` under `key`. */
export function dueNow(store: Pick<Storage, 'getItem' | 'setItem'> | null, key: string, everyMs: number, now = Date.now()): boolean {
  try {
    const last = Number(store?.getItem(key) || 0);
    if (last && now - last < everyMs) return false;
    store?.setItem(key, String(now));
    return true;
  } catch { return true; }
}

export async function readDeviceInfo(): Promise<DeviceInfo> {
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as (Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }) | null;
  const os = osFromAgent(nav?.userAgent || '', nav?.platform || '', nav?.maxTouchPoints || 0);
  let battery: number | null = null, charging: boolean | null = null;
  try {
    if (nav?.getBattery) {
      const b = await Promise.race([nav.getBattery(), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
      if (b) { battery = batteryPercent(b.level); charging = typeof b.charging === 'boolean' ? b.charging : null; }
    }
  } catch { /* the browser does not share it: only the system is sent */ }
  return { os, battery, charging };
}

export interface ApproxPlace { city: string; region: string; country: string }
/** the place of this connection as NOOB's own web address sees it (nothing is sent to anybody else) */
export async function readApproxPlace(origin = ''): Promise<ApproxPlace | null> {
  try {
    const res = await fetch(`${origin}/__geo`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    const clean = (v: unknown) => String(v ?? '').trim().slice(0, 60);
    const p = { city: clean(j?.city), region: clean(j?.region), country: clean(j?.country) };
    return p.city || p.region || p.country ? p : null;
  } catch { return null; }
}
