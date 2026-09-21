import React, { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardList, Loader2, MapPin, Package, Phone, RefreshCw, Store as StoreIcon, Truck, X } from 'lucide-react';
import { StoreOrder, StoreOrderStatus } from '../../types';
import { cancelMyStoreOrder, fetchAdminStoreOrders, fetchMyStoreOrders, setStoreOrderStatus } from '../../services/api';
import { formatPrice } from './formatPrice';
import { formatAddress } from './ContactFields';
import { OrderTrackingScreen } from './OrderTrackingScreen';
import { pinOf } from './orderTracking';

interface OrdersViewProps {
  // may see and handle everyone's orders (shop managers)
  canManage: boolean;
  onOrdersChanged?: () => void;
}

const STATUS_STYLE: Record<StoreOrderStatus, string> = {
  placed: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  confirmed: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  ready: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  completed: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  cancelled: 'text-red-300 bg-red-500/10 border-red-500/30'
};

export const statusLabel = (o: Pick<StoreOrder, 'status' | 'deliveryMethod'>): string => {
  switch (o.status) {
    case 'placed': return 'Order placed';
    case 'confirmed': return 'Confirmed';
    case 'ready': return o.deliveryMethod === 'pickup' ? 'Ready for pickup' : 'Out for delivery';
    case 'completed': return 'Completed';
    default: return 'Cancelled';
  }
};

// What the shop presses next, and the wording of that button.
const nextStep = (o: StoreOrder): { status: StoreOrderStatus; label: string } | null => {
  if (o.status === 'placed') return { status: 'confirmed', label: 'Confirm order' };
  if (o.status === 'confirmed') return { status: 'ready', label: o.deliveryMethod === 'pickup' ? 'Ready for pickup' : 'Out for delivery' };
  if (o.status === 'ready') return { status: 'completed', label: o.deliveryMethod === 'pickup' ? 'Handed over' : 'Delivered' };
  return null;
};

