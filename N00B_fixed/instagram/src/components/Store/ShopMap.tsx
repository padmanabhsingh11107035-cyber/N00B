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
}

// Plain Leaflet + OpenStreetMap tiles (no API key/billing needed, unlike
// the Google Maps JS API) so the pickup marker can use our own logo
// instead of a generic pin.
export const ShopMap: React.FC<ShopMapProps> = ({ className }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [SHOP_LAT, SHOP_LNG],
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

    L.marker([SHOP_LAT, SHOP_LNG], { icon: noobIcon })
      .addTo(map)
      .bindPopup(`<strong>NOOB</strong><br/>${SHOP_ADDRESS}`)
      .openPopup();

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <>
      <style>{`.shop-map-marker { border-radius: 9999px; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.5); background: #0e0e0e; }`}</style>
      <div ref={containerRef} className={className || 'w-full h-56 rounded-2xl overflow-hidden'} />
    </>
  );
};
