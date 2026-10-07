import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Loader2, Package, Pencil, PowerOff, RefreshCw, Save, Search, UtensilsCrossed } from 'lucide-react';
import { AppSettings, StoreOrder, StoreOrderStatus, StoreProduct } from '../../types';
import { fetchAdminStoreOrders, fetchSettings, fetchStoreProducts, setFoodStallSettings, setStoreOrderStatus, updateSettings, updateStoreProduct } from '../../services/api';
import { OrderCard } from '../Store/OrdersView';
import { OrderTrackingScreen } from '../Store/OrderTrackingScreen';
import { ProductEditorModal } from '../Store/ProductEditorModal';
import { formatPrice } from '../Store/formatPrice';

const FOOD_CATEGORY = 'food_stall';
type StatusFilter = 'all' | StoreOrderStatus;
const FILTERS: StatusFilter[] = ['all', 'placed', 'confirmed', 'ready', 'completed', 'cancelled'];

// Everything Food Stall in one place: open/closed + delivery fee + UPI ID, the 5 (7, counting
// Coke's 3 cup sizes) products with a quick edit, and just the orders that touch one of those
// products — all reusing the exact components/RPCs Shop NOOB's own admin tools already use, so
// nothing here is a second, divergent copy of that logic.
export const AdminFoodStallPanel: React.FC = () => {
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [foodStallVisible, setFoodStallVisible] = useState(false);
  const [foodStallEnabled, setFoodStallEnabled] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [upiId, setUpiId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [stockBusyId, setStockBusyId] = useState<string | null>(null);

  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const s = await fetchSettings();
    setSettingsState(s);
    setFoodStallVisible(!!s.foodStallVisible);
    setFoodStallEnabled(!!s.foodStallEnabled);
    setDeliveryFee(String(s.storeDeliveryFee ?? 0));
    setUpiId(s.storeUpiId || '');
  }, []);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    const list = await fetchStoreProducts();
    setProducts(list.filter((p) => p.category === FOOD_CATEGORY));
    setProductsLoading(false);
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    const res = await fetchAdminStoreOrders();
    if (res.success) setOrders(res.orders);
    else setOrdersError(res.error || 'Could not load orders.');
    setOrdersLoading(false);
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadProducts();
    void loadOrders();
  }, [loadSettings, loadProducts, loadOrders]);

  const handleSaveSettings = async () => {
    const fee = Number(deliveryFee);
    if (!Number.isFinite(fee) || fee < 0) {
      setSettingsError('Enter a valid delivery charge.');
      return;
    }
    const trimmedUpi = upiId.trim();
    if (trimmedUpi && !/^[\w.+-]{2,256}@[a-zA-Z][\w.-]{1,64}$/.test(trimmedUpi)) {
      setSettingsError('Enter a valid UPI ID, like yourname@okhdfcbank.');
      return;
    }
    setSavingSettings(true);
    setSettingsError(null);
    try {
      await setFoodStallSettings(foodStallVisible, foodStallEnabled);
      const updated = await updateSettings({ storeDeliveryFee: fee, storeUpiId: trimmedUpi });
      setSettingsState(updated);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (err) {
      setSettingsError(err instanceof Error && err.message ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleStock = async (p: StoreProduct) => {
    setStockBusyId(p.id);
    const res = await updateStoreProduct(p.id, {
      name: p.name,
      price: p.price,
      description: p.description,
      media: p.media,
      inStock: !p.inStock,
      stock: p.stock,
      options: p.options,
      variants: p.variants.map((v) => ({ options: v.options, stock: v.stock }))
    });
    setStockBusyId(null);
    if (res.success && res.product) setProducts((prev) => prev.map((x) => (x.id === p.id ? res.product! : x)));
  };

  const foodProductIds = new Set(products.map((p) => p.id));
  const foodOrders = orders.filter((o) => o.items.some((it) => it.productId && foodProductIds.has(it.productId)));

  const replace = (next: StoreOrder) => setOrders((prev) => prev.map((o) => (o.id === next.id ? { ...next, customer: next.customer ?? o.customer } : o)));

  const shopStep = async (o: StoreOrder, status: StoreOrderStatus, reason?: string) => {
    setBusyId(o.id);
    setOrdersError(null);
    const res = await setStoreOrderStatus(o.id, status, reason);
    setBusyId(null);
    if (res.success && res.order) replace(res.order);
    else {
      setOrdersError(res.error || 'Could not update the order.');
      loadOrders();
    }
  };

  const q = search.trim().toLowerCase();
  const shown = foodOrders.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (!q) return true;
    return (
      String(o.orderNo).includes(q) ||
      o.customer?.username.toLowerCase().includes(q) ||
      o.contact.fullName?.toLowerCase().includes(q) ||
      o.contact.phone?.toLowerCase().includes(q)
    );
  });

  const tracking = trackingId ? foodOrders.find((o) => o.id === trackingId) ?? null : null;

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      {/* Settings */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-4">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <UtensilsCrossed className="w-3.5 h-3.5" /> Food Stall Settings
        </h3>

        <label className="flex items-center justify-between gap-4 cursor-pointer text-xs text-zinc-300">
          <div>
            <span className="block font-bold text-white">Show Food Stall</span>
            <span className="block text-[10px] text-zinc-500 leading-snug">Off hides it everywhere — the home page banner and the ☰ menu both disappear for every user.</span>
          </div>
          <input type="checkbox" checked={foodStallVisible} onChange={(e) => setFoodStallVisible(e.target.checked)} className="w-5 h-5 shrink-0 accent-[#00FF66] cursor-pointer" />
        </label>

        <label className="flex items-center justify-between gap-4 cursor-pointer text-xs text-zinc-300 pt-2 border-t border-zinc-800/80">
          <div>
            <span className="block font-bold text-white">Accept Food Stall orders</span>
            <span className="block text-[10px] text-zinc-500 leading-snug">Separate from Shop NOOB's own "Accept orders" — people can still browse while this is off, but checkout is paused.</span>
          </div>
          <input type="checkbox" checked={foodStallEnabled} onChange={(e) => setFoodStallEnabled(e.target.checked)} className="w-5 h-5 shrink-0 accent-[#00FF66] cursor-pointer" />
        </label>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase">Delivery Charge (₹)</label>
          <input
            type="number"
            min="0"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(e.target.value)}
            className="w-full bg-zinc-900 text-sm text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase">Your UPI ID</label>
          <input
            type="text"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="yourname@okhdfcbank"
            className="w-full bg-zinc-900 text-sm text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
          />
          <p className="text-[10px] text-zinc-500">Leave blank to hide UPI at checkout and only accept Cash.</p>
        </div>

        {settingsError && <p className="text-xs text-red-400 font-semibold">{settingsError}</p>}

        <button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold cursor-pointer hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {settingsSaved ? 'Saved!' : savingSettings ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Products */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Package className="w-3.5 h-3.5" /> Products
        </h3>
        {productsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5">
                <img src={p.media[0]?.url} alt="" className="w-10 h-10 rounded-lg object-cover bg-zinc-900 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{p.name}</p>
                  <p className={`text-[11px] ${p.inStock ? 'text-zinc-500' : 'text-red-400 font-bold'}`}>
                    {formatPrice(p.price)} · {p.inStock ? 'In stock' : 'Out of stock'}
                  </p>
                </div>
                <button
                  onClick={() => toggleStock(p)}
                  disabled={stockBusyId === p.id}
                  className={`px-2.5 py-2 rounded-lg text-[10px] font-bold cursor-pointer shrink-0 flex items-center gap-1 disabled:opacity-50 ${
                    p.inStock ? 'bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-300' : 'bg-[#00FF66]/15 text-[#00FF66] hover:bg-[#00FF66]/25'
                  }`}
                  title={p.inStock ? 'Mark out of stock' : 'Bring back in stock'}
                >
                  {stockBusyId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PowerOff className="w-3.5 h-3.5" />}
                  {p.inStock ? 'Out of stock' : 'In stock'}
                </button>
                <button
                  onClick={() => setEditingProduct(p)}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer shrink-0"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5" /> Food Stall Orders
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order #, @username, name, phone..."
              className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]"
            />
          </div>
          <button onClick={loadOrders} disabled={ordersLoading} className="p-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-800 cursor-pointer disabled:opacity-50" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} />
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

        {ordersError && (
          <div role="alert" className="text-xs font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            {ordersError}
          </div>
        )}

        {ordersLoading && shown.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <UtensilsCrossed className="w-12 h-12 text-zinc-700" />
            <p className="text-sm font-bold text-zinc-400">No food stall orders here</p>
          </div>
        ) : (
          shown.map((o) => (
            <OrderCard key={o.id} order={o} shopView busy={busyId === o.id} onCustomerCancel={() => undefined} onShopStep={shopStep} onOpen={(x) => setTrackingId(x.id)} />
          ))
        )}
      </div>

      {tracking && <OrderTrackingScreen order={tracking} shopView busy={busyId === tracking.id} onClose={() => setTrackingId(null)} />}

      {editingProduct && (
        <ProductEditorModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={(updated) => {
            setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setEditingProduct(null);
          }}
        />
      )}
    </div>
  );
};
