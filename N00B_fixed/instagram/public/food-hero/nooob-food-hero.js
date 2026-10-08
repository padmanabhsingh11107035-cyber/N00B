(function (global) {
  'use strict';

  const VERSION = '3.5.0';
  const scriptUrl = document.currentScript && document.currentScript.src;
  const defaultAssetBase = scriptUrl ? new URL('./assets/', scriptUrl).href : new URL('./assets/', document.baseURI).href;
  const PRODUCT_SEED = [
    { id: 'burger', name: 'Smash Burger', short: 'Burger', price: 149, image: 'burger.webp', description: 'Double smash patty, extra cheese, tomato and fresh crunch.', tone: '#df414b', parts: ['Bottom bun', 'Smash patty', 'Melted cheese', 'Tomato', 'Lettuce', 'Second smash patty', 'Extra cheese', 'Tomato', 'Extra lettuce', 'Sesame top bun'] },
    { id: 'fries', name: 'French Fries', short: 'Fries', price: 89, image: 'fries.webp', description: 'A heaped carton of hot, golden fries—packed to the brim.', tone: '#4aa9d0', parts: ['Empty carton', 'Golden fry 1', 'Golden fry 2', 'Golden fry 3', 'Golden fry 4', 'Golden fry 5', 'Golden fry 6', 'Golden fry 7', 'Golden fry 8', 'Golden fry 9', 'Golden fry 10', 'Golden fry 11', 'Golden fry 12', 'Golden fry 13', 'Golden fry 14'] },
    { id: 'diet-cola', name: 'Diet Cola', short: 'Diet Cola', price: 59, image: 'diet-cola.webp', description: 'Ice-cold, crisp and ready for a refreshing fizz.', tone: '#249eaa', parts: ['Cold can', 'Fresh pour', 'Ice + fizz', 'Ready to chill'] },
    { id: 'cola', name: 'Cola', short: 'Cola', price: 59, image: 'cola.webp', description: 'A bright, bubbly classic served ice-cold.', tone: '#ad263e', parts: ['Classic cola', 'Fresh pour', 'Ice + bubbles', 'Ready to sip'] },
    { id: 'manchurian', name: 'Manchurian', short: 'Manchurian', price: 129, image: 'manchurian.webp', description: 'A generous heap of saucy Gobi Manchurian, piled over the rim.', tone: '#c65c3d', parts: ['Serving bowl', 'Crispy gobi 1', 'Crispy gobi 2', 'Crispy gobi 3', 'Crispy gobi 4', 'Crispy gobi 5', 'Crispy gobi 6', 'Crispy gobi 7', 'Crispy gobi 8', 'Crispy gobi 9', 'Crispy gobi 10', 'Crispy gobi 11', 'Crispy gobi 12', 'Crispy gobi 13', 'Crispy gobi 14', 'Sauce glaze'] }
  ];
  const PIECES = [
    { top: '0%', bottom: '80%', x: -46, y: -148, rotate: -10, scale: 0.78 },
    { top: '20%', bottom: '60%', x: 54, y: -84, rotate: 8, scale: 0.84 },
    { top: '40%', bottom: '40%', x: 104, y: 4, rotate: -7, scale: 0.88 },
    { top: '60%', bottom: '20%', x: -66, y: 89, rotate: 9, scale: 0.83 },
    { top: '80%', bottom: '0%', x: 34, y: 150, rotate: -8, scale: 0.78 }
  ];
  const BURGER_LAYERS = [
    { name: 'Bottom bun', image: 'burger-layers/bottom-bun.webp', top: '80%', width: 92, startX: -0.08, startRotate: -8 },
    { name: 'Smash patty', image: 'burger-layers/patty.webp', top: '74%', width: 92, startX: 0.1, startRotate: 10 },
    { name: 'Melted cheese', image: 'burger-layers/cheese.webp', top: '69%', width: 100, startX: -0.1, startRotate: -13 },
    { name: 'Tomato', image: 'burger-layers/tomato.webp', top: '64%', width: 82, startX: 0.1, startRotate: 9 },
    { name: 'Lettuce', image: 'burger-layers/lettuce.webp', top: '60%', width: 100, startX: -0.08, startRotate: -8 },
    { name: 'Second smash patty', image: 'burger-layers/patty.webp', top: '55%', width: 94, startX: 0.08, startRotate: 7 },
    { name: 'Extra cheese', image: 'burger-layers/cheese.webp', top: '50%', width: 100, startX: -0.1, startRotate: -11 },
    { name: 'Tomato', image: 'burger-layers/tomato.webp', top: '46%', width: 82, startX: 0.09, startRotate: 8 },
    { name: 'Extra lettuce', image: 'burger-layers/lettuce.webp', top: '41%', width: 100, startX: -0.07, startRotate: -7 },
    { name: 'Sesame top bun', image: 'burger-layers/top-bun.webp', top: '34%', width: 94, startX: 0.08, startRotate: 12 }
  ];
  const FRIES_LAYERS = [
    { name: 'Empty fries carton', image: 'fries-layers/empty-carton.webp', top: '65%', left: 50, height: '68%', at: 0, startY: 0.9, startX: -0.03, startRotate: -7, startScale: 0.78 },
    { name: 'Golden fry', image: 'fries-layers/stick-a.webp', top: '39%', left: 23, height: '45%', at: 0.07, startX: -0.11, startRotate: -24, finalRotate: -16, startScale: 0.72 },
    { name: 'Golden fry', image: 'fries-layers/stick-b.webp', top: '34%', left: 30, height: '51%', at: 0.12, startX: 0.09, startRotate: -16, finalRotate: -11, startScale: 0.74 },
    { name: 'Golden fry', image: 'fries-layers/stick-c.webp', top: '28%', left: 36, height: '56%', at: 0.17, startX: -0.1, startRotate: -9, finalRotate: -6, startScale: 0.74 },
    { name: 'Golden fry', image: 'fries-layers/stick-d.webp', top: '34%', left: 42, height: '51%', at: 0.22, startX: 0.08, startRotate: 5, finalRotate: -3, startScale: 0.74 },
    { name: 'Golden fry', image: 'fries-layers/stick-a.webp', top: '26%', left: 48, height: '58%', at: 0.27, startX: -0.08, startRotate: -2, finalRotate: 1, startScale: 0.74 },
    { name: 'Golden fry', image: 'fries-layers/stick-b.webp', top: '31%', left: 54, height: '54%', at: 0.32, startX: 0.08, startRotate: 7, finalRotate: 4, startScale: 0.74 },
    { name: 'Golden fry', image: 'fries-layers/stick-c.webp', top: '29%', left: 60, height: '55%', at: 0.37, startX: -0.08, startRotate: -7, finalRotate: -4, startScale: 0.74 },
    { name: 'Golden fry', image: 'fries-layers/stick-d.webp', top: '34%', left: 66, height: '51%', at: 0.42, startX: 0.1, startRotate: 15, finalRotate: 8, startScale: 0.74 },
    { name: 'Golden fry', image: 'fries-layers/stick-a.webp', top: '39%', left: 73, height: '45%', at: 0.47, startX: -0.1, startRotate: 24, finalRotate: 15, startScale: 0.72 },
    { name: 'Golden fry', image: 'fries-layers/stick-b.webp', top: '42%', left: 35, height: '42%', at: 0.52, startX: 0.1, startRotate: -13, finalRotate: -9, startScale: 0.72 },
    { name: 'Golden fry', image: 'fries-layers/stick-d.webp', top: '40%', left: 57, height: '45%', at: 0.57, startX: -0.08, startRotate: 12, finalRotate: 7, startScale: 0.72 },
    { name: 'Golden fry', image: 'fries-layers/stick-c.webp', top: '44%', left: 78, height: '40%', at: 0.62, startX: 0.12, startRotate: 28, finalRotate: 20, startScale: 0.7 },
    { name: 'Golden fry', image: 'fries-layers/stick-b.webp', top: '49%', left: 15, height: '38%', at: 0.67, startX: -0.12, startRotate: -35, finalRotate: -31, startScale: 0.68 },
    { name: 'Golden fry', image: 'fries-layers/stick-d.webp', top: '50%', left: 85, height: '38%', at: 0.72, startX: 0.12, startRotate: 35, finalRotate: 31, startScale: 0.68 }
  ];
  const MANCHURIAN_LAYERS = [
    { name: 'Serving bowl', image: 'manchurian-layers/empty-bowl.webp', top: '71%', left: 50, width: 92, at: 0, startY: 0.86, startX: 0.02, startRotate: -4, startScale: 0.82 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-a.webp', top: '49%', left: 34, width: 21, at: 0.08, startX: -0.12, startRotate: -9, finalRotate: -5, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-b.webp', top: '47%', left: 50, width: 22, at: 0.12, startX: 0.08, startRotate: 7, finalRotate: 1, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-c.webp', top: '49%', left: 66, width: 21, at: 0.16, startX: 0.12, startRotate: 10, finalRotate: 6, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-d.webp', top: '58%', left: 22, width: 20, at: 0.20, startX: -0.12, startRotate: -16, finalRotate: -10, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-a.webp', top: '57%', left: 39, width: 21, at: 0.24, startX: 0.08, startRotate: -6, finalRotate: -5, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-b.webp', top: '58%', left: 55, width: 21, at: 0.28, startX: -0.05, startRotate: 8, finalRotate: 3, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-c.webp', top: '58%', left: 71, width: 20, at: 0.32, startX: 0.12, startRotate: 14, finalRotate: 10, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-d.webp', top: '58%', left: 82, width: 20, at: 0.36, startX: -0.08, startRotate: 18, finalRotate: 15, startScale: 0.62 },
    { name: 'Crispy gobi spill', image: 'manchurian-layers/gobi-a.webp', top: '67%', left: 15, width: 22, at: 0.40, startX: -0.1, startRotate: -18, finalRotate: -14, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-b.webp', top: '69%', left: 34, width: 21, at: 0.44, startX: 0.07, startRotate: -8, finalRotate: -6, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-c.webp', top: '69%', left: 56, width: 21, at: 0.48, startX: -0.06, startRotate: 8, finalRotate: 7, startScale: 0.62 },
    { name: 'Crispy gobi spill', image: 'manchurian-layers/gobi-d.webp', top: '67%', left: 85, width: 22, at: 0.52, startX: 0.1, startRotate: 18, finalRotate: 14, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-a.webp', top: '71%', left: 42, width: 22, at: 0.58, startX: -0.05, startRotate: -9, finalRotate: -5, startScale: 0.62 },
    { name: 'Crispy gobi', image: 'manchurian-layers/gobi-c.webp', top: '71%', left: 61, width: 22, at: 0.63, startX: 0.08, startRotate: 11, finalRotate: 8, startScale: 0.62 },
    { name: 'Manchurian sauce', image: 'manchurian-layers/sauce-drizzle.webp', top: '55%', left: 50, width: 46, at: 0.74, startX: -0.1, startRotate: -3, startScale: 0.8 }
  ];
  const ASSEMBLY_BUILDS = {
    burger: { layers: BURGER_LAYERS, duration: 0.17, stagger: 0.078, rise: 0.78 },
    fries: { layers: FRIES_LAYERS, duration: 0.15, rise: 0.78 },
    manchurian: { layers: MANCHURIAN_LAYERS, duration: 0.15, rise: 0.78 }
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const money = (value, currency) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(value);

  function safeText(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function markup(products, currency, assetRoot) {
    const sections = products.map((item, index) => {
      const imageUrl = safeText(new URL(item.image, assetRoot).href);
      const buildSpec = ASSEMBLY_BUILDS[item.id];
      const usesIngredientBuild = Boolean(buildSpec);
      const ingredients = buildSpec ? buildSpec.layers.map((layer, layerIndex) => {
        const layerUrl = safeText(new URL(layer.image, assetRoot).href);
        const width = layer.width == null ? 'auto' : `${layer.width}%`;
        const height = layer.height || 'auto';
        const startAt = layer.at == null ? layerIndex * (buildSpec.stagger || 0.12) : layer.at;
        return `<img class="nfh-ingredient-layer" data-ingredient-layer data-build-at="${startAt}" data-start-x="${layer.startX || 0}" data-start-y="${layer.startY == null ? buildSpec.rise : layer.startY}" data-start-rotate="${layer.startRotate || 0}" data-final-rotate="${layer.finalRotate || 0}" data-start-scale="${layer.startScale == null ? 0.86 : layer.startScale}" style="--layer-left:${layer.left == null ? 50 : layer.left}%;--layer-top:${layer.top};--layer-width:${width};--layer-height:${height};--layer-z:${layer.z || 2}" src="${layerUrl}" alt="" aria-hidden="true" decoding="async" loading="${item.id === 'burger' ? 'eager' : 'lazy'}" draggable="false">`;
      }).join('') : '';
      const pieces = usesIngredientBuild ? '' : PIECES.map((piece, pieceIndex) => `
        <img class="nfh-assembly-piece" data-piece data-slice="${pieceIndex}" data-x="${piece.x}" data-y="${piece.y}" data-rotate="${piece.rotate}" data-scale="${piece.scale}" style="--slice-top:${piece.top};--slice-bottom:${piece.bottom}" src="${imageUrl}" alt="" aria-hidden="true" decoding="async" loading="lazy" draggable="false">`).join('');
      return `
        <section class="nfh-story-section" id="nfh-story-${safeText(item.id)}" data-story="${safeText(item.id)}" data-index="${index}" style="--story-tone:${safeText(item.tone)}" aria-labelledby="nfh-title-${safeText(item.id)}">
          <div class="nfh-story-sticky">
            <div class="nfh-story-copy">
              <div class="nfh-story-kicker"><span>${String(index + 1).padStart(2, '0')} / ${String(products.length).padStart(2, '0')}</span><i aria-hidden="true">✦</i> SCROLL TO ASSEMBLE</div>
              <h2 id="nfh-title-${safeText(item.id)}">${safeText(item.name)}</h2>
              <p>${safeText(item.description)}</p>
              <div class="nfh-part-status" aria-live="polite"><span class="nfh-part-dot" aria-hidden="true"></span><span data-part-label>Waiting for the first layer</span><span class="nfh-part-count" data-part-count>00 / 00</span></div>
              <div class="nfh-ready-card" aria-hidden="true">
                <div class="nfh-ready-copy"><span>READY IN ORBIT</span><strong>${safeText(item.name)}</strong></div>
                <div class="nfh-ready-buy"><strong>${money(item.price, currency)}</strong><button class="nfh-add-button" type="button" data-action="add-cart" data-product="${safeText(item.id)}" disabled><span data-add-label>Add to cart</span> <span data-add-icon aria-hidden="true">＋</span></button></div>
              </div>
              <div class="nfh-scroll-cue" aria-hidden="true"><span></span> KEEP SCROLLING TO BUILD</div>
            </div>
            <div class="nfh-assembly" data-assembly role="img" aria-label="2D ${safeText(item.name)} assembly">
              <div class="nfh-assembly-orbit nfh-assembly-orbit--one" aria-hidden="true"></div>
              <div class="nfh-assembly-orbit nfh-assembly-orbit--two" aria-hidden="true"></div>
              <div class="nfh-assembly-portal" aria-hidden="true"><span></span></div>
              <div class="nfh-assembly-art${usesIngredientBuild ? ` nfh-assembly-art--${safeText(item.id)} nfh-assembly-art--ingredients` : ''}" aria-hidden="true">
                ${usesIngredientBuild ? `<div class="nfh-ingredient-build nfh-ingredient-build--${safeText(item.id)}" data-ingredient-build data-build-duration="${buildSpec.duration}" data-build-rise="${buildSpec.rise}">${ingredients}</div>` : pieces}
                ${usesIngredientBuild ? '' : `<img class="nfh-complete-image" src="${imageUrl}" alt="${safeText(item.name)}" aria-hidden="true" decoding="async" loading="lazy" draggable="false">`}
              </div>
              <div class="nfh-assembly-spark nfh-assembly-spark--one" aria-hidden="true">✦</div><div class="nfh-assembly-spark nfh-assembly-spark--two" aria-hidden="true">✧</div><div class="nfh-assembly-spark nfh-assembly-spark--three" aria-hidden="true">·</div>
              <div class="nfh-assembly-tag" aria-hidden="true">2D FOOD BUILD <b>↗</b></div>
            </div>
          </div>
        </section>`;
    }).join('');
    const steps = products.map((item, index) => `<button class="nfh-progress-step" type="button" data-jump="${safeText(item.id)}" aria-label="Jump to ${safeText(item.name)}"><span>${String(index + 1).padStart(2, '0')}</span><b>${safeText(item.short)}</b></button>`).join('');

    return `
      <div class="nfh-app">
        <header class="nfh-header">
          <a class="nfh-brand" href="#nfh-top" aria-label="NOOOB home"><span class="nfh-brand-mark" aria-hidden="true">✦</span><span><b>NOOOB</b><small>ORBITAL STREET FOOD</small></span></a>
          <div class="nfh-header-actions">
            <button class="nfh-header-button nfh-cart-button" type="button" data-action="open-cart" aria-label="Cart, 0 items"><span aria-hidden="true">▣</span> Cart <i data-cart-count>0</i></button>
            <button class="nfh-header-button nfh-orders-button" type="button" data-action="open-orders"><span aria-hidden="true">↗</span> My Orders</button>
          </div>
        </header>
        <main class="nfh-main" id="nfh-top">
          <section class="nfh-intro" aria-labelledby="nfh-intro-title">
            <div class="nfh-intro-copy">
              <div class="nfh-intro-kicker"><span aria-hidden="true">✦</span> NOOOB / THE ORBITAL MENU</div>
              <h1 id="nfh-intro-title">BUILT<br>TO <i>CRAVE.</i></h1>
              <p>Scroll to assemble the good stuff. One layer, one snack, one very happy orbit at a time.</p>
              <a class="nfh-start-button" href="#nfh-story-burger" data-start>Start the food build <span aria-hidden="true">↓</span></a>
            </div>
            <div class="nfh-intro-orbit" aria-hidden="true"><div class="nfh-intro-hole"><span>SCROLL<br>TO BUILD</span></div><i class="nfh-intro-star nfh-intro-star--one">✦</i><i class="nfh-intro-star nfh-intro-star--two">✧</i><i class="nfh-intro-star nfh-intro-star--three">·</i></div>
            <div class="nfh-intro-count">FIVE GOOD THINGS <span>01 — 05</span></div>
          </section>
          <div class="nfh-story-track" aria-label="Food assembly stories">${sections}</div>
          <section class="nfh-finish"><span>THAT’S THE WHOLE ORBIT</span><h2>Now make it<br><i>yours.</i></h2><p>Pick a favorite and we’ll save your spot in the cart.</p><button class="nfh-finish-button" type="button" data-action="open-cart">Open cart <span aria-hidden="true">↗</span></button></section>
        </main>
        <footer class="nfh-progress-footer" aria-label="Food build progress and navigation">
          <div class="nfh-progress-track" role="progressbar" aria-label="Menu assembly progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-progress-fill></span></div>
          <div class="nfh-progress-label"><span>BUILD YOUR CRAVINGS</span><strong data-progress-label>01 / 05 · SMASH BURGER</strong></div>
          <div class="nfh-progress-steps">${steps}</div>
          <span class="nfh-progress-percent" data-progress-percent>00%</span>
        </footer>
        <div class="nfh-toast" role="status" aria-live="polite"></div>
        <div class="nfh-overlay" data-overlay hidden>
          <button class="nfh-drawer-scrim" type="button" data-action="close-panel" aria-label="Close panel"></button>
          <aside class="nfh-drawer" role="dialog" aria-modal="true" aria-labelledby="nfh-drawer-title">
            <div class="nfh-drawer-head"><div><span class="nfh-drawer-kicker">NOOOB / ACCOUNT</span><h2 id="nfh-drawer-title" data-drawer-title>Cart</h2></div><button class="nfh-drawer-close" type="button" data-action="close-panel" aria-label="Close">×</button></div>
            <div class="nfh-drawer-body" data-drawer-body></div>
          </aside>
        </div>
      </div>`;
  }

  function mount(element, options) {
    if (!element || !(element instanceof Element)) throw new Error('NooobFoodHero.mount needs a host element.');
    if (element.__nooobFoodHero) element.__nooobFoodHero.destroy();
    const config = Object.assign({ currency: 'INR', assetBase: defaultAssetBase, prices: {}, names: {}, descriptions: {}, onAddToCart: null, onOpenCart: null, onOpenOrders: null, reducedMotion: null, sound: true }, options || {});
    const currency = config.currency;
    const products = PRODUCT_SEED.map(product => Object.assign({}, product, {
      price: Number.isFinite(Number(config.prices[product.id])) ? Number(config.prices[product.id]) : product.price,
      name: config.names[product.id] || product.name,
      description: config.descriptions[product.id] || product.description
    }));
    const assetRoot = new URL(config.assetBase, document.baseURI);
    if (!assetRoot.pathname.endsWith('/')) assetRoot.pathname += '/';
    const productMap = new Map(products.map(product => [product.id, product]));
    element.innerHTML = markup(products, currency, assetRoot);

    const app = element.querySelector('.nfh-app');
    const header = app.querySelector('.nfh-header');
    const footer = app.querySelector('.nfh-progress-footer');
    const progressBar = app.querySelector('.nfh-progress-track');
    const sections = Array.from(app.querySelectorAll('[data-story]'));
    const overlay = app.querySelector('[data-overlay]');
    const drawerTitle = app.querySelector('[data-drawer-title]');
    const drawerBody = app.querySelector('[data-drawer-body]');
    const toast = app.querySelector('.nfh-toast');
    const cartButton = app.querySelector('[data-action="open-cart"]');
    const ordersButton = app.querySelector('[data-action="open-orders"]');
    const prefersReduced = config.reducedMotion === null ? !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) : !!config.reducedMotion;
    const basket = new Map();
    let destroyed = false;
    let raf = 0;
    let toastTimer;
    let returnFocus = null;
    let audioContext = null;

    function cartSnapshot() {
      const items = Array.from(basket.values()).map(line => ({ id: line.product.id, name: line.product.name, price: line.product.price, quantity: line.quantity }));
      return { source: 'nooob-food-story', currency, items, total: items.reduce((sum, item) => sum + item.price * item.quantity, 0) };
    }

    function updateCartBadge() {
      const count = Array.from(basket.values()).reduce((sum, line) => sum + line.quantity, 0);
      const badge = app.querySelector('[data-cart-count]');
      badge.textContent = String(count);
      cartButton.setAttribute('aria-label', `Cart, ${count} ${count === 1 ? 'item' : 'items'}`);
    }

    function showToast(text) {
      toast.textContent = text;
      toast.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2500);
    }

    function playCartSound() {
      if (config.sound === false) return;
      const AudioContextCtor = global.AudioContext || global.webkitAudioContext;
      if (typeof AudioContextCtor !== 'function') return;
      try {
        if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextCtor();
        const play = () => {
          const now = audioContext.currentTime;
          [[660, 0], [880, 0.075]].forEach(([frequency, delay]) => {
            const start = now + delay;
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.045, start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(start);
            oscillator.stop(start + 0.18);
          });
        };
        if (audioContext.state === 'suspended') {
          const resumed = audioContext.resume();
          if (resumed && typeof resumed.then === 'function') resumed.then(play).catch(() => {});
          else play();
        } else play();
      } catch (_) {
        // Sound is optional feedback; it must never block the cart action.
      }
    }

    function animateAddFeedback(button, productName) {
      const badge = cartButton.querySelector('[data-cart-count]');
      if (!prefersReduced) {
        [[cartButton, 'is-bumped'], [badge, 'is-popped'], [button, 'is-added']].forEach(([target, className]) => {
          if (!target) return;
          target.classList.remove(className);
          void target.offsetWidth;
          target.classList.add(className);
          global.setTimeout(() => target.classList.remove(className), 480);
        });
      }
      if (!button) return;
      const label = button.querySelector('[data-add-label]');
      const icon = button.querySelector('[data-add-icon]');
      if (!label) return;
      if (button.__nfhFeedbackTimer) global.clearTimeout(button.__nfhFeedbackTimer);
      label.textContent = 'Added!';
      if (icon) icon.textContent = '✓';
      button.setAttribute('aria-label', `${productName} added to cart`);
      button.__nfhFeedbackTimer = global.setTimeout(() => {
        if (!button.isConnected) return;
        label.textContent = 'Add to cart';
        if (icon) icon.textContent = '＋';
        button.removeAttribute('aria-label');
        button.classList.remove('is-added');
        delete button.__nfhFeedbackTimer;
      }, 950);
    }

    function addToCart(items, source, triggerButton) {
      items.filter(Boolean).forEach(product => {
        const line = basket.get(product.id) || { product, quantity: 0 };
        line.quantity += 1;
        basket.set(product.id, line);
      });
      updateCartBadge();
      playCartSound();
      animateAddFeedback(triggerButton, items[0] && items[0].name);
      const snapshot = cartSnapshot();
      const payload = Object.assign({}, snapshot, {
        source: source || 'product-ready',
        item: items.length === 1 ? { id: items[0].id, name: items[0].name, price: items[0].price, quantity: 1 } : undefined,
        items: items.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: 1 })),
        total: items.reduce((sum, item) => sum + item.price, 0)
      });
      if (typeof config.onAddToCart === 'function') {
        try { config.onAddToCart(payload); } catch (error) { console.error('[NooobFoodHero] Cart callback failed:', error); }
      }
      element.dispatchEvent(new CustomEvent('nooob:add-to-cart', { detail: payload }));
      global.dispatchEvent(new CustomEvent('nooob:add-to-cart', { detail: payload }));
      showToast(items.length === 1 ? `${items[0].name} added to cart` : `${items.length} items added to cart`);
    }

    function cartPanelMarkup() {
      const lines = Array.from(basket.values());
      if (!lines.length) return `<div class="nfh-empty-cart"><span aria-hidden="true">✦</span><h3>Your cart is orbiting empty.</h3><p>Scroll through the menu and add a freshly assembled favorite.</p><button class="nfh-panel-continue" type="button" data-action="close-panel">Keep exploring</button></div>`;
      const rows = lines.map(({ product, quantity }) => `<div class="nfh-cart-row"><div><strong>${safeText(product.name)}</strong><small>${money(product.price, currency)} each</small></div><span>×${quantity}</span><strong>${money(product.price * quantity, currency)}</strong><button class="nfh-cart-remove" type="button" data-remove-id="${safeText(product.id)}" aria-label="Remove one ${safeText(product.name)}">−</button></div>`).join('');
      return `<div class="nfh-cart-lines">${rows}</div><div class="nfh-cart-total"><span>Subtotal</span><strong>${money(cartSnapshot().total, currency)}</strong></div><p class="nfh-cart-note">This preview basket sends items to your site through the cart integration hook. Checkout stays with your existing store.</p><button class="nfh-panel-continue" type="button" data-action="close-panel">Continue exploring</button>`;
    }

    function ordersPanelMarkup() {
      return `<div class="nfh-orders-empty"><span aria-hidden="true">✦</span><h3>Your next favorite starts here.</h3><p>Past orders are managed by your shop account. Connect the <code>onOpenOrders</code> callback or <code>nooob:open-orders</code> event to show your real order history.</p><button class="nfh-panel-continue" type="button" data-action="close-panel">Back to the menu</button></div>`;
    }

    function openPanel(mode) {
      returnFocus = document.activeElement;
      drawerTitle.textContent = mode === 'cart' ? `Cart (${cartSnapshot().items.reduce((sum, item) => sum + item.quantity, 0)})` : 'My Orders';
      drawerBody.innerHTML = mode === 'cart' ? cartPanelMarkup() : ordersPanelMarkup();
      overlay.hidden = false;
      app.dataset.panel = mode;
      const closeButton = overlay.querySelector('.nfh-drawer-close');
      global.requestAnimationFrame(() => closeButton && closeButton.focus());
    }

    function closePanel() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      delete app.dataset.panel;
      if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    }

    function emitPanelEvent(type, detail) {
      const eventName = `nooob:${type}`;
      element.dispatchEvent(new CustomEvent(eventName, { detail }));
      global.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    function openCart() {
      const detail = cartSnapshot();
      emitPanelEvent('open-cart', detail);
      if (typeof config.onOpenCart === 'function') {
        try { config.onOpenCart(detail); return; } catch (error) { console.error('[NooobFoodHero] Cart opener failed:', error); }
      }
      openPanel('cart');
    }

    function openOrders() {
      const detail = { source: 'nooob-food-story' };
      emitPanelEvent('open-orders', detail);
      if (typeof config.onOpenOrders === 'function') {
        try { config.onOpenOrders(detail); return; } catch (error) { console.error('[NooobFoodHero] Orders opener failed:', error); }
      }
      openPanel('orders');
    }

    function updateAssembly(section, progress) {
      const p = prefersReduced ? 1 : clamp(progress, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const ingredientBuild = section.querySelector('[data-ingredient-build]');
      if (ingredientBuild) {
        const duration = Number(ingredientBuild.dataset.buildDuration) || 0.17;
        const defaultRise = Number(ingredientBuild.dataset.buildRise) || 0.78;
        ingredientBuild.querySelectorAll('[data-ingredient-layer]').forEach(layer => {
          const arrival = clamp((p - Number(layer.dataset.buildAt || 0)) / duration, 0, 1);
          const layerEase = 1 - Math.pow(1 - arrival, 3);
          const remaining = 1 - layerEase;
          const x = Number(layer.dataset.startX) * ingredientBuild.clientWidth * remaining;
          const y = ingredientBuild.clientHeight * (Number(layer.dataset.startY) || defaultRise) * remaining;
          const finalRotation = Number(layer.dataset.finalRotate) || 0;
          const rotation = finalRotation + (Number(layer.dataset.startRotate) - finalRotation) * remaining;
          const landing = clamp((arrival - 0.72) / 0.28, 0, 1);
          const bounce = Math.sin(landing * Math.PI) * 6;
          const startScale = Number(layer.dataset.startScale) || 0.86;
          const scale = startScale + (1 - startScale) * layerEase - Math.sin(landing * Math.PI) * 0.025;
          layer.style.transform = `translate3d(calc(-50% + ${x}px),calc(-50% + ${y - bounce}px),0) rotate(${rotation}deg) scale(${scale})`;
          layer.style.opacity = String(clamp(arrival / 0.12, 0, 1));
        });
      } else {
        const pieces = section.querySelectorAll('[data-piece]');
        pieces.forEach(piece => {
          const remain = 1 - eased;
          const x = Number(piece.dataset.x) * remain;
          const y = Number(piece.dataset.y) * remain;
          const rotate = Number(piece.dataset.rotate) * remain;
          const startScale = Number(piece.dataset.scale);
          const scale = startScale + (1 - startScale) * eased;
          const layerOpacity = 1 - clamp((p - 0.68) / 0.28, 0, 1);
          piece.style.transform = `translate3d(${x}px,${y}px,0) rotate(${rotate}deg) scale(${scale})`;
          piece.style.opacity = String(layerOpacity);
        });
      }
      const finalImage = section.querySelector('.nfh-complete-image');
      if (finalImage) finalImage.style.opacity = String(clamp((p - 0.64) / 0.28, 0, 1));
      const ready = prefersReduced || p >= 0.9;
      section.classList.toggle('is-ready', ready);
      if (finalImage) finalImage.setAttribute('aria-hidden', String(!ready));
      section.querySelector('.nfh-ready-card').setAttribute('aria-hidden', String(!ready));
      const addButton = section.querySelector('[data-action="add-cart"]');
      addButton.disabled = !ready;
      const label = section.querySelector('[data-part-label]');
      const count = section.querySelector('[data-part-count]');
      const product = productMap.get(section.dataset.story);
      if (ready) {
        label.textContent = 'Fully assembled · ready to order';
        count.textContent = `${String(product.parts.length).padStart(2, '0')} / ${String(product.parts.length).padStart(2, '0')}`;
      } else {
        const step = Math.min(product.parts.length - 1, Math.floor(p * product.parts.length));
        label.textContent = product.parts[step];
        count.textContent = `${String(step + 1).padStart(2, '0')} / ${String(product.parts.length).padStart(2, '0')}`;
      }
      section.dataset.progress = p.toFixed(3);
      return p;
    }

    function updateScroll() {
      raf = 0;
      if (destroyed) return;
      const headerHeight = header.getBoundingClientRect().height;
      const footerHeight = footer.getBoundingClientRect().height;
      const viewportHeight = global.innerHeight || document.documentElement.clientHeight;
      const stickyHeight = Math.max(1, viewportHeight - headerHeight - footerHeight);
      const states = sections.map(section => {
        const rect = section.getBoundingClientRect();
        const travel = Math.max(1, section.offsetHeight - stickyHeight);
        const progress = clamp((headerHeight - rect.top) / travel, 0, 1);
        const p = updateAssembly(section, progress);
        return { rect, progress: p, travel, section };
      });
      let active = states.findIndex(state => state.rect.top <= headerHeight + 1 && state.rect.bottom > headerHeight + 1);
      if (active < 0) {
        active = states.findIndex(state => state.rect.top > headerHeight);
        if (active < 0) active = states.length - 1;
      }
      let activeProgress = states[active] ? states[active].progress : 0;
      const firstTop = states[0].rect.top + global.scrollY;
      if (global.scrollY < firstTop - headerHeight) activeProgress = 0;
      const overall = clamp((active + activeProgress) / states.length, 0, 1);
      app.querySelector('[data-progress-fill]').style.width = `${overall * 100}%`;
      app.querySelector('[data-progress-percent]').textContent = `${String(Math.round(overall * 100)).padStart(2, '0')}%`;
      const activeProduct = products[active] || products[0];
      app.querySelector('[data-progress-label]').textContent = `${String(active + 1).padStart(2, '0')} / ${String(products.length).padStart(2, '0')} · ${activeProduct.name.toUpperCase()}`;
      app.querySelectorAll('[data-jump]').forEach((button, index) => {
        button.classList.toggle('is-active', index === active);
        button.classList.toggle('is-complete', index < active);
        if (index === active) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      });
      progressBar.setAttribute('aria-valuenow', String(Math.round(overall * 100)));
    }

    function onScroll() {
      if (!raf) raf = global.requestAnimationFrame(updateScroll);
    }

    function onKeydown(event) {
      if (event.key === 'Escape') closePanel();
    }

    cartButton.addEventListener('click', openCart);
    ordersButton.addEventListener('click', openOrders);
    overlay.addEventListener('click', event => {
      if (event.target.closest('[data-action="close-panel"]')) { closePanel(); return; }
      const remove = event.target.closest('[data-remove-id]');
      if (remove) {
        const line = basket.get(remove.dataset.removeId);
        if (line) { line.quantity -= 1; if (line.quantity <= 0) basket.delete(remove.dataset.removeId); updateCartBadge(); drawerTitle.textContent = `Cart (${cartSnapshot().items.reduce((sum, item) => sum + item.quantity, 0)})`; drawerBody.innerHTML = cartPanelMarkup(); }
      }
    });
    app.querySelectorAll('[data-action="add-cart"]').forEach(button => button.addEventListener('click', () => {
      const product = productMap.get(button.dataset.product);
      if (!button.disabled && product) addToCart([product], 'assembled-product', button);
    }));
    app.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => {
      const target = app.querySelector(`#nfh-story-${CSS.escape(button.dataset.jump)}`);
      if (target) target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    }));
    app.querySelector('[data-start]').addEventListener('click', event => {
      event.preventDefault();
      sections[0].scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    });
    app.querySelector('[data-action="open-cart"]:not(.nfh-cart-button)').addEventListener('click', openCart);
    global.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('resize', onScroll, { passive: true });
    global.addEventListener('keydown', onKeydown);
    updateCartBadge();
    updateScroll();

    element.__nooobFoodHero = {
      destroy() {
        destroyed = true;
        clearTimeout(toastTimer);
        app.querySelectorAll('.nfh-add-button').forEach(button => { if (button.__nfhFeedbackTimer) global.clearTimeout(button.__nfhFeedbackTimer); });
        if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
        if (raf) global.cancelAnimationFrame(raf);
        global.removeEventListener('scroll', onScroll);
        global.removeEventListener('resize', onScroll);
        global.removeEventListener('keydown', onKeydown);
        if (element.__nooobFoodHero) delete element.__nooobFoodHero;
        element.innerHTML = '';
      },
      addToCart(id) { const product = productMap.get(id); if (product) addToCart([product], 'api'); },
      select(id) { const target = app.querySelector(`#nfh-story-${CSS.escape(id)}`); if (target) target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' }); },
      version: VERSION
    };
    return element.__nooobFoodHero;
  }

  global.NooobFoodHero = Object.freeze({ mount, products: PRODUCT_SEED.map(({ id, name, price, description }) => ({ id, name, price, description })), version: VERSION });
})(window);
