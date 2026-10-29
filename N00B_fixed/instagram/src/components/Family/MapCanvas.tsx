import React, { useEffect, useRef } from 'react';
import type { Map as GlMap, Marker as GlMarker } from 'maplibre-gl';
import { boundsOf, distanceM, easeOut, lerpLngLat, type LatLng } from '../../family/geo';
import { fallbackStyle, nightStyle, SKY_NIGHT, STYLE_URL, type MapStyle } from '../../family/mapStyle';
import { buildPin, refreshPin, type PinData } from '../../family/markers';
import type { Mode } from '../../family/timeline';

export type MapLook = 'night' | 'streets';
/** one person's day on the map: the trips as lines, the places they stayed at as numbered dots */
export interface TrailData {
  hue: number;
  trips: { id: string; path: LatLng[]; mode: Mode }[];
  stays: { id: string; at: LatLng; n: number; ongoing: boolean; r: number }[];
  selected: string;
}
export interface MapApi {
  fly(p: LatLng, zoom?: number): void;
  trail(t: TrailData | null): void;
  fit(points: LatLng[], bottom?: number): void;
  tilt(on: boolean): void;
  north(): void;
}
interface Props {
  /** globe = the turning earth of the first page; room = the flat, detailed map of a room */
  variant: 'globe' | 'room';
  look: MapLook;
  pins: PinData[];
  onPin?: (id: string) => void;
  onStay?: (id: string) => void;
  onReady?: () => void;
  onFail?: () => void;
  apiRef?: React.MutableRefObject<MapApi | null>;
  className?: string;
}
interface Live { marker: GlMarker; el: HTMLElement; from: LatLng; to: LatLng; t0: number }

