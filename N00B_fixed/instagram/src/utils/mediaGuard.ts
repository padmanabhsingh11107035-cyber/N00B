// A safety net for Supabase's "Cached Egress" (the traffic its storage hands out; the Free plan allows 5 GB a month). Every picture, video and song of NOOB is meant to be asked for at
// our own /m/<key> address, where the Worker keeps one copy in its data centre's cache (see worker/index.js and resolveMedia in services/supabase.ts). If any screen ever hands the
// browser Supabase's own storage address instead (a mapper that forgot resolveMedia, an old saved address, a new screen written in a hurry), every view of that file would be
// paid for in full. This guard changes such an address to the cached one at the moment it is set on a picture, video, song or poster, before the browser has asked for anything.

/** the cached address for Supabase's own public storage address of a file ("<directPrefix><key>" -> "<origin>/m/<key>"); anything else is returned as it is */
export function cachedFromDirect(value: string, directPrefix: string, origin = ''): string {
  if (!directPrefix || typeof value !== 'string' || !value.startsWith(directPrefix)) return value;
  const key = value.slice(directPrefix.length).split('?')[0].split('#')[0];
  return key ? `${origin}/m/${key}` : value;
}

let installed = false;

/** @param rewrite what to do with an address (cachedFromDirect with this site's prefix) */
export function installMediaGuard(rewrite: (value: string) => string): void {
  if (installed || typeof window === 'undefined' || typeof Element === 'undefined') return;
  installed = true;
  const fix = (v: unknown): unknown => (typeof v === 'string' ? rewrite(v) : v);

  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (this: Element, name: string, value: string): void {
    const n = String(name).toLowerCase();
    return setAttribute.call(this, name, (n === 'src' || n === 'poster') && /^(IMG|VIDEO|AUDIO|SOURCE|TRACK)$/.test(this.tagName) ? (fix(value) as string) : value);
  };

  const guardProperty = (proto: object | undefined, prop: string) => {
    if (!proto) return;
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set || !d.configurable) return;
    const set = d.set;
    Object.defineProperty(proto, prop, { ...d, set(this: unknown, v: unknown) { set.call(this, fix(v)); } });
  };
  guardProperty(window.HTMLImageElement?.prototype, 'src');
  guardProperty(window.HTMLMediaElement?.prototype, 'src');
  guardProperty(window.HTMLSourceElement?.prototype, 'src');
  guardProperty(window.HTMLVideoElement?.prototype, 'poster');
}
