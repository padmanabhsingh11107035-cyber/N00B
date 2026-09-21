// What the order screen shows, worked out from an order: the steps of its journey, the headline, the map link and the bill.
// Pure functions, so they can be tested without a browser.
import type { StoreOrder, StoreOrderStatus } from '../../types';

export type StepKey = 'placed' | 'confirmed' | 'ready' | 'completed';

export interface TrackStep {
  key: StepKey;
  label: string;
  state: 'done' | 'current' | 'todo';
  at?: string; // when the order reached this step
}

const ORDER: StepKey[] = ['placed', 'confirmed', 'ready', 'completed'];

const stepLabel = (key: StepKey, method: 'pickup' | 'delivery'): string => {
  switch (key) {
    case 'placed': return 'Order placed';
    case 'confirmed': return 'Order confirmed';
    case 'ready': return method === 'pickup' ? 'Ready for pickup' : 'Out for delivery';
    default: return method === 'pickup' ? 'Picked up' : 'Delivered';
  }
};

// The four steps of an order's journey, each done, current or still to come, with the time it was reached. A cancelled order shows the
// steps it reached and then stops.
export function trackSteps(order: Pick<StoreOrder, 'status' | 'deliveryMethod' | 'statusHistory'>): TrackStep[] {
  const reached = new Map<string, string>();
  for (const h of order.statusHistory || []) if (!reached.has(h.status)) reached.set(h.status, h.at);
  const at = order.status === 'cancelled' ? -1 : ORDER.indexOf(order.status as StepKey);
  return ORDER.map((key, i) => {
    let state: TrackStep['state'];
    if (order.status === 'cancelled') state = reached.has(key) ? 'done' : 'todo';
    else if (i < at) state = 'done';
    else if (i === at) state = order.status === 'completed' ? 'done' : 'current';
    else state = 'todo';
    return { key, label: stepLabel(key, order.deliveryMethod), state, at: reached.get(key) };
  });
}

// The big words at the top of the order screen, and the small line under them.
export function headline(order: Pick<StoreOrder, 'status' | 'deliveryMethod' | 'cancelledBy' | 'cancelReason'>): { title: string; subtitle: string } {
  const pickup = order.deliveryMethod === 'pickup';
  switch (order.status as StoreOrderStatus) {
    case 'placed': return { title: 'Order placed', subtitle: 'Waiting for the shop to confirm your order.' };
    case 'confirmed': return { title: 'Order confirmed', subtitle: 'The shop is getting your order ready.' };
    case 'ready': return pickup
      ? { title: 'Ready for pickup', subtitle: 'Your order is ready. Please collect it from the shop.' }
      : { title: 'Out for delivery', subtitle: 'Your order is on its way to your location.' };
    case 'completed': return pickup
      ? { title: 'Picked up', subtitle: 'Thank you for shopping with NOOB!' }
      : { title: 'Delivered', subtitle: 'Thank you for shopping with NOOB!' };
    default: return {
      title: 'Order cancelled',
      subtitle: `Cancelled by ${order.cancelledBy === 'shop' ? 'the shop' : 'the customer'}${order.cancelReason ? `: ${order.cancelReason}` : '.'}`
    };
  }
}

export interface Pin { lat: number; lng: number }

const inRange = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

// The exact spot an address (or order) carries on the map, when it has one.
export function pinOf(contact: { lat?: unknown; lng?: unknown } | null | undefined): Pin | null {
  if (!contact) return null;
  return inRange(contact.lat, -90, 90) && inRange(contact.lng, -180, 180) ? { lat: contact.lat, lng: contact.lng } : null;
}

// A link that opens the spot in the person's maps app.
export function mapsLink(pin: Pin): string {
  return `https://www.google.com/maps?q=${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`;
}

export interface Bill {
  itemCount: number; // how many things (counting quantities)
  itemsTotal: number;
  delivery: number;
  grandTotal: number;
}

export function bill(order: Pick<StoreOrder, 'items' | 'subtotal' | 'deliveryFee' | 'total' | 'deliveryMethod'>): Bill {
  const itemCount = order.items.reduce((n, it) => n + (Number(it.quantity) || 0), 0);
  return { itemCount, itemsTotal: order.subtotal, delivery: order.deliveryMethod === 'delivery' ? order.deliveryFee : 0, grandTotal: order.total };
}

// "3 items" / "1 item"
export const itemsLabel = (n: number): string => `${n} item${n === 1 ? '' : 's'}`;
