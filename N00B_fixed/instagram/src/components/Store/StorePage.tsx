import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ShoppingCart,
  Plus,
  Minus,
  Settings,
  PackageOpen,
  Store as StoreIcon,
  Truck,
  MapPin,
  Loader2,
  ClipboardList,
  UserRound,
  SlidersHorizontal,
  CheckCircle2,
  ShoppingBag
} from 'lucide-react';
import { User, StoreProduct, AppSettings, StoreOrder, ShopDetails } from '../../types';
import { fetchStoreProducts, deleteStoreProduct, fetchSettings, getShopDetails, placeStoreOrder } from '../../services/api';
import { can } from '../../adminAccess';
import { ProductEditorModal } from './ProductEditorModal';
import { ProductDetailModal } from './ProductDetailModal';
import { StoreSettingsModal } from './StoreSettingsModal';
import { ShopMap, SHOP_ADDRESS } from './ShopMap';
import { ProductCard } from './ProductCard';
import { ShopFilters } from './ShopFilters';
import { AccountDetailsView } from './AccountDetailsView';
import { OrdersView } from './OrdersView';
import { ContactFields, prefillFromProfile, withDefaults, inputClass } from './ContactFields';
import { SORT_LABELS, SortKey, ShopFilterState, activeFilterCount, applyShopFilters, emptyFilters } from './filterLogic';
import { formatPrice } from './formatPrice';
import { availableStock, cartKey, isBuyable, splitCartKey, variantLabel } from './variants';

interface StorePageProps {
  currentUser: User;
  onClose: () => void;
}

type StoreView = 'grid' | 'cart' | 'checkout' | 'done' | 'orders' | 'account';
type DeliveryMethod = 'pickup' | 'delivery';

