import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fixed pickup location — Divyajivan Residency, Nigam Nagar, Chandkheda,
// Ahmedabad. Coordinates resolved from the Google Maps place link.
export const SHOP_LAT = 23.1122587;
export const SHOP_LNG = 72.5879333;
export const SHOP_ADDRESS = 'Divyajivan Residency, Nigam Nagar, Chandkheda, Ahmedabad, Gujarat 382424';

interface ShopMapProps {
  className?: string;
  // Defaults to Shop NOOB's own pickup spot above — pass these to point the same map (with the
  // same NOOB-logo pin) at a different fixed location instead, e.g. the Food Stall's own pickup spot.
  lat?: number;
  lng?: number;
  address?: string;
  label?: string;
}

// Plain Leaflet + OpenStreetMap tiles (no API key/billing needed, unlike
// the Google Maps JS API) so the pickup marker can use our own logo
// instead of a generic pin.
export const ShopMap: React.FC<ShopMapProps> = ({ className, lat = SHOP_LAT, lng = SHOP_LNG, address = SHOP_ADDRESS, label = 'NOOB' }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 16,
      scrollWheelZoom: false
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    const noobIcon = L.icon({
      iconUrl: '/noob-logo-circle.png',
      iconSize: [46, 46],
      iconAnchor: [23, 46],
      popupAnchor: [0, -46],
      className: 'shop-map-marker'
    });

    L.marker([lat, lng], { icon: noobIcon })
      .addTo(map)
      .bindPopup(`<strong>${label}</strong><br/>${address}`)
      .openPopup();

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`.shop-map-marker { border-radius: 9999px; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.5); background: #0e0e0e; }`}</style>
      <div ref={containerRef} className={className || 'w-full h-56 rounded-2xl overflow-hidden'} />
    </>
  );
};
