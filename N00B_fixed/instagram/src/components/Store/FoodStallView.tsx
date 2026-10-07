import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  X, ShoppingCart, Plus, Minus, Loader2, Check, Store as StoreIcon, Truck,
  Banknote, Smartphone, Copy, CheckCircle2
} from 'lucide-react';
import { StoreProduct, User } from '../../types';
import { fetchStoreProducts, placeStoreOrder, getShopDetails, fetchSettings } from '../../services/api';
import { ProductMediaCarousel } from './ProductMediaCarousel';
import { formatPrice } from './formatPrice';
import { loadCart, saveCart, type CartMap } from './cartStorage';
import { buildUpiUri } from '../../utils/upi';

interface FoodStallViewProps {
  currentUser: User;
  onClose: () => void;
}

const CSS = `
.fs-stage{perspective:1000px}
.fs-card{transform-style:preserve-3d;animation:fs-float 6s ease-in-out infinite;transition:transform .25s ease-out}
.fs-card:active{animation-play-state:paused;transform:rotateX(2deg) rotateY(-3deg) scale(.97)}
.fs-media{transform:translateZ(22px)}
.fs-chip{transform:translateZ(44px)}
@keyframes fs-float{
  0%,100%{transform:rotateX(5deg) rotateY(-7deg) translateY(0)}
  50%{transform:rotateX(-3deg) rotateY(7deg) translateY(-7px)}
}
@media (prefers-reduced-motion: reduce){.fs-card{animation:none}}
`;

const FOOD_CATEGORY = 'food_stall';
const cartStorageId = (userId: string) => `${userId}::food_stall`;

// Coke's 3 sizes are 3 separate products under the hood (store_products has one price per product,
// not per-variant) but shown here as one card with a size picker, like any other size choice.
const sortCokeBySize = (products: StoreProduct[]): StoreProduct[] => [...products].sort((a, b) => a.price - b.price);