export const StorePage: React.FC<StorePageProps> = ({ currentUser, onClose }) => {
  // may add, edit and remove products and handle orders: the main admin, or an admin who was given the "manage the shop" permission
  const canManage = can(currentUser, 'manage_store');

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<StoreView>('grid');
  // what is in the cart: a product, or one version of it (see cartKey) -> how many
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | undefined>(undefined);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);

  // Filters and sorting on the shelf
  const [filters, setFilters] = useState<ShopFilterState>(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);

  // Checkout
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [contact, setContact] = useState<ShopDetails>(withDefaults());
  const [contactLoaded, setContactLoaded] = useState(false);
  const [saveDetails, setSaveDetails] = useState(true);
  const [orderNote, setOrderNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<StoreOrder | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([fetchStoreProducts(), fetchSettings()]);
      setProducts(p);
      setSettings(s);
      // stock may have changed since the cart was filled: drop what is gone and trim what is now more than is left
      setCart((prev) => {
        const next: Record<string, number> = {};
        for (const [key, qty] of Object.entries(prev) as [string, number][]) {
          const { productId, variantKey } = splitCartKey(key);
          const product = p.find((x) => x.id === productId);
          if (!product || !isBuyable(product, variantKey)) continue;
          const limit = availableStock(product, variantKey);
          next[key] = limit === null ? qty : Math.min(qty, limit);
        }
        return next;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The first time checkout opens: fill in the saved details (or what the profile already knows).
  useEffect(() => {
    if (view !== 'checkout' || contactLoaded) return;
    let alive = true;
    (async () => {
      const res = await getShopDetails();
      if (!alive) return;
      setContact(prefillFromProfile(currentUser, res.success ? res.details : {}));
      setContactLoaded(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, contactLoaded]);

  const showNotice = (text: string, bad = false) => {
    setNotice({ text, bad });
    window.setTimeout(() => setNotice((current) => (current && current.text === text ? null : current)), bad ? 6500 : 2500);
  };

  const cartCount: number = (Object.values(cart) as number[]).reduce((sum, qty) => sum + qty, 0);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([key, qty]) => {
          const { productId, variantKey } = splitCartKey(key);
          return { key, product: products.find((p) => p.id === productId), variantKey, qty };
        })
        .filter((entry): entry is { key: string; product: StoreProduct; variantKey: string | null; qty: number } => !!entry.product),
    [cart, products]
  );

  const visibleProducts = useMemo(() => applyShopFilters(products, filters), [products, filters]);
  const filterCount = activeFilterCount(filters);

  const subtotal = cartItems.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
  const deliveryFee = deliveryMethod === 'delivery' ? settings?.storeDeliveryFee || 0 : 0;
  const total = subtotal + deliveryFee;

  const addToCart = (productId: string, variantKey?: string | null) => {
    const product = products.find((p) => p.id === productId);
    if (!product || !isBuyable(product, variantKey)) return;
    const key = cartKey(productId, variantKey);
    const limit = availableStock(product, variantKey);
    if (limit !== null && (cart[key] || 0) >= limit) {
      showNotice(`Only ${limit} available.`, true);
    } else {
      showNotice(`Added "${product.title}" to your cart.`);
      setCart((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    }
    setSelectedProduct(null);
  };

  const updateQty = (key: string, delta: number) => {
    const { productId, variantKey } = splitCartKey(key);
    const product = products.find((p) => p.id === productId);
    const limit = product ? availableStock(product, variantKey) : null;
    setCart((prev) => {
      const next = { ...prev };
      let newQty = (next[key] || 0) + delta;
      if (limit !== null && newQty > limit) newQty = limit;
      if (newQty <= 0) {
        delete next[key];
      } else {
        next[key] = newQty;
      }
      return next;
    });
  };

  const handleDeleteProduct = async (product: StoreProduct) => {
    if (!window.confirm(`Remove "${product.title}" from the shop? This cannot be undone.`)) return;
    const res = await deleteStoreProduct(product.id);
    if (res.success) {
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setCart((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => splitCartKey(key).productId !== product.id)));
    } else {
      showNotice(res.error || 'Could not remove the product.', true);
    }
  };

  const openEditor = (product?: StoreProduct) => {
    setSelectedProduct(null);
    setEditingProduct(product);
    setEditorOpen(true);
  };

  const paused = !!settings && settings.storeEnabled === false;

  const contactComplete =
    contact.fullName.trim().length >= 2 &&
    contact.phone.trim() &&
    (deliveryMethod === 'pickup' || (contact.addressLine1.trim() && contact.city.trim() && contact.state.trim() && contact.pincode.trim()));

  const placeOrder = async () => {
    if (placing || cartItems.length === 0) return;
    setPlacing(true);
    const res = await placeStoreOrder({
      items: cartItems.map(({ product, variantKey, qty }) => ({ productId: product.id, variantKey, quantity: qty })),
      deliveryMethod,
      contact,
      note: orderNote,
      saveDetails
    });
    setPlacing(false);
    if (res.success && res.order) {
      setPlacedOrder(res.order);
      setCart({});
      setOrderNote('');
      setView('done');
      loadData();   // stock came off the shelf
    } else {
      showNotice(res.error || 'Could not place your order.', true);
      loadData();   // somebody may have bought the last one: show what is really left
    }
  };

  const goBack = () => {
    if (view === 'grid') onClose();
    else if (view === 'checkout') setView('cart');
    else setView('grid');
  };

  const title = { grid: 'NOOB Shop', cart: 'Your Cart', checkout: 'Checkout', done: 'Order placed', orders: 'Orders', account: 'Account details' }[view];

  const navTab = (id: 'grid' | 'cart' | 'orders' | 'account', label: string, Icon: React.ElementType, badge?: number) => {
    const active = view === id || (id === 'cart' && view === 'checkout');
    return (
      <button
        key={id}
        onClick={() => setView(id)}
        aria-current={active ? 'page' : undefined}
        className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] sm:text-xs font-bold cursor-pointer border-b-2 transition-colors ${
          active ? 'border-[#00FF66] text-[#00FF66]' : 'border-transparent text-zinc-400 hover:text-white'
        }`}
      >
        <Icon className="w-4 h-4" />
        <span>{label}</span>
        {!!badge && badge > 0 && (
          <span className="min-w-[16px] h-4 px-1 rounded-full bg-[#00FF66] text-black text-[9px] font-black flex items-center justify-center">{badge}</span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#00FF66]/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-orange-600/10 blur-[110px]" />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 p-4 sm:p-5 pb-2 sm:pb-3 shrink-0">
        <button onClick={goBack} className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer" aria-label="Back">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-black tracking-tight flex-1">{title}</h1>
        {view === 'grid' && canManage && (
          <button onClick={() => setShowSettingsModal(true)} className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer" aria-label="Shop settings">
            <Settings className="w-5 h-5 text-zinc-300" />
          </button>
        )}
        {view === 'grid' && canManage && (
          <button
            onClick={() => openEditor()}
            className="p-2 rounded-full bg-[#00FF66]/20 border border-[#00FF66]/40 hover:bg-[#00FF66]/30 transition-colors cursor-pointer"
            aria-label="Add product"
          >
            <Plus className="w-5 h-5 text-[#00FF66]" />
          </button>
        )}
      </div>

      {/* Shop · Cart · Orders · Account */}
      <nav className="relative z-10 flex border-b border-white/10 shrink-0 px-2 sm:px-4" aria-label="Shop sections">
        {navTab('grid', 'Shop', StoreIcon)}
        {navTab('cart', 'Cart', ShoppingCart, cartCount)}
        {navTab('orders', 'Orders', ClipboardList)}
        {navTab('account', 'Account', UserRound)}
      </nav>

      {notice && (
        <div
          role="status"
          className={`relative z-20 px-4 py-2 border-b text-xs font-semibold text-center ${
            notice.bad ? 'bg-red-500/15 border-red-500/30 text-red-200' : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6">
        {view === 'grid' && (
          <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
            {/* Filters: always beside the shelf on a wide screen */}
            <aside className="hidden lg:block sticky top-0 self-start">
              <ShopFilters products={products} filters={filters} onChange={setFilters} />
            </aside>

            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setShowFilters((s) => !s)}
                  aria-expanded={showFilters}
                  className={`lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold cursor-pointer ${
                    showFilters || filterCount > 0 ? 'border-amber-400/60 text-amber-300 bg-amber-400/10' : 'border-zinc-800 text-zinc-300'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Filters{filterCount > 0 ? ` (${filterCount})` : ''}
                </button>
                <span className="text-[11px] text-zinc-500 flex-1">
                  {loading ? '' : `${visibleProducts.length} ${visibleProducts.length === 1 ? 'product' : 'products'}`}
                </span>
                <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="hidden sm:inline">Sort</span>
                  <select
                    value={filters.sort}
                    onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortKey })}
                    aria-label="Sort products"
                    className="bg-zinc-900 text-[11px] font-bold text-white px-2.5 py-2 rounded-xl border border-zinc-800 outline-none focus:border-amber-400/60 cursor-pointer"
                  >
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                      <option key={k} value={k}>
                        {SORT_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {showFilters && (
                <div className="lg:hidden mb-4 p-3 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
                  <ShopFilters products={products} filters={filters} onChange={setFilters} />
                </div>
              )}

              {loading && products.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <PackageOpen className="w-12 h-12 text-zinc-700" />
                  <p className="text-sm font-bold text-zinc-400">No products yet</p>
                  <p className="text-xs text-zinc-600 max-w-xs">
                    {canManage ? 'Tap the + button above to add your first product.' : 'Check back soon — new products are on the way!'}
                  </p>
                </div>
              ) : visibleProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <PackageOpen className="w-12 h-12 text-zinc-700" />
                  <p className="text-sm font-bold text-zinc-400">Nothing matches these filters</p>
                  <button onClick={() => setFilters(emptyFilters)} className="px-4 py-2 rounded-full border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-zinc-500 cursor-pointer">
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  {visibleProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      canManage={canManage}
                      onOpen={setSelectedProduct}
                      onAddToCart={(p) => addToCart(p.id)}
                      onEdit={openEditor}
                      onDelete={handleDeleteProduct}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'cart' && (
          <div className="max-w-lg mx-auto space-y-3">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <ShoppingCart className="w-12 h-12 text-zinc-700" />
                <p className="text-sm font-bold text-zinc-400">Your cart is empty</p>
                <button onClick={() => setView('grid')} className="px-4 py-2 rounded-full border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-zinc-500 cursor-pointer">
                  Browse the shop
                </button>
              </div>
            ) : (
              <>
                {cartItems.map(({ key, product, variantKey, qty }) => {
                  const limit = availableStock(product, variantKey);
                  const label = variantLabel(product, variantKey);
                  const atLimit = limit !== null && qty >= limit;
                  return (
                    <div key={key} className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-900 shrink-0">
                        {product.media[0]?.type === 'video' ? (
                          <video src={product.media[0].url} className="w-full h-full object-cover" muted />
                        ) : (
                          <img src={product.media[0]?.url} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white line-clamp-1">{product.title}</p>
                        {label && <p className="text-[11px] text-zinc-500 line-clamp-1">{label}</p>}
                        <span className="text-sm font-black text-[#00FF66]">{formatPrice(product.price)}</span>
                        {atLimit && <span className="text-[10px] text-amber-300 block">That&apos;s all we have</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => updateQty(key, -1)} className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center cursor-pointer" aria-label="Fewer">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold w-4 text-center">{qty}</span>
                        <button
                          onClick={() => updateQty(key, 1)}
                          disabled={atLimit}
                          className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="More"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Subtotal</span>
                  <span className="text-sm font-black text-white">{formatPrice(subtotal)}</span>
                </div>

                <button
                  onClick={() => setView('checkout')}
                  className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity"
                >
                  Proceed to Checkout
                </button>
              </>
            )}
          </div>
        )}

        {view === 'checkout' && (
          <div className="max-w-lg mx-auto space-y-5">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <ShoppingCart className="w-12 h-12 text-zinc-700" />
                <p className="text-sm font-bold text-zinc-400">Your cart is empty</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <span className="text-xs font-bold text-white block">Delivery Method</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setDeliveryMethod('pickup')}
                      className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                        deliveryMethod === 'pickup' ? 'border-[#00FF66] bg-[#00FF66]/10' : 'border-zinc-800 bg-zinc-900/60'
                      }`}
                    >
                      <StoreIcon className={`w-5 h-5 ${deliveryMethod === 'pickup' ? 'text-[#00FF66]' : 'text-zinc-400'}`} />
                      <span className="text-xs font-bold">Pickup</span>
                    </button>
                    <button
                      onClick={() => setDeliveryMethod('delivery')}
                      className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
                        deliveryMethod === 'delivery' ? 'border-[#00FF66] bg-[#00FF66]/10' : 'border-zinc-800 bg-zinc-900/60'
                      }`}
                    >
                      <Truck className={`w-5 h-5 ${deliveryMethod === 'delivery' ? 'text-[#00FF66]' : 'text-zinc-400'}`} />
                      <span className="text-xs font-bold">Delivery {settings && settings.storeDeliveryFee > 0 ? `(+${formatPrice(settings.storeDeliveryFee)})` : ''}</span>
                    </button>
                  </div>
                </div>

                {deliveryMethod === 'pickup' && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#00FF66]" /> Pickup Location
                    </span>
                    <ShopMap />
                    <p className="text-[11px] text-zinc-400">{SHOP_ADDRESS}</p>
                  </div>
                )}

                {!contactLoaded ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                  </div>
                ) : (
                  <ContactFields value={contact} onChange={setContact} address={deliveryMethod === 'delivery'} notes={deliveryMethod === 'delivery'} />
                )}

                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-zinc-400">Note for the shop (optional)</span>
                  <input value={orderNote} onChange={(e) => setOrderNote(e.target.value)} maxLength={300} placeholder="Anything we should know about this order" className={inputClass} />
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={saveDetails} onChange={(e) => setSaveDetails(e.target.checked)} className="w-4 h-4 accent-[#00FF66] cursor-pointer" />
                  <span className="text-xs text-zinc-300">Save these details for next time</span>
                </label>

                <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                  {cartItems.map(({ key, product, variantKey, qty }) => (
                    <div key={key} className="flex items-center justify-between text-xs text-zinc-400 gap-3">
                      <span className="truncate">
                        {qty} × {product.title}
                        {variantLabel(product, variantKey) ? ` (${variantLabel(product, variantKey)})` : ''}
                      </span>
                      <span className="shrink-0">{formatPrice(product.price * qty)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Delivery Charge</span>
                    <span>{deliveryFee > 0 ? formatPrice(deliveryFee) : 'Free'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-black text-white pt-1">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500">Pay {deliveryMethod === 'pickup' ? 'when you pick it up' : 'when it is delivered'}. There is no online payment.</p>
                </div>

                <button
                  onClick={placeOrder}
                  disabled={placing || paused || !contactComplete || !contactLoaded}
                  className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />} {placing ? 'Placing your order…' : 'Place Order'}
                </button>
                {paused && <p className="text-[11px] text-red-300 text-center">Ordering is currently paused by NOOB.</p>}
                {!paused && !contactComplete && contactLoaded && (
                  <p className="text-[11px] text-zinc-500 text-center">
                    {deliveryMethod === 'delivery' ? 'Add your name, phone and full address to place the order.' : 'Add your name and phone number to place the order.'}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {view === 'done' && placedOrder && (
          <div className="max-w-lg mx-auto text-center space-y-4 py-10">
            <CheckCircle2 className="w-14 h-14 text-[#00FF66] mx-auto" />
            <h2 className="text-lg font-black">Thank you! Order #{placedOrder.orderNo} is placed.</h2>
            <p className="text-xs text-zinc-400">
              {placedOrder.deliveryMethod === 'pickup' ? `Pick it up at ${SHOP_ADDRESS}` : 'We will deliver it to your address'} and pay {formatPrice(placedOrder.total)} then. You will get a
              notification when the shop confirms it.
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setView('orders')} className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold cursor-pointer hover:opacity-90">
                View my orders
              </button>
              <button onClick={() => setView('grid')} className="px-5 py-2.5 rounded-2xl border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-zinc-500 cursor-pointer">
                Keep shopping
              </button>
            </div>
          </div>
        )}

        {view === 'orders' && <OrdersView canManage={canManage} onOrdersChanged={loadData} />}

        {view === 'account' && <AccountDetailsView currentUser={currentUser} onOpenOrders={() => setView('orders')} />}
      </div>

      {selectedProduct && (
        <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={addToCart} onEdit={canManage ? openEditor : undefined} />
      )}

      {editorOpen && (
        <ProductEditorModal
          product={editingProduct}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            loadData();
          }}
        />
      )}

      {showSettingsModal && settings && <StoreSettingsModal settings={settings} onClose={() => setShowSettingsModal(false)} onSaved={(updated) => setSettings(updated)} />}
    </div>
  );
};
