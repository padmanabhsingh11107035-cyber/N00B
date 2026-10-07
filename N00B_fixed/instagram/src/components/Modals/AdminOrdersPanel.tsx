import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2, RefreshCw, Search } from 'lucide-react';
import { StoreOrder, StoreOrderStatus } from '../../types';
import { fetchAdminStoreOrders, setStoreOrderStatus } from '../../services/api';
import { OrderCard } from '../Store/OrdersView';
import { OrderTrackingScreen } from '../Store/OrderTrackingScreen';

// The dedicated admin-panel page for Shop NOOB orders — every order ever placed, full detail (who,
// what, where it's going, how it's being paid, its whole status history), with the same confirm/
// ready/complete/cancel controls the shop account already has. Reuses OrderCard/OrderTrackingScreen
// (the exact same components Shop NOOB's own "Orders" tab uses) rather than building a second,
// divergent order UI — this is just a fuller, admin-facing way to reach the same data.
//
// Device/IP/browser/connection fingerprinting and a standalone GPS trail (beyond the delivery pin
// the customer already places on the map) are deliberately NOT collected or shown here — nothing in
// this app captures that per order today, and building that out would be a real, separate expansion
// of personal-data collection well past what's needed to fulfill and audit shop orders.

type StatusFilter = 'all' | StoreOrderStatus;

const FILTERS: StatusFilter[] = ['all', 'placed', 'confirmed', 'ready', 'completed', 'cancelled'];

export const AdminOrdersPanel: React.FC = () => {
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchAdminStoreOrders();
    if (res.success) setOrders(res.orders);
    else setError(res.error || 'Could not load orders.');
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (next: StoreOrder) => setOrders((prev) => prev.map((o) => (o.id === next.id ? { ...next, customer: next.customer ?? o.customer } : o)));

  const shopStep = async (o: StoreOrder, status: StoreOrderStatus, reason?: string) => {
    setBusyId(o.id);
    setError(null);
    const res = await setStoreOrderStatus(o.id, status, reason);
    setBusyId(null);
    if (res.success && res.order) replace(res.order);
    else {
      setError(res.error || 'Could not update the order.');
      load();
    }
  };

  const q = search.trim().toLowerCase();
  const shown = orders.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (!q) return true;
    return (
      String(o.orderNo).includes(q) ||
      o.customer?.username.toLowerCase().includes(q) ||
      o.contact.fullName?.toLowerCase().includes(q) ||
      o.contact.phone?.toLowerCase().includes(q) ||
      o.contact.email?.toLowerCase().includes(q)
    );
  });

  const tracking = trackingId ? orders.find((o) => o.id === trackingId) ?? null : null;

  return (
    <div className="space-y-3 max-w-lg mx-auto">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order #, @username, name, phone, or email..."
            className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]"
          />
        </div>
        <button onClick={load} disabled={loading} className="p-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-800 cursor-pointer disabled:opacity-50" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold capitalize whitespace-nowrap cursor-pointer border ${
              filter === f ? 'border-[#00FF66] text-[#00FF66] bg-[#00FF66]/10' : 'border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {error}
        </div>
      )}

      {loading && shown.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <ClipboardList className="w-12 h-12 text-zinc-700" />
          <p className="text-sm font-bold text-zinc-400">No orders here</p>
        </div>
      ) : (
        shown.map((o) => (
          <OrderCard key={o.id} order={o} shopView busy={busyId === o.id} onCustomerCancel={() => undefined} onShopStep={shopStep} onOpen={(x) => setTrackingId(x.id)} />
        ))
      )}

      {tracking && <OrderTrackingScreen order={tracking} shopView busy={busyId === tracking.id} onClose={() => setTrackingId(null)} />}
    </div>
  );
};
