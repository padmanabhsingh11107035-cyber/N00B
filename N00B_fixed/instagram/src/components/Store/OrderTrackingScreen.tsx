import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Check, ExternalLink, MapPin, Package, Phone, Store as StoreIcon, Truck } from 'lucide-react';
import { StoreOrder } from '../../types';
import { formatPrice } from './formatPrice';
import { formatAddress } from './ContactFields';
import { SHOP_ADDRESS, SHOP_LAT, SHOP_LNG } from './ShopMap';
import { bill, headline, itemsLabel, mapsLink, pinOf, trackSteps } from './orderTracking';
import { pinIcon } from './LocationPicker';

interface OrderTrackingScreenProps {
  order: StoreOrder;
  // the shop owner looking at a customer's order (shows who ordered and how to call them)
  shopView?: boolean;
  busy?: boolean;
  onClose: () => void;
  onCancel?: (order: StoreOrder) => void;
}

// The colours of quick-delivery apps: a yellow top bar, white cards on light grey, green for everything that is good news.
const YELLOW = '#f8cb46';
const GREEN = '#0c831f';

const clock = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

// The map at the top: the spot the order is going to (the pin the customer placed) and the shop. A pickup order shows the shop.
const OrderMap: React.FC<{ order: StoreOrder }> = ({ order }) => {
  const box = useRef<HTMLDivElement | null>(null);
  const pin = order.deliveryMethod === 'delivery' ? pinOf(order.contact) : null;

  useEffect(() => {
    if (!box.current) return;
    const map = L.map(box.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    const shop = L.marker([SHOP_LAT, SHOP_LNG], {
      icon: L.icon({ iconUrl: '/noob-logo-circle.png', iconSize: [40, 40], iconAnchor: [20, 40], className: 'order-shop-marker' })
    }).addTo(map);
    shop.bindTooltip('Shop NOOB', { direction: 'top', offset: [0, -38] });
    if (pin) {
      const home = L.marker([pin.lat, pin.lng], { icon: pinIcon() }).addTo(map);
      home.bindTooltip('Delivery location', { direction: 'top', offset: [0, -46], permanent: true });
      map.fitBounds(L.latLngBounds([[SHOP_LAT, SHOP_LNG], [pin.lat, pin.lng]]), { padding: [48, 48], maxZoom: 16 });
      if (order.status === 'ready') {
        // on its way: a line from the shop to the door
        L.polyline([[SHOP_LAT, SHOP_LNG], [pin.lat, pin.lng]], { color: GREEN, weight: 4, dashArray: '2 10', lineCap: 'round' }).addTo(map);
      }
    } else {
      map.setView([SHOP_LAT, SHOP_LNG], 16);
    }
    const t = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.clearTimeout(t);
      map.remove();
    };
  }, [order.id, pin?.lat, pin?.lng, order.status, order.deliveryMethod]);

  return (
    <>
      <style>{`.order-shop-marker { border-radius: 9999px; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.4); background: #0e0e0e; } .noob-pin { background: transparent; border: 0; filter: drop-shadow(0 3px 4px rgba(0,0,0,.45)); }`}</style>
      <div ref={box} className="w-full h-56 sm:h-72 bg-[#e9e9e9]" />
    </>
  );
};

const Card: React.FC<{ title?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <section className="bg-white rounded-2xl p-4 shadow-sm border border-black/5">
    {(title || right) && (
      <div className="flex items-center justify-between mb-2.5">
        {title && <h3 className="text-[13px] font-extrabold text-[#1f1f1f]">{title}</h3>}
        {right}
      </div>
    )}
    {children}
  </section>
);

