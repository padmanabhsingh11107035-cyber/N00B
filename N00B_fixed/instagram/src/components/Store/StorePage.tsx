import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ShoppingCart,
  Plus,
  Minus,
  Settings,
  Trash2,
  Pencil,
  PackageOpen,
  Store as StoreIcon,
  Truck,
  MapPin,
  Loader2,
  Lock
} from 'lucide-react';
import { User, StoreProduct, AppSettings } from '../../types';
import { fetchStoreProducts, deleteStoreProduct, fetchSettings } from '../../services/api';
import { can } from '../../adminAccess';
import { ProductEditorModal } from './ProductEditorModal';
import { ProductDetailModal } from './ProductDetailModal';
import { StoreSettingsModal } from './StoreSettingsModal';
import { ShopMap, SHOP_ADDRESS } from './ShopMap';
import { formatPrice } from './formatPrice';
import { availableStock, cartKey, isBuyable, splitCartKey, totalStock, variantLabel, LOW_STOCK_AT } from './variants';

interface StorePageProps {
  currentUser: User;
  onClose: () => void;
}

type StoreView = 'grid' | 'cart' | 'checkout';
type DeliveryMethod = 'pickup' | 'delivery';

export const StorePage: React.FC<StorePageProps> = ({ currentUser, onClose }) => {
  // may add, edit and remove products: the main admin, or an admin who was given the "manage the shop" permission
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
  const [notice, setNotice] = useState<string | null>(null);

  // Checkout form
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('pickup');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');

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

  const showNotice = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), 3500);
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

  const subtotal = cartItems.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
  const deliveryFee = deliveryMethod === 'delivery' ? settings?.storeDeliveryFee || 0 : 0;
  const total = subtotal + deliveryFee;

  const addToCart = (productId: string, variantKey?: string | null) => {
    const product = products.find((p) => p.id === productId);
    if (!product || !isBuyable(product, variantKey)) return;
    const key = cartKey(productId, variantKey);
    const limit = availableStock(product, variantKey);
    setCart((prev) => {
      const have = prev[key] || 0;
      if (limit !== null && have >= limit) return prev;
      return { ...prev, [key]: have + 1 };
    });
    if (limit !== null && (cart[key] || 0) >= limit) showNotice(`Only ${limit} available.`);
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

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('Remove this product from the shop? This cannot be undone.')) return;
    const res = await deleteStoreProduct(productId);
    if (res.success) {
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setCart((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => splitCartKey(key).productId !== productId)));
    } else {
      showNotice(res.error || 'Could not remove the product.');
    }
  };

  const openEditor = (product?: StoreProduct) => {
    setSelectedProduct(null);
    setEditingProduct(product);
    setEditorOpen(true);
  };

  // storeEnabled defaults to true when a pre-existing settings document
  // (persisted before this field existed) doesn't have it yet — only an
  // explicit `false` from the admin's toggle should read as "paused."
  const checkoutBlockedReason =
    settings && settings.storeEnabled === false
      ? 'Ordering is currently paused by NOOB.'
      : 'Online ordering isn\'t live yet — check back soon!';

  const isCheckoutFormComplete =
    fullName.trim() &&
    phone.trim() &&
    (deliveryMethod === 'pickup' || (addressLine1.trim() && city.trim() && stateName.trim() && pincode.trim()));

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#00FF66]/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-orange-600/10 blur-[110px]" />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 p-4 sm:p-5 border-b border-white/10 shrink-0">
        <button
          onClick={() => (view === 'grid' ? onClose() : setView(view === 'checkout' ? 'cart' : 'grid'))}
          className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-black tracking-tight flex-1">
          {view === 'grid' ? 'NOOB Shop' : view === 'cart' ? 'Your Cart' : 'Checkout'}
        </h1>
        {view === 'grid' && canManage && (
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Shop settings"
          >
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
        {view === 'grid' && (
          <button
            onClick={() => setView('cart')}
            className="relative p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Cart"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#00FF66] text-black text-[9px] font-black flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        )}
      </div>

      {notice && (
        <div role="status" className="relative z-20 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-xs font-semibold text-amber-200 text-center">
          {notice}
        </div>
      )}

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6">
        {view === 'grid' && (
          <>
            {loading ? (
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
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.map((product) => {
                  const soldOut = !product.inStock;   // worked out by the database: any version in stock, a count above 0, or the plain switch
                  const units = totalStock(product);
                  return (
                    <div
                      key={product.id}
                      className="rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/60 cursor-pointer group relative"
                      onClick={() => setSelectedProduct(product)}
                    >
                      <div className="w-full aspect-square bg-zinc-900 relative">
                        {product.media[0]?.type === 'video' ? (
                          <video src={product.media[0].url} className="w-full h-full object-cover" muted />
                        ) : (
                          <img src={product.media[0]?.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        )}
                        {soldOut && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-red-400 bg-black/70 px-2 py-1 rounded-full">Out of Stock</span>
                          </div>
                        )}
                        {!soldOut && units !== null && units <= LOW_STOCK_AT && (
                          <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold text-amber-300 bg-black/70 px-2 py-0.5 rounded-full">
                            Only {units} left
                          </span>
                        )}
                        {canManage && (
                          <div className="absolute top-1.5 right-1.5 flex flex-col gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditor(product);
                              }}
                              className="p-1.5 rounded-full bg-black/70 hover:bg-[#00FF66]/80 cursor-pointer"
                              aria-label="Edit product"
                              title="Edit product"
                            >
                              <Pencil className="w-3.5 h-3.5 text-white" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProduct(product.id);
                              }}
                              className="p-1.5 rounded-full bg-black/70 hover:bg-red-500/80 cursor-pointer"
                              aria-label="Delete product"
                              title="Delete product"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-white" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 space-y-0.5">
                        <span className="text-sm font-black text-[#00FF66] block">{formatPrice(product.price)}</span>
                        <span className="text-[11px] text-zinc-400 block line-clamp-2">{product.description}</span>
                        {product.options.length > 0 && (
                          <span className="text-[10px] text-zinc-500 block truncate">
                            Choose: {product.options.map((o) => o.name).join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {view === 'cart' && (
          <div className="max-w-lg mx-auto space-y-3">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <ShoppingCart className="w-12 h-12 text-zinc-700" />
                <p className="text-sm font-bold text-zinc-400">Your cart is empty</p>
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
                        <p className="text-xs text-zinc-300 line-clamp-1">{product.description}</p>
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
          <div className="max-w-lg mx-auto space-y-4">
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

            {deliveryMethod === 'pickup' ? (
              <div className="space-y-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#00FF66]" /> Pickup Location
                </span>
                <ShopMap />
                <p className="text-[11px] text-zinc-400">{SHOP_ADDRESS}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-xs font-bold text-white block">Delivery Address</span>
                <input
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="Address Line 1"
                  className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
                />
                <input
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Address Line 2 (optional)"
                  className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
                  />
                  <input
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="State"
                    className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
                  />
                </div>
                <input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="Pincode"
                  className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
                />
              </div>
            )}

            <div className="space-y-2">
              <span className="text-xs font-bold text-white block">Contact Details</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone Number"
                className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
              />
            </div>

            <div className="space-y-1.5 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400">
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
            </div>

            <button
              disabled
              title={checkoutBlockedReason}
              className="w-full py-3 bg-zinc-800 text-zinc-500 text-xs font-bold rounded-2xl cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" /> Place Order
            </button>
            <p className="text-[11px] text-zinc-500 text-center">{checkoutBlockedReason}</p>
          </div>
        )}
      </div>

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
          onEdit={canManage ? openEditor : undefined}
        />
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

      {showSettingsModal && settings && (
        <StoreSettingsModal
          settings={settings}
          onClose={() => setShowSettingsModal(false)}
          onSaved={(updated) => setSettings(updated)}
        />
      )}
    </div>
  );
};
