import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin } from 'lucide-react';
import type { Pin } from './orderTracking';
import { SHOP_LAT, SHOP_LNG } from './ShopMap';

interface LocationPickerProps {
  value: Pin | null;
  onChange: (pin: Pin) => void;
}

// A pin like the delivery apps use: a green drop with a white dot (drawn here, so no image files are needed).
const PIN_HTML =
  '<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg"><path d="M20 51C20 51 3 32.5 3 19a17 17 0 0 1 34 0c0 13.5-17 32-17 32z" fill="#0c831f" stroke="#ffffff" stroke-width="3"/><circle cx="20" cy="19" r="7" fill="#ffffff"/></svg>';

export const pinIcon = () => L.divIcon({ className: 'noob-pin', html: PIN_HTML, iconSize: [40, 52], iconAnchor: [20, 50] });

// Places the person's exact spot on a map: tap the map or press "Use my current location" to drop the pin, then drag the pin to
// the exact door. Plain Leaflet + OpenStreetMap (no key or billing).
export const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange }) => {
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // build the map once
  useEffect(() => {
    if (!box.current || map.current) return;
    const start = value ?? { lat: SHOP_LAT, lng: SHOP_LNG };
    const m = L.map(box.current, { center: [start.lat, start.lng], zoom: value ? 17 : 13, scrollWheelZoom: false });
    map.current = m;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(m);

    const place = (lat: number, lng: number, fly = false) => {
      if (marker.current) marker.current.setLatLng([lat, lng]);
      else {
        marker.current = L.marker([lat, lng], { draggable: true, icon: pinIcon(), autoPan: true }).addTo(m);
        marker.current.on('dragend', () => {
          const p = marker.current!.getLatLng();
          onChangeRef.current({ lat: p.lat, lng: p.lng });
        });
      }
      if (fly) m.setView([lat, lng], Math.max(m.getZoom(), 17), { animate: true });
    };
    (m as any)._placePin = place;
    if (value) place(value.lat, value.lng);
    m.on('click', (e: L.LeafletMouseEvent) => {
      place(e.latlng.lat, e.latlng.lng);
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    // the map sits in a window that is still opening: measure it again once it has its size
    const t = window.setTimeout(() => m.invalidateSize(), 250);
    return () => {
      window.clearTimeout(t);
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the pin moved from outside (for example "use my current location")
  useEffect(() => {
    if (!map.current || !value) return;
    const at = marker.current?.getLatLng();
    if (!at || Math.abs(at.lat - value.lat) > 1e-7 || Math.abs(at.lng - value.lng) > 1e-7) (map.current as any)._placePin(value.lat, value.lng, true);
  }, [value?.lat, value?.lng]);

  const useMyLocation = () => {
    setMessage(null);
    if (!navigator.geolocation) {
      setMessage('This device can not tell where you are. Tap the map to place the pin.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChangeRef.current({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setMessage(err.code === 1 ? 'Location is switched off for this site. Allow it in your browser, or tap the map to place the pin.' : 'Could not find your location. Tap the map to place the pin.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  return (
    <div className="space-y-2">
      <style>{`.noob-pin { background: transparent; border: 0; filter: drop-shadow(0 3px 4px rgba(0,0,0,.45)); }`}</style>
      <div className="relative rounded-2xl overflow-hidden border border-zinc-700">
        <div ref={box} className="w-full h-56 sm:h-64 bg-zinc-900" />
        {!value && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
            <span className="text-[11px] font-bold text-white bg-black/75 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#00FF66]" /> Tap the map to drop the pin
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="absolute bottom-2 left-2 z-[500] flex items-center gap-1.5 px-3 py-2 rounded-full bg-white text-[#0c831f] text-[11px] font-black shadow-lg cursor-pointer disabled:opacity-60"
        >
          <LocateFixed className="w-3.5 h-3.5" /> {locating ? 'Finding you…' : 'Use my current location'}
        </button>
      </div>
      <p className="text-[10px] text-zinc-400 leading-snug">
        {value ? 'Drag the pin to your exact door. This is the spot the delivery person will see.' : 'Optional, but it helps the delivery person find you.'}
      </p>
      {message && <p className="text-[11px] text-amber-300">{message}</p>}
    </div>
  );
};
