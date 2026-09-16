import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ShoppingCart,
  Plus,
  Minus,
  Settings,
  Trash2,
  PackageOpen,
  Store as StoreIcon,
  Truck,
  MapPin,
  Loader2,
  Lock
} from 'lucide-react';
import { User, StoreProduct, AppSettings } from '../../types';
import { fetchStoreProducts, deleteStoreProduct, fetchSettings } from '../../services/api';
import { AddProductModal } from './AddProductModal';
import { ProductDetailModal } from './ProductDetailModal';
import { StoreSettingsModal } from './StoreSettingsModal';
import { ShopMap, SHOP_ADDRESS } from './ShopMap';
import { formatPrice } from './formatPrice';

interface StorePageProps {
  currentUser: User;
  onClose: () => void;
}

type StoreView = 'grid' | 'cart' | 'checkout';
type DeliveryMethod = 'pickup' | 'delivery';

export const StorePage: React.FC<StorePageProps> = ({ currentUser, onClose }) => {
  const isMasterAdmin = !!currentUser && (
    !!currentUser.isAdmin ||
    currentUser.username?.toLowerCase() === 'noob' ||
    currentUser.id === 'u_noob_admin'
  );

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<StoreView>('grid');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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

  const cartCount: number = (Object.values(cart) as number[]).reduce((sum, qty) => sum + qty, 0);

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
        .filter((entry): entry is { product: StoreProduct; qty: number } => !!entry.product),
    [cart, products]
  );

  const subtotal = cartItems.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
  const deliveryFee = deliveryMethod === 'delivery' ? settings?.storeDeliveryFee || 0 : 0;
  const total = subtotal + deliveryFee;

  const addToCart = (productId: string) => {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
    setSelectedProduct(null);
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const newQty = (next[productId] || 0) + delta;
      if (newQty <= 0) {
        delete next[productId];
      } else {
        next[productId] = newQty;
      }
      return next;
    });
  };

  const handleDeleteProduct = async (productId: string) => {
    const res = await deleteStoreProduct(productId);
    if (res.success) {
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    }
  };

  const checkoutBlockedReason =
    settings && !settings.storeEnabled
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
        {view === 'grid' && isMasterAdmin && (
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Shop settings"
          >
            <Settings className="w-5 h-5 text-zinc-300" />
          </button>
        )}
        {view === 'grid' && isMasterAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
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
                  {isMasterAdmin ? 'Tap the + button above to add your first product.' : 'Check back soon — new products are on the way!'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.map((product) => (
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
                      {!product.inStock && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-red-400 bg-black/70 px-2 py-1 rounded-full">Out of Stock</span>
                        </div>
                      )}
                      {isMasterAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProduct(product.id);
                          }}
                          className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/70 hover:bg-red-500/80 cursor-pointer"
                          aria-label="Delete product"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}
                    </div>
                    <div className="p-2.5 space-y-0.5">
                      <span className="text-sm font-black text-[#00FF66] block">{formatPrice(product.price)}</span>
                      <span className="text-[11px] text-zinc-400 block line-clamp-2">{product.description}</span>
                    </div>
                  </div>
                ))}
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
                {cartItems.map(({ product, qty }) => (
                  <div key={product.id} className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-900 shrink-0">
                      {product.media[0]?.type === 'video' ? (
                        <video src={product.media[0].url} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={product.media[0]?.url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-300 line-clamp-1">{product.description}</p>
                      <span className="text-sm font-black text-[#00FF66]">{formatPrice(product.price)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => updateQty(product.id, -1)} className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center cursor-pointer">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold w-4 text-center">{qty}</span>
                      <button onClick={() => updateQty(product.id, 1)} className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center cursor-pointer">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

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
        <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAddToCart={addToCart} />
      )}

      {showAddModal && (
        <AddProductModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
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
