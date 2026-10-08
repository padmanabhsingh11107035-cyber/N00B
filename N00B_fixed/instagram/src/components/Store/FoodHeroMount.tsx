import React, { useEffect, useRef } from 'react';
import { StoreProduct } from '../../types';

// The Manus-built "scroll assembly" hero — a plain CSS/JS module (public/food-hero/), not a React
// component, that mounts itself into a host <div> and owns its own look entirely (per the brief:
// no design changes). This wrapper's only job is the host-integration half its own README asks
// for: real prices/copy from the actual store_products rows (so every edit an admin makes in
// AdminFoodStallPanel's existing product editor shows up here too, with zero new admin UI), and
// routing its callbacks into this app's real cart/checkout/order-history instead of its own local
// preview drawer.
//
// The module ships with exactly 5 fixed product ids (burger, fries, manchurian, cola, diet-cola) —
// matched here to real food_stall products by name. If a match is missing (the Diet Coke migration
// not run yet, say) that one item just keeps the module's own placeholder price/copy instead of a
// real one; add-to-cart quietly does nothing for an unmatched id rather than adding a fake line.
const HERO_KEY_TO_PRODUCT_NAME: Record<string, string> = {
  burger: 'Burger',
  fries: 'Fries',
  manchurian: 'Manchurian',
  cola: 'Coke (Medium Cup)',
  'diet-cola': 'Diet Coke'
};

declare global {
  interface Window {
    NooobFoodHero?: {
      mount: (el: HTMLElement, options: Record<string, unknown>) => { destroy: () => void };
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;
function loadHeroScript(): Promise<void> {
  if (window.NooobFoodHero) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  if (!document.getElementById('nooob-food-hero-css')) {
    const link = document.createElement('link');
    link.id = 'nooob-food-hero-css';
    link.rel = 'stylesheet';
    link.href = '/food-hero/nooob-food-hero.css';
    document.head.appendChild(link);
  }
  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('nooob-food-hero-js') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('food hero script failed to load')), { once: true });
      if (window.NooobFoodHero) resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'nooob-food-hero-js';
    script.src = '/food-hero/nooob-food-hero.js';
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('food hero script failed to load'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

interface FoodHeroMountProps {
  products: StoreProduct[];
  onAddToCart: (productId: string, quantity: number) => void;
  onOpenCart: () => void;
  onOpenOrders: () => void;
}

export const FoodHeroMount: React.FC<FoodHeroMountProps> = ({ products, onAddToCart, onOpenCart, onOpenOrders }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  // Always-current callback refs so the mount effect (which only runs once) never closes over stale props.
  const addRef = useRef(onAddToCart);
  addRef.current = onAddToCart;
  const cartRef = useRef(onOpenCart);
  cartRef.current = onOpenCart;
  const ordersRef = useRef(onOpenOrders);
  ordersRef.current = onOpenOrders;
  const productsRef = useRef(products);
  productsRef.current = products;

  useEffect(() => {
    let destroyed = false;
    let instance: { destroy: () => void } | null = null;

    loadHeroScript()
      .then(() => {
        if (destroyed || !hostRef.current || !window.NooobFoodHero) return;
        const byName = new Map<string, StoreProduct>(productsRef.current.map((p) => [p.name, p]));
        const prices: Record<string, number> = {};
        const names: Record<string, string> = {};
        const descriptions: Record<string, string> = {};
        for (const [heroId, productName] of Object.entries(HERO_KEY_TO_PRODUCT_NAME)) {
          const real = byName.get(productName);
          if (real) {
            prices[heroId] = real.price;
            names[heroId] = real.name;
            descriptions[heroId] = real.description;
          }
        }

        instance = window.NooobFoodHero.mount(hostRef.current, {
          prices,
          names,
          descriptions,
          currency: 'INR',
          sound: true,
          assetBase: '/food-hero/assets/',
          onAddToCart: (payload: { items?: { id: string; quantity: number }[] }) => {
            for (const item of payload.items || []) {
              const productName = HERO_KEY_TO_PRODUCT_NAME[item.id];
              const real = productName ? byName.get(productName) : null;
              if (real) addRef.current(real.id, item.quantity || 1);
            }
          },
          onOpenCart: () => cartRef.current(),
          onOpenOrders: () => ordersRef.current()
        });
      })
      .catch((err) => console.error('Could not load the Food Stall hero:', err));

    return () => {
      destroyed = true;
      instance?.destroy();
    };
    // Mounted once per FoodStallView open — price/copy overrides are read fresh at mount time via
    // the refs above, so changing an admin price mid-session just needs a reopen, not a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} />;
};
