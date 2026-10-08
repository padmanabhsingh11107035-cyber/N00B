import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import {
  X, Plus, Minus, Loader2, Check, Store as StoreIcon, Truck,
  Banknote, Smartphone, Copy, CheckCircle2
} from 'lucide-react';
import { StoreProduct, User } from '../../types';
import { fetchStoreProducts, placeStoreOrder, getShopDetails, fetchSettings } from '../../services/api';
import { ProductMediaCarousel } from './ProductMediaCarousel';
import { OrdersView } from './OrdersView';
import { ShopMap } from './ShopMap';
import { FoodHeroMount } from './FoodHeroMount';
import { formatPrice } from './formatPrice';
import { loadCart, saveCart, type CartMap } from './cartStorage';
import { buildUpiUri } from '../../utils/upi';

interface FoodStallViewProps {
  currentUser: User;
  onClose: () => void;
}

// A static tilt (no running animation) that only reacts on an actual press, via :active — a
// continuously-running CSS animation on a transform-style:preserve-3d element is a known source of
// unreliable touch hit-testing on iOS Safari (the first tap can get "eaten" while the browser is
// mid-recompositing), which is exactly the "need two taps" bug this replaces.
const CSS = `
.fs-root button, .fs-root a, .fs-root input[type="checkbox"], .fs-root label{touch-action:manipulation}
.fs-stage{perspective:1000px}
.fs-card{transform-style:preserve-3d;transition:transform .2s ease-out}
.fs-card:active{transform:rotateX(2deg) rotateY(-3deg) scale(.97)}
.fs-media{transform:translateZ(18px)}
.fs-chip{transform:translateZ(36px)}
.fs-tilt-0{transform:rotateX(4deg) rotateY(-6deg)}
.fs-tilt-1{transform:rotateX(-3deg) rotateY(6deg)}
.fs-tilt-2{transform:rotateX(5deg) rotateY(4deg)}
@keyframes fs-pop{0%{transform:scale(1)}35%{transform:scale(1.35)}65%{transform:scale(.92)}100%{transform:scale(1)}}
.fs-bump{animation:fs-pop .4s ease-out}
@keyframes fs-toast-in{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
.fs-toast{animation:fs-toast-in .25s ease-out}
@keyframes fs-check-pop{0%{transform:scale(0)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
.fs-check-pop{animation:fs-check-pop .5s cubic-bezier(.34,1.56,.64,1)}
`;

const FOOD_CATEGORY = 'food_stall';
const cartStorageId = (userId: string) => `${userId}::food_stall`;

// The Food Stall's own pickup spot — Podar International School's main branch, Chandkheda —
// deliberately separate from SHOP_LAT/SHOP_LNG in ShopMap.tsx (Shop NOOB's own pickup address);
// coordinates resolved from OpenStreetMap's own geocoder, not guessed.
const FOOD_STALL_LAT = 23.1097883;
const FOOD_STALL_LNG = 72.5906670;
const FOOD_STALL_ADDRESS =
  'Podar International School, Behind Vitthal Complex, Opposite Sakaar School, Near Trishala Complex Cross Road, New C.G. Road, Chandkheda, Ahmedabad, Gujarat - 382424';

// The scroll-assembly hero (FoodHeroMount) covers exactly these 5 real products by name — anything
// else in the food_stall catalog (Bhel, the other Coke sizes) shows in a plain grid below it instead.
const HERO_COVERED_NAMES = new Set(['Burger', 'Fries', 'Manchurian', 'Coke (Medium Cup)', 'Diet Coke']);