// The map's code (about 280 KB packed) and the style are fetched only when a map is shown. The style is asked for once per visit.
let baseStyle: Promise<MapStyle | null> | null = null;
function loadBase(): Promise<MapStyle | null> {
  if (!baseStyle) {
    const ctl = new AbortController(), timer = window.setTimeout(() => ctl.abort(), 9000);
    baseStyle = fetch(STYLE_URL, { signal: ctl.signal }).then((r) => (r.ok ? (r.json() as Promise<MapStyle>) : null)).catch(() => null).finally(() => window.clearTimeout(timer));
    void baseStyle.then((s) => { if (!s) baseStyle = null; });
  }
  return baseStyle;
}
async function styleFor(look: MapLook): Promise<MapStyle> {
  const base = await loadBase();
  if (!base) return fallbackStyle(look === 'night');
  return look === 'night' ? nightStyle(base) : base;
}
const reduced = (): boolean => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export const MapCanvas: React.FC<Props> = (props) => {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GlMap | null>(null);
  const libRef = useRef<any>(null);
  const pins = useRef(new Map<string, Live>());
  const stays = useRef(new Map<string, GlMarker>());
  const trailNow = useRef<TrailData | null>(null);
  const raf = useRef(0);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = React.useState(false);

  // ---- the map itself (made once)
  useEffect(() => {
    let dead = false, spinRaf = 0, idleTimer = 0, paused = false;
    (async () => {
      try {
        const [mod, style, worker] = await Promise.all([import('maplibre-gl'), styleFor(latest.current.look), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')]);
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (dead || !box.current) return;
        const gl: any = (mod as any).default ?? mod;
        // the map's worker is a file of its own: the library looks for it next to itself, which is wrong once the build has renamed and moved the library, so it is told where the file really is
        gl.setWorkerUrl(worker.default);
        libRef.current = gl;
        const globe = latest.current.variant === 'globe', el = box.current;
        const zoom0 = globe ? Math.max(0.2, Math.log2((Math.min(el.clientWidth, el.clientHeight) * 0.92 * Math.PI) / 512)) : 2;
        const map: GlMap = new gl.Map({
          container: el, style, center: globe ? [20, 18] : [0, 20], zoom: zoom0, attributionControl: false, pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          maxPitch: 72, fadeDuration: 120, dragRotate: !globe, pitchWithRotate: !globe, touchPitch: !globe, renderWorldCopies: !globe
        });
        mapRef.current = map;
        const credit = new gl.AttributionControl({ compact: true });
        map.addControl(credit, globe ? 'bottom-right' : 'bottom-left');
        // the credits (they must stay reachable: the (i) button) start open and fold themselves away after a few seconds, so they do not sit on the picture
        window.setTimeout(() => { try { (credit as any)._container?.classList.remove('maplibregl-compact-show'); (credit as any)._container?.removeAttribute('open'); } catch { /* the button still works */ } }, 3500);
        const look = (): void => {
          const g = latest.current.variant === 'globe';
          try {
            map.setProjection({ type: g ? 'globe' : 'mercator' } as any);
            map.setSky((latest.current.look === 'night' ? SKY_NIGHT : { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] }) as any);
          } catch { /* an older graphics chip: the flat map is fine */ }
        };
        map.on('style.load', look);
        map.once('load', () => { if (!dead) { setReady(true); latest.current.onReady?.(); } });
        map.on('error', (e: any) => { if (/WebGL|context/i.test(String(e?.error?.message || ''))) latest.current.onFail?.(); });
        // the globe turns by itself until a finger touches it, and goes on again a few seconds after
        if (globe && !reduced()) {
          let last = performance.now();
          const stop = (): void => { paused = true; window.clearTimeout(idleTimer); idleTimer = window.setTimeout(() => { paused = false; }, 5000); };
          map.on('mousedown', stop); map.on('touchstart', stop); map.on('wheel', stop);
          const spin = (now: number): void => {
            const dt = Math.min(0.1, (now - last) / 1000); last = now;
            if (!paused && !document.hidden && map.getZoom() < 4) { const c = map.getCenter(); map.jumpTo({ center: [c.lng + dt * 5, c.lat] }); }
            spinRaf = requestAnimationFrame(spin);
          };
          spinRaf = requestAnimationFrame(spin);
        }
        // the route of one person's day: lines for the trips (dashed on foot), numbered dots for the places; drawn again whenever the style is replaced
        const SRC = 'fm-trail';
        const paintTrail = (): void => {
          stays.current.forEach((m) => m.remove()); stays.current.clear();
          const t = trailNow.current;
          try {
            const data: any = { type: 'FeatureCollection', features: (t?.trips ?? []).filter((x) => x.path.length > 1).map((x) => ({ type: 'Feature', properties: { id: x.id, sel: x.id === t?.selected ? 1 : 0, mode: x.mode, color: `hsl(${t?.hue ?? 200} 85% 64%)` }, geometry: { type: 'LineString', coordinates: x.path.map((p) => [p.lng, p.lat]) } })) };
            const src: any = map.getSource(SRC);
            if (src) src.setData(data);
            else if (t) {
              const width: any = ['case', ['==', ['get', 'sel'], 1], 6, 4];
              map.addSource(SRC, { type: 'geojson', data });
              map.addLayer({ id: 'fm-trail-casing', type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#050816', 'line-opacity': 0.8, 'line-width': ['case', ['==', ['get', 'sel'], 1], 9, 7] } } as any);
              map.addLayer({ id: 'fm-trail-line', type: 'line', source: SRC, filter: ['!=', ['get', 'mode'], 'w'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': width } } as any);
              map.addLayer({ id: 'fm-trail-walk', type: 'line', source: SRC, filter: ['==', ['get', 'mode'], 'w'], layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-dasharray': [1.2, 1.4], 'line-width': width } } as any);
            }
          } catch { /* the style is still loading: it is drawn again when it is ready */ }
          if (!t) return;
          for (const s of t.stays) {
            const el = document.createElement('div');
            el.className = `fm-stay${s.id === t.selected ? ' is-sel' : ''}${s.ongoing ? ' is-now' : ''}`;
            el.style.setProperty('--hue', String(t.hue));
            el.textContent = String(s.n);
            el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', `Place ${s.n}`);
            const tap = (e: Event): void => { e.stopPropagation(); latest.current.onStay?.(s.id); };
            el.addEventListener('click', tap);
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') tap(e); });
            stays.current.set(s.id, new gl.Marker({ element: el, anchor: 'center' }).setLngLat([s.at.lng, s.at.lat]).addTo(map));
          }
        };
        map.on('style.load', paintTrail);
        const api: MapApi = {
          trail: (t) => { trailNow.current = t; paintTrail(); },
          fly: (p, z) => map.flyTo({ center: [p.lng, p.lat], zoom: z ?? Math.max(map.getZoom(), 14.5), speed: 1.2, curve: 1.5, essential: true }),
          fit: (pts, bottom = 220) => {
            const b = boundsOf(pts);
            if (!b) return;
            if (pts.length === 1 || distanceM({ lng: b[0][0], lat: b[0][1] }, { lng: b[1][0], lat: b[1][1] }) < 30) { api.fly(pts[0], 15.5); return; }
            map.fitBounds(b, { padding: { top: 110, bottom, left: 56, right: 56 }, maxZoom: 16.5, duration: 1200, essential: true });
          },
          tilt: (on) => map.easeTo({ pitch: on ? 62 : 0, duration: 700 }),
          north: () => map.easeTo({ bearing: 0, pitch: 0, duration: 600 })
        };
        if (latest.current.apiRef) latest.current.apiRef.current = api;
      } catch {
        if (!dead) latest.current.onFail?.();
      }
    })();
    return () => {
      dead = true; cancelAnimationFrame(spinRaf); cancelAnimationFrame(raf.current); window.clearTimeout(idleTimer);
      pins.current.forEach((l) => l.marker.remove()); pins.current.clear();
      stays.current.forEach((m) => m.remove()); stays.current.clear();
      try { mapRef.current?.remove(); } catch { /* already gone */ }
      mapRef.current = null;
      if (latest.current.apiRef) latest.current.apiRef.current = null;
    };
  }, []);

  // ---- the look (night / streets) changes while the map stays where it is
  const firstLook = useRef(props.look);
  useEffect(() => {
    if (!ready || firstLook.current === props.look) return;
    firstLook.current = props.look;
    let off = false;
    void styleFor(props.look).then((s) => { if (!off && mapRef.current) mapRef.current.setStyle(s as any, { diff: false }); });
    return () => { off = true; };
  }, [props.look, ready]);

  // ---- the pins: new ones appear, known ones glide to their new place, gone ones leave
  useEffect(() => {
    const map = mapRef.current, gl = libRef.current;
    if (!ready || !map || !gl) return;
    const seen = new Set<string>();
    for (const d of props.pins) {
      seen.add(d.id);
      const to = { lat: d.lat, lng: d.lng };
      const have = pins.current.get(d.id);
      if (!have) {
        const el = buildPin(d, (id) => latest.current.onPin?.(id));
        const marker: GlMarker = new gl.Marker({ element: el, anchor: 'center' }).setLngLat([to.lng, to.lat]).addTo(map);
        pins.current.set(d.id, { marker, el, from: to, to, t0: 0 });
      } else {
        refreshPin(have.el, d);
        const cur = have.marker.getLngLat();
        if (cur.lat !== to.lat || cur.lng !== to.lng) {
          have.from = { lat: cur.lat, lng: cur.lng }; have.to = to; have.t0 = performance.now();
          if (distanceM(have.from, to) > 50000) { have.marker.setLngLat([to.lng, to.lat]); have.t0 = 0; }
        }
      }
    }
    pins.current.forEach((l, id) => { if (!seen.has(id)) { l.marker.remove(); pins.current.delete(id); } });
    cancelAnimationFrame(raf.current);
    const tick = (now: number): void => {
      let moving = false;
      pins.current.forEach((l) => {
        if (!l.t0) return;
        const k = (now - l.t0) / 1500;
        if (k >= 1) { l.marker.setLngLat([l.to.lng, l.to.lat]); l.t0 = 0; return; }
        const p = lerpLngLat(l.from, l.to, easeOut(k));
        l.marker.setLngLat([p.lng, p.lat]); moving = true;
      });
      raf.current = moving ? requestAnimationFrame(tick) : 0;
    };
    raf.current = requestAnimationFrame(tick);
  }, [props.pins, ready]);

  return <div ref={box} className={props.className} />;
};

export default MapCanvas;