export const FoodStallView: React.FC<FoodStallViewProps> = ({ currentUser, onClose }) => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartMap>(() => loadCart(cartStorageId(currentUser.id)));
  const [selectedCokeId, setSelectedCokeId] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [storeEnabled, setStoreEnabled] = useState(true);
  const [deliveryFeeSetting, setDeliveryFeeSetting] = useState(0);
  const [upiId, setUpiId] = useState('');

  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi'>('cash');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedOrderNo, setPlacedOrderNo] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [upiCopied, setUpiCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchStoreProducts(), fetchSettings(), getShopDetails()]).then(([list, settings, shop]) => {
      if (!alive) return;
      setProducts(list);
      setStoreEnabled(settings.storeEnabled !== false);
      setDeliveryFeeSetting(settings.storeDeliveryFee ?? 0);
      setUpiId(settings.storeUpiId || '');
      if (shop.success) {
        setFullName(shop.details.fullName || '');
        setPhone(shop.details.phone || '');
        setAddressLine1(shop.details.addressLine1 || '');
        setCity(shop.details.city || '');
        setState(shop.details.state || '');
        setPincode(shop.details.pincode || '');
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const foodProducts = useMemo(() => products.filter((p) => p.category === FOOD_CATEGORY), [products]);
  const cokeOptions = useMemo(() => sortCokeBySize(foodProducts.filter((p) => p.name.startsWith('Coke'))), [foodProducts]);
  const otherProducts = useMemo(() => foodProducts.filter((p) => !p.name.startsWith('Coke')), [foodProducts]);

  useEffect(() => {
    if (!selectedCokeId && cokeOptions.length > 0) setSelectedCokeId(cokeOptions[Math.min(1, cokeOptions.length - 1)].id);
  }, [cokeOptions, selectedCokeId]);

  const persistCart = (next: CartMap) => {
    setCart(next);
    saveCart(cartStorageId(currentUser.id), next);
  };

  const addToCart = (productId: string) => {
    persistCart({ ...cart, [productId]: (cart[productId] || 0) + 1 });
  };

  const changeQty = (productId: string, delta: number) => {
    const next = { ...cart };
    const qty = (next[productId] || 0) + delta;
    if (qty <= 0) delete next[productId];
    else next[productId] = Math.min(qty, 100);
    persistCart(next);
  };

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => ({ product: products.find((p) => p.id === productId), quantity }))
        .filter((l): l is { product: StoreProduct; quantity: number } => !!l.product),
    [cart, products]
  );
  const cartCount = cartLines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = cartLines.reduce((n, l) => n + l.product.price * l.quantity, 0);
  const deliveryFee = deliveryMethod === 'delivery' ? deliveryFeeSetting : 0;
  const total = subtotal + deliveryFee;

  useEffect(() => {
    if (paymentMethod !== 'upi' || !upiId || total <= 0) {
      setQrDataUrl(null);
      return;
    }
    let alive = true;
    const uri = buildUpiUri(upiId, 'NOOB Food Stall', total, `NOOB Food Stall order`);
    QRCode.toDataURL(uri, { width: 360, margin: 2, color: { dark: '#000000ff', light: '#ffffffff' } })
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [paymentMethod, upiId, total]);

  const upiUri = upiId && total > 0 ? buildUpiUri(upiId, 'NOOB Food Stall', total, 'NOOB Food Stall order') : '';

  const handlePlaceOrder = async () => {
    setPlaceError(null);
    if (cartLines.length === 0) return;
    if (fullName.trim().length < 2) {
      setPlaceError('Enter your name.');
      return;
    }
    if (!phone.trim()) {
      setPlaceError('Enter a phone number we can reach you on.');
      return;
    }
    if (deliveryMethod === 'delivery' && (!addressLine1.trim() || !city.trim() || !state.trim() || !pincode.trim())) {
      setPlaceError('Fill in your full delivery address.');
      return;
    }
    setPlacing(true);
    const res = await placeStoreOrder({
      items: cartLines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      deliveryMethod,
      paymentMethod,
      contact: { fullName: fullName.trim(), phone: phone.trim(), addressLine1, city, state, pincode },
      note,
      saveDetails: true
    });
    setPlacing(false);
    if (!res.success || !res.order) {
      setPlaceError(res.error || 'Could not place your order. Please try again.');
      return;
    }
    setPlacedOrderNo(res.order.orderNo);
    persistCart({});
    setShowCheckout(false);
  };

  const Card: React.FC<{ product: StoreProduct; name: string; delaySeed: number; children?: React.ReactNode }> = ({ product, name, delaySeed, children }) => (
    <div className="fs-stage">
      <div className="fs-card bg-zinc-900/80 border border-zinc-800 rounded-3xl overflow-hidden" style={{ animationDelay: `-${(delaySeed % 6) * 0.9}s` }}>
        <div className="fs-media relative aspect-square">
          <ProductMediaCarousel media={product.media} />
          <span className="fs-chip absolute top-2 right-2 bg-black/75 backdrop-blur-md text-[#00FF66] text-xs font-black px-2.5 py-1 rounded-full border border-[#00FF66]/30">
            {formatPrice(product.price)}
          </span>
        </div>
        <div className="p-3 space-y-2">
          <h3 className="text-sm font-black text-white">{name}</h3>
          <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">{product.description}</p>
          {children}
          <button
            onClick={() => addToCart(product.id)}
            disabled={!storeEnabled}
            className="w-full py-2 rounded-xl bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-black cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add to Cart
          </button>
        </div>
      </div>
    </div>
  );

  const selectedCoke = cokeOptions.find((c) => c.id === selectedCokeId) || cokeOptions[0];

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <style>{CSS}</style>

      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-1.5 -ml-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-black italic tracking-tighter text-white">🍔 NOOB Food Stall</h1>
        </div>
        <button onClick={() => setShowCart(true)} className="relative p-2 rounded-full bg-zinc-900 border border-zinc-800 text-white cursor-pointer">
          <ShoppingCart className="w-4.5 h-4.5" />
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#00FF66] text-black text-[10px] font-black flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        {!storeEnabled && (
          <div className="mb-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold text-center">
            The stall isn't taking orders right now — browse away, but checkout is paused.
          </div>
        )}
        {loading ? (
          <div className="py-20 flex items-center justify-center text-zinc-500 text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading the menu…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {otherProducts.map((p, i) => (
              <Card key={p.id} product={p} name={p.name} delaySeed={i} />
            ))}
            {selectedCoke && (
              <Card key={selectedCoke.id} product={selectedCoke} name="Coke" delaySeed={otherProducts.length}>
                <div className="flex items-center gap-1">
                  {cokeOptions.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCokeId(c.id)}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-colors ${
                        c.id === selectedCokeId ? 'bg-[#00FF66]/15 border-[#00FF66]/50 text-[#00FF66]' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                      }`}
                    >
                      {['S', 'M', 'L'][i] || `${i + 1}`}
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end" onClick={() => setShowCart(false)}>
          <div className="w-full bg-zinc-950 border-t border-zinc-800 rounded-t-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-black text-white">Your Cart</h3>
              <button onClick={() => setShowCart(false)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cartLines.length === 0 ? (
                <p className="text-center text-zinc-500 text-xs py-8">Your cart is empty.</p>
              ) : (
                cartLines.map((l) => (
                  <div key={l.product.id} className="flex items-center gap-3">
                    <img src={l.product.media[0]?.url} alt="" className="w-12 h-12 rounded-xl object-cover bg-zinc-900 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{l.product.name}</p>
                      <p className="text-[11px] text-zinc-500">{formatPrice(l.product.price)} each</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => changeQty(l.product.id, -1)} className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-white cursor-pointer">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold text-white w-4 text-center">{l.quantity}</span>
                      <button onClick={() => changeQty(l.product.id, 1)} className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-white cursor-pointer">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {cartLines.length > 0 && (
              <div className="p-4 border-t border-zinc-800 space-y-3 shrink-0">
                <div className="flex justify-between text-sm font-black text-white">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <button
                  onClick={() => {
                    setShowCart(false);
                    setShowCheckout(true);
                  }}
                  disabled={!storeEnabled}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-sm font-black cursor-pointer hover:opacity-90 disabled:opacity-40"
                >
                  Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout */}
      {showCheckout && (
        <div className="fixed inset-0 z-[95] bg-zinc-950 flex flex-col">
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
            <button onClick={() => setShowCheckout(false)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-black text-white">Checkout</h2>
            <span className="w-8" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDeliveryMethod('pickup')}
                className={`py-2.5 rounded-xl text-xs font-bold border cursor-pointer flex items-center justify-center gap-1.5 ${
                  deliveryMethod === 'pickup' ? 'bg-[#00FF66]/15 border-[#00FF66]/50 text-[#00FF66]' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                <StoreIcon className="w-3.5 h-3.5" /> Pickup
              </button>
              <button
                onClick={() => setDeliveryMethod('delivery')}
                className={`py-2.5 rounded-xl text-xs font-bold border cursor-pointer flex items-center justify-center gap-1.5 ${
                  deliveryMethod === 'delivery' ? 'bg-[#00FF66]/15 border-[#00FF66]/50 text-[#00FF66]' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                <Truck className="w-3.5 h-3.5" /> Delivery
              </button>
            </div>

            <div className="space-y-2">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50" />
              {deliveryMethod === 'delivery' && (
                <>
                  <input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Delivery address" className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50" />
                    <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50" />
                  </div>
                  <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="Pincode" className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50" />
                </>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the stall (optional)" maxLength={300} className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50" />
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-zinc-400 uppercase">Payment</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2.5 rounded-xl text-xs font-bold border cursor-pointer flex items-center justify-center gap-1.5 ${
                    paymentMethod === 'cash' ? 'bg-[#00FF66]/15 border-[#00FF66]/50 text-[#00FF66]' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <Banknote className="w-3.5 h-3.5" /> Cash on {deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery'}
                </button>
                <button
                  onClick={() => upiId && setPaymentMethod('upi')}
                  disabled={!upiId}
                  title={upiId ? undefined : 'The stall has not set up UPI yet'}
                  className={`py-2.5 rounded-xl text-xs font-bold border cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                    paymentMethod === 'upi' ? 'bg-[#00FF66]/15 border-[#00FF66]/50 text-[#00FF66]' : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> UPI
                </button>
              </div>

              {paymentMethod === 'upi' && upiId && (
                <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                  <p className="text-[11px] text-zinc-400">
                    Pay exactly <span className="text-white font-bold">{formatPrice(total)}</span> to <span className="text-white font-bold">{upiId}</span> —
                    tap below to open any UPI app, or scan the QR with another device.
                  </p>
                  {qrDataUrl && (
                    <div className="w-36 h-36 mx-auto rounded-xl bg-white p-2">
                      <img src={qrDataUrl} alt="UPI QR code" className="w-full h-full object-contain" />
                    </div>
                  )}
                  <a
                    href={upiUri}
                    className="w-full py-2.5 rounded-xl bg-[#00FF66] text-black text-xs font-black cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-90"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Pay {formatPrice(total)} via UPI
                  </a>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(upiId);
                        setUpiCopied(true);
                        setTimeout(() => setUpiCopied(false), 2000);
                      } catch {
                        /* clipboard blocked */
                      }
                    }}
                    className="w-full py-2 rounded-xl border border-zinc-700 text-zinc-300 text-[11px] font-bold cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {upiCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-[#00FF66]" /> : <Copy className="w-3.5 h-3.5" />}
                    {upiCopied ? 'Copied' : 'Copy UPI ID'}
                  </button>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    There's no payment gateway — the stall checks their own UPI app for your payment before confirming the
                    order, so keep your payment screenshot handy just in case.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-zinc-800 pt-3 space-y-1 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {deliveryMethod === 'delivery' && (
                <div className="flex justify-between text-zinc-400">
                  <span>Delivery charge</span>
                  <span>{deliveryFee > 0 ? formatPrice(deliveryFee) : 'Free'}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-white pt-1">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>

            {placeError && <p className="text-xs text-red-400 font-semibold">{placeError}</p>}
          </div>
          <div className="p-4 border-t border-zinc-800 shrink-0">
            <button
              onClick={handlePlaceOrder}
              disabled={placing}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-sm font-black cursor-pointer hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {placing ? 'Placing order…' : `Place Order · ${formatPrice(total)}`}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation */}
      {placedOrderNo !== null && (
        <div className="fixed inset-0 z-[99] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPlacedOrderNo(null)}>
          <div className="w-full max-w-xs bg-zinc-950 border border-[#00FF66]/40 rounded-3xl p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-[#00FF66]/15 border border-[#00FF66]/40 flex items-center justify-center mx-auto">
              <Check className="w-7 h-7 text-[#00FF66]" />
            </div>
            <h3 className="text-base font-black text-white">Order #{placedOrderNo} placed!</h3>
            <p className="text-xs text-zinc-400">
              You'll get a notification the moment the stall confirms, when it's ready, and when it's handed over —
              track it anytime from Shop NOOB's Orders tab.
            </p>
            <button onClick={() => setPlacedOrderNo(null)} className="w-full py-2.5 rounded-xl bg-[#00FF66] text-black text-xs font-black cursor-pointer">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