// Defined at module scope (not inside FoodStallView) on purpose: a component declared inside
// another component's function body is a brand-new function identity every render, so React
// treats every <Card> as a different component type each time and fully unmounts/remounts the
// whole product grid (and every ProductMediaCarousel inside it) on every single state change —
// opening the cart, toggling checkout, anything. That churn is exactly the kind of disruption that
// can eat a tap on iOS, which is almost certainly why every button on this page needed two taps.
const FoodCard: React.FC<{
  product: StoreProduct;
  name: string;
  tiltIndex: number;
  foodStallEnabled: boolean;
  onAddToCart: (productId: string) => void;
  children?: React.ReactNode;
}> = ({ product, name, tiltIndex, foodStallEnabled, onAddToCart, children }) => {
  const comingSoon = !product.inStock;
  return (
    <div className="fs-stage">
      <div className={`fs-card fs-tilt-${tiltIndex % 3} bg-zinc-900/80 border border-zinc-800 rounded-3xl overflow-hidden ${comingSoon ? 'opacity-70' : ''}`}>
        <div className="fs-media relative aspect-square">
          <ProductMediaCarousel media={product.media} />
          {comingSoon && (
            <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
              <span className="bg-black/80 backdrop-blur-md text-amber-300 text-xs font-black px-3 py-1.5 rounded-full border border-amber-400/40">
                Coming Soon
              </span>
            </div>
          )}
          <span className="fs-chip absolute top-2 right-2 bg-black/75 backdrop-blur-md text-[#00FF66] text-xs font-black px-2.5 py-1 rounded-full border border-[#00FF66]/30">
            {formatPrice(product.price)}
          </span>
        </div>
        <div className="p-3 space-y-2">
          <h3 className="text-sm font-black text-white">{name}</h3>
          <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">{product.description}</p>
          {children}
          <button
            onClick={() => onAddToCart(product.id)}
            disabled={!foodStallEnabled || comingSoon}
            className="touch-manipulation w-full py-2 rounded-xl bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-black cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {comingSoon ? 'Coming Soon' : (
              <>
                <Plus className="w-3.5 h-3.5" /> Add to Cart
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FoodStallView: React.FC<FoodStallViewProps> = ({ currentUser, onClose }) => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartMap>(() => loadCart(cartStorageId(currentUser.id)));
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [upiPaymentConfirmed, setUpiPaymentConfirmed] = useState(false);
  const [foodStallEnabled, setFoodStallEnabled] = useState(true);
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
  const [cartToast, setCartToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchStoreProducts(), fetchSettings(), getShopDetails()]).then(([list, settings, shop]) => {
      if (!alive) return;
      setProducts(list);
      setFoodStallEnabled(!!settings.foodStallEnabled);
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
  const leftoverProducts = useMemo(() => foodProducts.filter((p) => !HERO_COVERED_NAMES.has(p.name)), [foodProducts]);

  const persistCart = (next: CartMap) => {
    setCart(next);
    saveCart(cartStorageId(currentUser.id), next);
  };

  const addToCart = (productId: string) => {
    persistCart({ ...cart, [productId]: (cart[productId] || 0) + 1 });
    const added = products.find((p) => p.id === productId);
    setCartToast(`Added ${added?.name || 'item'} to cart`);
  };

  useEffect(() => {
    if (!cartToast) return;
    const t = window.setTimeout(() => setCartToast(null), 1600);
    return () => window.clearTimeout(t);
  }, [cartToast]);

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

  // A fresh payment-method pick (or a fresh total to pay) can never inherit an earlier "I've paid" tick.
  useEffect(() => {
    setUpiPaymentConfirmed(false);
  }, [paymentMethod, total]);

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
    // No payment gateway exists to verify this automatically — the order is never created for UPI
    // until the buyer explicitly says they've actually paid.
    if (paymentMethod === 'upi' && !upiPaymentConfirmed) {
      setPlaceError('Please pay via UPI first, then confirm the payment is done.');
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
    confetti({ particleCount: 110, spread: 75, origin: { y: 0.65 }, colors: ['#00FF66', '#22d3ee', '#ffffff'], zIndex: 9999 });
  };

  // The hero's scroll-driven animation listens for the WINDOW's own 'scroll' event and measures
  // its sections with getBoundingClientRect() (viewport-relative either way) — correct regardless
  // of what actually scrolled, but this view is a position:fixed overlay with its own internal
  // scrolling, which never fires a window-level scroll event on its own. Forwarding one on every
  // scroll tick is the minimal bridge, with no change to the hero's own files.
  const forwardScrollToWindow = () => window.dispatchEvent(new Event('scroll'));

  const handleHeroAddToCart = (productId: string, quantity: number) => {
    for (let i = 0; i < Math.max(1, quantity); i++) addToCart(productId);
  };

  return (
    <div className="fs-root fixed inset-0 z-50 bg-zinc-950 overflow-y-auto" onScroll={forwardScrollToWindow}>
      <style>{CSS}</style>

      <button
        onClick={onClose}
        className="fixed top-3 left-3 z-[70] w-9 h-9 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-white flex items-center justify-center cursor-pointer hover:bg-black/85"
        aria-label="Close Food Stall"
      >
        <X className="w-4 h-4" />
      </button>

      {!foodStallEnabled && (
        <div className="m-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold text-center">
          The stall isn't taking orders right now — browse away, but checkout is paused.
        </div>
      )}

      {loading ? (
        <div className="py-20 flex items-center justify-center text-zinc-500 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the menu…
        </div>
      ) : (
        <FoodHeroMount
          products={foodProducts}
          onAddToCart={handleHeroAddToCart}
          onOpenCart={() => setShowCart(true)}
          onOpenOrders={() => setShowMyOrders(true)}
        />
      )}

      <div className="p-3 space-y-3">
        {!loading && leftoverProducts.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2 px-1">More from the menu</h3>
            <div className="grid grid-cols-1 gap-3">
              {leftoverProducts.map((p, i) => (
                <FoodCard key={p.id} product={p} name={p.name} tiltIndex={i} foodStallEnabled={foodStallEnabled} onAddToCart={addToCart} />
              ))}
            </div>
          </div>
        )}

        <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Find the stall</h3>
          <ShopMap lat={FOOD_STALL_LAT} lng={FOOD_STALL_LNG} address={FOOD_STALL_ADDRESS} label="NOOB Food Stall" className="w-full h-44 rounded-xl overflow-hidden" />
          <p className="text-[11px] text-zinc-400 leading-relaxed">{FOOD_STALL_ADDRESS}</p>
        </div>
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
                  disabled={!foodStallEnabled}
                  className="touch-manipulation w-full py-3 rounded-2xl bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-sm font-black cursor-pointer hover:opacity-90 disabled:opacity-40"
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
                    className="touch-manipulation w-full py-2.5 rounded-xl bg-[#00FF66] text-black text-xs font-black cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-90"
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
                    className="touch-manipulation w-full py-2 rounded-xl border border-zinc-700 text-zinc-300 text-[11px] font-bold cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {upiCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-[#00FF66]" /> : <Copy className="w-3.5 h-3.5" />}
                    {upiCopied ? 'Copied' : 'Copy UPI ID'}
                  </button>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    There's no payment gateway — this order will not be placed until you confirm below that you've
                    actually paid. The stall still checks their own UPI app before confirming it, so keep your payment
                    screenshot handy just in case.
                  </p>
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-black/40 border border-zinc-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={upiPaymentConfirmed}
                      onChange={(e) => setUpiPaymentConfirmed(e.target.checked)}
                      className="w-4 h-4 mt-0.5 shrink-0 accent-[#00FF66] cursor-pointer"
                    />
                    <span className="text-[11px] font-bold text-white">I have completed this UPI payment of {formatPrice(total)}</span>
                  </label>
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
              disabled={placing || (paymentMethod === 'upi' && !upiPaymentConfirmed)}
              className="touch-manipulation w-full py-3 rounded-2xl bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-sm font-black cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {placing
                ? 'Placing order…'
                : paymentMethod === 'upi' && !upiPaymentConfirmed
                ? 'Confirm payment above to continue'
                : `Place Order · ${formatPrice(total)}`}
            </button>
          </div>
        </div>
      )}

      {/* My Orders */}
      {showMyOrders && (
        <div className="fixed inset-0 z-[92] bg-zinc-950 flex flex-col">
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
            <button onClick={() => setShowMyOrders(false)} className="touch-manipulation p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-black text-white">My Orders</h2>
            <span className="w-7" />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <OrdersView canManage={false} />
          </div>
        </div>
      )}

      {/* Confirmation */}
      {placedOrderNo !== null && (
        <div className="fixed inset-0 z-[99] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPlacedOrderNo(null)}>
          <div className="w-full max-w-xs bg-zinc-950 border border-[#00FF66]/40 rounded-3xl p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="fs-check-pop w-14 h-14 rounded-full bg-[#00FF66]/15 border border-[#00FF66]/40 flex items-center justify-center mx-auto">
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

      {/* Added-to-cart toast */}
      {cartToast && (
        <div className="fs-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-[97] bg-zinc-900/95 backdrop-blur-md border border-[#00FF66]/40 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 whitespace-nowrap">
          <CheckCircle2 className="w-4 h-4 text-[#00FF66] shrink-0" />
          {cartToast}
        </div>
      )}
    </div>
  );
};