export const OrderTrackingScreen: React.FC<OrderTrackingScreenProps> = ({ order, shopView = false, busy = false, onClose, onCancel }) => {
  const head = headline(order);
  const steps = trackSteps(order);
  const totals = bill(order);
  const pin = pinOf(order.contact);
  const delivery = order.deliveryMethod === 'delivery';
  const address = formatAddress(order.contact);
  const cancelled = order.status === 'cancelled';
  const phone = (order.contact.phone || '').replace(/[^\d+]/g, '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[115] bg-[#f4f4f4] text-[#1f1f1f] overflow-y-auto force-light" role="dialog" aria-modal="true" aria-label={`Order ${order.orderNo}`}>
      {/* top bar */}
      <header className="sticky top-0 z-[600] flex items-center gap-3 px-3 py-3" style={{ background: YELLOW }}>
        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-black/10 cursor-pointer" aria-label="Back">
          <ArrowLeft className="w-5 h-5 text-[#1f1f1f]" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-extrabold leading-tight">Order #{order.orderNo}</h2>
          <p className="text-[11px] text-black/70 leading-tight">{itemsLabel(totals.itemCount)} · {formatPrice(totals.grandTotal)} · {clock(order.createdAt)}</p>
        </div>
        <span
          className="text-[10px] font-extrabold px-2.5 py-1 rounded-full shrink-0"
          style={cancelled ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#fff', color: GREEN }}
        >
          {steps.find((s) => s.state === 'current')?.label || (cancelled ? 'Cancelled' : head.title)}
        </span>
      </header>

      <OrderMap order={order} />

      <div className="relative -mt-5 rounded-t-3xl bg-[#f4f4f4] px-3 pt-4 pb-10 space-y-3 max-w-2xl mx-auto">
        {/* status + steps */}
        <Card>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: cancelled ? '#fee2e2' : '#e7f6ea' }}>
              {delivery ? <Truck className="w-5 h-5" style={{ color: cancelled ? '#b91c1c' : GREEN }} /> : <StoreIcon className="w-5 h-5" style={{ color: cancelled ? '#b91c1c' : GREEN }} />}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold leading-tight">{head.title}</h1>
              <p className="text-xs text-black/60 mt-0.5">{head.subtitle}</p>
            </div>
          </div>

          <ol className="mt-4 space-y-0">
            {steps.map((s, i) => {
              const last = i === steps.length - 1;
              const done = s.state === 'done';
              const current = s.state === 'current';
              return (
                <li key={s.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 ${current ? 'animate-pulse' : ''}`}
                      style={done ? { background: GREEN, borderColor: GREEN } : current ? { background: '#fff', borderColor: GREEN } : { background: '#fff', borderColor: '#d4d4d4' }}
                    >
                      {done ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /> : current ? <span className="w-2 h-2 rounded-full" style={{ background: GREEN }} /> : null}
                    </span>
                    {!last && <span className="w-0.5 flex-1 min-h-[22px]" style={{ background: done ? GREEN : '#e2e2e2' }} />}
                  </div>
                  <div className="pb-3 -mt-0.5">
                    <p className={`text-[13px] font-bold leading-tight ${s.state === 'todo' ? 'text-black/40' : 'text-[#1f1f1f]'}`}>{s.label}</p>
                    {s.at && <p className="text-[11px] text-black/50">{clock(s.at)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          {cancelled && <p className="text-xs text-[#b91c1c] font-semibold mt-1">{head.subtitle}</p>}
        </Card>

        {/* where */}
        <Card
          title={delivery ? 'Delivering to' : 'Pick up from'}
          right={
            (delivery && pin) || !delivery ? (
              <a
                href={delivery && pin ? mapsLink(pin) : `https://www.google.com/maps?q=${SHOP_LAT},${SHOP_LNG}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-extrabold"
                style={{ color: GREEN }}
              >
                Open in Maps <ExternalLink className="w-3 h-3" />
              </a>
            ) : undefined
          }
        >
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 mt-0.5 shrink-0" style={{ color: GREEN }} />
            <div className="min-w-0 text-[13px] leading-snug">
              {delivery ? (
                <>
                  <p className="font-bold">{order.contact.fullName || 'Delivery address'}</p>
                  <p className="text-black/70">{address || 'No address'}</p>
                  {order.contact.landmark && <p className="text-black/50 text-xs mt-0.5">Landmark: {order.contact.landmark}</p>}
                  {order.contact.deliveryNotes && <p className="text-black/50 text-xs mt-0.5">Note for delivery: {order.contact.deliveryNotes}</p>}
                  {pin ? (
                    <p className="text-[11px] mt-1.5 font-semibold" style={{ color: GREEN }}>📍 Exact location pinned on the map ({pin.lat.toFixed(5)}, {pin.lng.toFixed(5)})</p>
                  ) : (
                    <p className="text-[11px] mt-1.5 text-black/40">No map pin was added for this address.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-bold">Shop NOOB</p>
                  <p className="text-black/70">{SHOP_ADDRESS}</p>
                </>
              )}
            </div>
          </div>
          {(delivery || shopView) && order.contact.phone && (
            <a href={`tel:${phone}`} className="mt-3 flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl bg-[#f4f4f4] w-fit">
              <Phone className="w-3.5 h-3.5" style={{ color: GREEN }} />
              {order.contact.phone}
              {order.contact.altPhone ? ` · ${order.contact.altPhone}` : ''}
            </a>
          )}
          {shopView && order.customer && (
            <p className="mt-2 text-[11px] text-black/60">
              Ordered by <b>{order.contact.fullName || order.customer.displayName || order.customer.username}</b> (@{order.customer.username})
            </p>
          )}
        </Card>

        {/* what */}
        <Card title="Your order" right={<span className="text-[11px] text-black/50 font-semibold">{itemsLabel(totals.itemCount)}</span>}>
          <div className="space-y-3">
            {order.items.map((it, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#f4f4f4] border border-black/5 shrink-0 flex items-center justify-center">
                  {it.image ? <img src={it.image} alt="" className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-black/30" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold leading-snug line-clamp-2">{it.name}</p>
                  {it.variantLabel && <p className="text-[11px] text-black/50 line-clamp-1">{it.variantLabel}</p>}
                  <p className="text-[11px] text-black/50">{it.quantity} × {formatPrice(it.unitPrice)}</p>
                </div>
                <span className="text-[13px] font-extrabold shrink-0">{formatPrice(it.unitPrice * it.quantity)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* bill */}
        <Card title="Bill details">
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between text-black/70"><span>Item total</span><span>{formatPrice(totals.itemsTotal)}</span></div>
            {delivery && (
              <div className="flex justify-between text-black/70">
                <span>Delivery charge</span>
                {totals.delivery > 0 ? <span>{formatPrice(totals.delivery)}</span> : <span className="font-bold" style={{ color: GREEN }}>FREE</span>}
              </div>
            )}
            <div className="flex justify-between font-extrabold text-[15px] pt-2 border-t border-dashed border-black/15">
              <span>Grand total</span>
              <span>{formatPrice(totals.grandTotal)}</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] rounded-lg px-3 py-2 font-semibold" style={{ background: '#e7f6ea', color: GREEN }}>
            Pay {delivery ? 'when your order is delivered' : 'when you pick it up'}. There is no online payment.
          </p>
        </Card>

        {/* order details */}
        <Card title="Order details">
          <dl className="space-y-2.5 text-[12px]">
            <div><dt className="text-black/45">Order ID</dt><dd className="font-bold">#{order.orderNo}</dd></div>
            <div><dt className="text-black/45">Placed on</dt><dd className="font-bold">{clock(order.createdAt)}</dd></div>
            <div><dt className="text-black/45">Payment</dt><dd className="font-bold">{delivery ? 'Pay on delivery' : 'Pay at pickup'}</dd></div>
            <div><dt className="text-black/45">Way of getting it</dt><dd className="font-bold">{delivery ? 'Home delivery' : 'Pickup from the shop'}</dd></div>
            {order.note && <div><dt className="text-black/45">Your note</dt><dd className="font-bold">{order.note}</dd></div>}
          </dl>
        </Card>

        {!shopView && order.status === 'placed' && onCancel && (
          <button
            type="button"
            onClick={() => onCancel(order)}
            disabled={busy}
            className="w-full py-3.5 rounded-2xl border-2 text-sm font-extrabold cursor-pointer disabled:opacity-50 bg-white"
            style={{ borderColor: '#d92d20', color: '#d92d20' }}
          >
            Cancel order
          </button>
        )}
        {!shopView && order.status === 'confirmed' && (
          <p className="text-[11px] text-black/50 text-center px-4">The shop has confirmed this order. To change it, please contact the shop.</p>
        )}
      </div>
    </div>
  );
};
