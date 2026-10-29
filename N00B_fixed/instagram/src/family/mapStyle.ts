// NOOB Family Map: the look of the map. The pictures of the map come from OpenFreeMap (free, no key, OpenStreetMap data); its "liberty" style is loaded when the map opens and recoloured
// here into a deep-blue night look (streets keeps the original colours, with 3D buildings). If OpenFreeMap cannot be reached, a plain OpenStreetMap picture is used instead.
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

type Obj = Record<string, any>;
export interface MapStyle extends Obj { version: number; layers: Obj[] }

export const NIGHT = {
  space: '#070b1a', land: '#0d1530', landMid: '#121f52', landFar: '#1b2c6e', waterFar: '#040a22', res: '#101a3a', water: '#06173a', green: '#0d2a34', ice: '#1a2652', sand: '#141f46', building: '#18234c', building3d: '#26346b',
  roadMinor: '#222f5f', roadMid: '#2e3f82', roadMajor: '#4259b4', casing: '#080e24', rail: '#27346a', boundary: '#7886ea', label: '#aeb9ea', labelBright: '#e4e9ff', labelWater: '#5f8be6', halo: '#080d22'
};

/** the sky around the globe (the glow of the air); `streets` keeps a lighter one */
export const SKY_NIGHT = {
  'sky-color': '#0a1d63', 'horizon-color': '#5b7cff', 'fog-color': '#070b1a', 'fog-ground-blend': 0.5, 'horizon-fog-blend': 0.6, 'sky-horizon-blend': 0.55,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0]
};

// pictures that only add clutter at this size: shop and place icons, road shields, one-way arrows, the hatching of road areas
const HIDE = /^(poi_|highway-shield|road_shield|road_one_way|road_area_pattern)/;

const fillColour = (id: string): string => {
  if (/water/.test(id)) return NIGHT.water;
  if (/ice/.test(id)) return NIGHT.ice;
  if (/sand/.test(id)) return NIGHT.sand;
  if (/park|wood|grass|wetland|pitch/.test(id)) return NIGHT.green;
  if (/^building/.test(id)) return NIGHT.building;
  if (/residential|hospital|school|cemetery|track|aeroway/.test(id)) return NIGHT.res;
  return NIGHT.land;
};
const lineColour = (id: string): string => {
  if (/waterway/.test(id)) return NIGHT.water;
  if (/^boundary/.test(id)) return NIGHT.boundary;
  if (/casing/.test(id)) return NIGHT.casing;
  if (/rail|transit/.test(id)) return NIGHT.rail;
  if (/motorway|trunk|primary/.test(id) && !/link/.test(id)) return NIGHT.roadMajor;
  if (/motorway|trunk|primary|secondary|tertiary|runway|taxiway/.test(id)) return NIGHT.roadMid;
  if (/park_outline/.test(id)) return NIGHT.green;
  return NIGHT.roadMinor;
};

/** the original style recoloured into the night look (a copy: the original is not changed) */
export function nightStyle(base: MapStyle): MapStyle {
  const s: MapStyle = JSON.parse(JSON.stringify(base));
  for (const l of s.layers) {
    const paint: Obj = (l.paint = l.paint || {}), layout: Obj = (l.layout = l.layout || {});
    if (HIDE.test(l.id)) { layout.visibility = 'none'; continue; }
    switch (l.type) {
      // the land is lighter when the whole earth is in view (so the continents stand out) and settles into the dark map colour as the map zooms in
      case 'background': paint['background-color'] = ['interpolate', ['linear'], ['zoom'], 0, NIGHT.landFar, 5, NIGHT.landMid, 9, NIGHT.land]; break;
      case 'raster': // the shaded relief of the globe: kept faint and dark so mountains and deserts show as a soft texture
        paint['raster-opacity'] = ['interpolate', ['exponential', 1.5], ['zoom'], 0, 0.7, 6, 0.08];
        paint['raster-brightness-max'] = 0.46; paint['raster-saturation'] = -0.5; paint['raster-contrast'] = 0.15;
        break;
      case 'fill': paint['fill-color'] = l.id === 'water' ? ['interpolate', ['linear'], ['zoom'], 0, NIGHT.waterFar, 6, NIGHT.water] : fillColour(l.id); delete paint['fill-outline-color']; delete paint['fill-pattern']; break;
      case 'line': paint['line-color'] = lineColour(l.id); delete paint['line-pattern']; break;
      case 'fill-extrusion': paint['fill-extrusion-color'] = NIGHT.building3d; paint['fill-extrusion-opacity'] = 0.92; paint['fill-extrusion-vertical-gradient'] = true; break;
      case 'symbol': {
        const country = /label_country/.test(l.id), water = /water/.test(l.id);
        paint['text-color'] = country ? NIGHT.labelBright : water ? NIGHT.labelWater : NIGHT.label;
        paint['text-halo-color'] = NIGHT.halo; paint['text-halo-width'] = 1.4; paint['text-halo-blur'] = 0.6;
        if (l['layout'] && 'icon-image' in l['layout']) paint['icon-opacity'] = 0.55;
        break;
      }
      default: break;
    }
  }
  return s;
}

/** a plain OpenStreetMap picture for when OpenFreeMap cannot be reached (darkened for the night look) */
export function fallbackStyle(night: boolean): MapStyle {
  return {
    version: 8,
    sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '&copy; OpenStreetMap contributors' } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': night ? NIGHT.land : '#f4f1ea' } },
      { id: 'osm', type: 'raster', source: 'osm', paint: night ? { 'raster-brightness-max': 0.42, 'raster-saturation': -0.7, 'raster-contrast': 0.2, 'raster-hue-rotate': 200 } : {} }
    ]
  };
}