const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const OrderCard: React.FC<{
  order: StoreOrder;
  shopView: boolean;
  busy: boolean;
  onCustomerCancel: (o: StoreOrder) => void;
  onShopStep: (o: StoreOrder, status: StoreOrderStatus, reason?: string) => void;
  onOpen: (o: StoreOrder) => void;
}> = ({ order, shopView, busy, onCustomerCancel, onShopStep, onOpen }) => {
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState('');
  const step = nextStep(order);
  const address = formatAddress(order.contact);
  const open = order.status !== 'completed' && order.status !== 'cancelled';

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black text-white">Order #{order.orderNo}</p>
          <p className="text-[11px] text-zinc-500">{when(order.createdAt)}</p>
        </div>
        <span className={`text-[10px] font-bold border px-2 py-1 rounded-full shrink-0 ${STATUS_STYLE[order.status]}`}>{statusLabel(order)}</span>
      </div>

      {shopView && order.customer && (
        <p className="text-[11px] text-zinc-400">
          From <span className="font-bold text-zinc-200">{order.contact.fullName || order.customer.displayName || order.customer.username}</span> (@{order.customer.username})
        </p>
      )}

      <div className="space-y-2">
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-900 shrink-0 flex items-center justify-center">
              {it.image ? <img src={it.image} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-zinc-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-200 line-clamp-1">{it.name}</p>
              {it.variantLabel && <p className="text-[10px] text-zinc-500 line-clamp-1">{it.variantLabel}</p>}
            </div>
            <span className="text-[11px] text-zinc-400 shrink-0">
              {it.quantity} × {formatPrice(it.unitPrice)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800 pt-2 space-y-1 text-[11px]">
        <div className="flex justify-between text-zinc-400">
          <span>Subtotal</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        {order.deliveryMethod === 'delivery' && (
          <div className="flex justify-between text-zinc-400">
            <span>Delivery charge</span>
            <span>{order.deliveryFee > 0 ? formatPrice(order.deliveryFee) : 'Free'}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-black text-white pt-0.5">
          <span>Total (pay {order.deliveryMethod === 'pickup' ? 'at pickup' : 'on delivery'})</span>
          <span>{formatPrice(order.total)}</span>
        </div>
      </div>

      <div className="text-[11px] text-zinc-400 space-y-1">
        <p className="flex items-center gap-1.5">
          {order.deliveryMethod === 'pickup' ? <StoreIcon className="w-3.5 h-3.5 text-zinc-500" /> : <Truck className="w-3.5 h-3.5 text-zinc-500" />}
          {order.deliveryMethod === 'pickup' ? 'Pickup from the shop' : 'Home delivery'}
        </p>
        {order.deliveryMethod === 'delivery' && address && (
          <p className="flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
            <span>{address}</span>
          </p>
        )}
        {(shopView || order.deliveryMethod === 'delivery') && order.contact.phone && (
          <p className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-zinc-500" />
            <span>
              {order.contact.phone}
              {order.contact.altPhone ? ` · ${order.contact.altPhone}` : ''}
            </span>
          </p>
        )}
        {order.contact.deliveryNotes && <p className="text-zinc-500">Note: {order.contact.deliveryNotes}</p>}
        {order.status === 'cancelled' && (
          <p className="text-red-300/90">
            Cancelled by {order.cancelledBy === 'shop' ? 'the shop' : 'the customer'}
            {order.cancelReason ? ` — ${order.cancelReason}` : ''}
          </p>
        )}
      </div>

      {/* the full order screen: map, steps, items and bill */}
      <button
        onClick={() => onOpen(order)}
        className="w-full py-2 rounded-xl border border-[#00FF66]/40 text-[#00FF66] text-[11px] font-bold hover:bg-[#00FF66]/10 cursor-pointer flex items-center justify-center gap-1.5"
      >
        <MapPin className="w-3.5 h-3.5" /> {order.deliveryMethod === 'delivery' && pinOf(order.contact) ? 'Track order & see location' : 'View order details'}
      </button>

      {/* Customer: may cancel until the shop confirms */}
      {!shopView && order.status === 'placed' && (
        <button
          onClick={() => onCustomerCancel(order)}
          disabled={busy}
          className="w-full py-2 rounded-xl border border-red-500/40 text-red-300 text-[11px] font-bold hover:bg-red-500/10 cursor-pointer disabled:opacity-50"
        >
          Cancel order
        </button>
      )}
      {!shopView && order.status === 'confirmed' && <p className="text-[10px] text-zinc-500">The shop has confirmed this order. To change it, please contact the shop.</p>}

      {/* Shop: move the order along, or cancel it */}
      {shopView && open && (
        <div className="space-y-2">
          {!askReason ? (
            <div className="flex gap-2">
              {step && (
                <button
                  onClick={() => onShopStep(order, step.status)}
                  disabled={busy}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-[11px] font-bold cursor-pointer hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> {step.label}
                </button>
              )}
              <button
                onClick={() => setAskReason(true)}
                disabled={busy}
                className="px-3 py-2 rounded-xl border border-red-500/40 text-red-300 text-[11px] font-bold hover:bg-red-500/10 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                placeholder="Reason (the customer will see it) — optional"
                className="w-full bg-zinc-900 text-xs text-white p-2.5 rounded-lg border border-zinc-700 outline-none focus:border-red-400/60"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onShopStep(order, 'cancelled', reason)}
                  disabled={busy}
                  className="flex-1 py-2 rounded-xl bg-red-500/80 text-white text-[11px] font-bold cursor-pointer hover:bg-red-500 disabled:opacity-50"
                >
                  Cancel this order
                </button>
                <button onClick={() => setAskReason(false)} className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 text-[11px] font-bold cursor-pointer hover:border-zinc-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-zinc-600">Cancelling puts the items back in stock and tells the customer.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type Tab = 'mine' | 'shop';
type ShopFilter = 'open' | 'all' | 'completed' | 'cancelled';

export const OrdersView: React.FC<OrdersViewProps> = ({ canManage, onOrdersChanged }) => {
  const [tab, setTab] = useState<Tab>('mine');
  const [shopFilter, setShopFilter] = useState<ShopFilter>('open');
  const [mine, setMine] = useState<StoreOrder[]>([]);
  const [shopOrders, setShopOrders] = useState<StoreOrder[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [m, s] = await Promise.all([fetchMyStoreOrders(), canManage ? fetchAdminStoreOrders() : Promise.resolve(null)]);
    if (m.success) setMine(m.orders);
    else setError(m.error || 'Could not load your orders.');
    if (s) {
      if (s.success) {
        setShopOrders(s.orders);
        setOpenCount(s.openCount);
      } else setError(s.error || 'Could not load the shop orders.');
    }
    setLoading(false);
  }, [canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (list: StoreOrder[], next: StoreOrder) => list.map((o) => (o.id === next.id ? { ...next, customer: next.customer ?? o.customer } : o));

  const customerCancel = async (o: StoreOrder) => {
    if (!window.confirm(`Cancel order #${o.orderNo}?`)) return;
    setBusyId(o.id);
    setError(null);
    const res = await cancelMyStoreOrder(o.id);
    setBusyId(null);
    if (res.success && res.order) {
      setMine((prev) => replace(prev, res.order!));
      onOrdersChanged?.();
    } else setError(res.error || 'Could not cancel the order.');
  };

  const shopStep = async (o: StoreOrder, status: StoreOrderStatus, reason?: string) => {
    setBusyId(o.id);
    setError(null);
    const res = await setStoreOrderStatus(o.id, status, reason);
    setBusyId(null);
    if (res.success && res.order) {
      setShopOrders((prev) => replace(prev, res.order!));
      setMine((prev) => replace(prev, res.order!));
      setOpenCount((c) => c + (['completed', 'cancelled'].includes(status) ? -1 : 0));
      onOrdersChanged?.();
    } else {
      setError(res.error || 'Could not update the order.');
      load();   // somebody else may have changed it: show what it is now
    }
  };

  const shopShown = shopOrders.filter((o) =>
    shopFilter === 'all' ? true : shopFilter === 'open' ? ['placed', 'confirmed', 'ready'].includes(o.status) : o.status === shopFilter
  );
  const list = tab === 'mine' ? mine : shopShown;
  // the order screen always shows the newest version of the order (a change made while it is open shows straight away)
  const tracking = trackingId ? [...mine, ...shopOrders].find((o) => o.id === trackingId) ?? null : null;

  return (
    <div className="max-w-lg mx-auto space-y-3">
      <div className="flex items-center gap-2">
        {canManage ? (
          <div className="flex-1 grid grid-cols-2 gap-1 bg-zinc-900 p-1 rounded-xl">
            <button onClick={() => setTab('mine')} className={`py-2 rounded-lg text-[11px] font-bold cursor-pointer ${tab === 'mine' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}>
              My orders
            </button>
            <button onClick={() => setTab('shop')} className={`py-2 rounded-lg text-[11px] font-bold cursor-pointer ${tab === 'shop' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`}>
              Shop orders{openCount > 0 ? ` (${openCount} open)` : ''}
            </button>
          </div>
        ) : (
          <h2 className="flex-1 text-sm font-black text-white">My orders</h2>
        )}
        <button onClick={load} disabled={loading} className="p-2 rounded-full hover:bg-white/10 cursor-pointer disabled:opacity-50" aria-label="Refresh orders" title="Refresh">
          <RefreshCw className={`w-4 h-4 text-zinc-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {canManage && tab === 'shop' && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(['open', 'all', 'completed', 'cancelled'] as ShopFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setShopFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold capitalize whitespace-nowrap cursor-pointer border ${
                shopFilter === f ? 'border-[#00FF66] text-[#00FF66] bg-[#00FF66]/10' : 'border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {error}
        </div>
      )}

      {loading && list.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <ClipboardList className="w-12 h-12 text-zinc-700" />
          <p className="text-sm font-bold text-zinc-400">{tab === 'mine' ? 'No orders yet' : 'No orders here'}</p>
          <p className="text-xs text-zinc-600 max-w-xs">{tab === 'mine' ? 'When you place an order, you can follow it here.' : 'New orders will show up in this list.'}</p>
        </div>
      ) : (
        list.map((o) => (
          <OrderCard key={o.id} order={o} shopView={tab === 'shop'} busy={busyId === o.id} onCustomerCancel={customerCancel} onShopStep={shopStep} onOpen={(x) => setTrackingId(x.id)} />
        ))
      )}

      {tracking && (
        <OrderTrackingScreen order={tracking} shopView={tab === 'shop'} busy={busyId === tracking.id} onClose={() => setTrackingId(null)} onCancel={customerCancel} />
      )}
    </div>
  );
};
