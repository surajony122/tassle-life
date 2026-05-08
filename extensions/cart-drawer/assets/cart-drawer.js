/* theme-check-disable AssetSizeAppBlockJavaScript */
/**
 * Cart Drawer — storefront JS
 * Features: multi-tier progress bar, gift wrap, delivery date,
 *           handwritten note, discount code + available discounts,
 *           upsell recommendations, AJAX cart (qty / remove / add)
 */

class TasslelifeCartDrawer {
  constructor() {
    this.drawer = document.getElementById('tasslelife-cart-drawer');
    if (!this.drawer) return;

    // Core refs
    this.overlay       = document.getElementById('tasslelife-cart-drawer-overlay');
    this.itemsContainer = document.getElementById('tasslelife-cart-drawer-items');
    this.subtotalEl    = document.getElementById('tasslelife-cart-drawer-subtotal');
    this.countEl       = document.getElementById('tasslelife-cart-drawer-count');
    this.footer        = document.getElementById('tasslelife-cart-drawer-footer');
    this.progressEl    = document.getElementById('tasslelife-cart-drawer-progress');
    this.upsellSection = document.getElementById('tasslelife-cart-drawer-upsell');
    this.upsellItems   = document.getElementById('tasslelife-cart-drawer-upsell-items');

    // Feature state
    this.isUpdating       = false;
    this.noteTimeout      = null;
    this.giftWrapVariantId = null;
    this.giftWrapCheckbox  = null;
    this.deliveryDateInput = null;
    this.noteTextarea      = null;
    this.discountInput     = null;
    this.discountMsg       = null;
    this.discountApplyBtn  = null;
    this._skipIntercept    = false; // prevents internal fetches re-triggering drawer

    this.settings = {
      currency: this.drawer.dataset.currency || window.Shopify?.currency?.active || 'USD',
    };

    // Read progress bar tiers from data attributes on #tasslelife-cart-drawer-progress
    this.progressTiers = this.readProgressTiers();

    this.init();
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  init() {
    this.bindStaticEvents();
    this.interceptAddToCart();
    this.interceptFormSubmits();
    this.interceptCartIconLinks();
    this.initGiftWrap();
    this.initDeliveryDate();
    this.initNote();
    this.initDiscount();
    this.initTimeline();
    this.initSavingsRow();
  }

  readProgressTiers() {
    if (!this.progressEl) return [];
    const tiers = [];
    const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 12l2.5 2.5L16 9"/></svg>`;
    [1, 2, 3, 4].forEach((n) => {
      const t = this.progressEl.dataset[`tier${n}Threshold`];
      const l = this.progressEl.dataset[`tier${n}Label`];
      if (t && parseFloat(t) > 0) {
        tiers.push({ threshold: parseFloat(t), label: l || `Reward ${n}`, icon: icon });
      }
    });
    return tiers.sort((a, b) => a.threshold - b.threshold);
  }

  // ─── Open / Close ─────────────────────────────────────────────────────────

  async open() {
    await this.refresh();
    this.drawer.classList.add('is-open');
    this.overlay.classList.add('is-visible');
    document.body.classList.add('tasslelife-cart-drawer-open');
    this.drawer.setAttribute('aria-hidden', 'false');
    // Suppress the theme's own cart drawer/notification (runs at 0 / 150 / 400ms
    // to cover themes that open their cart asynchronously after the fetch resolves)
    this.suppressThemeCart();
    setTimeout(() => this.suppressThemeCart(), 150);
    setTimeout(() => this.suppressThemeCart(), 400);
  }

  close() {
    this.drawer.classList.remove('is-open');
    this.overlay.classList.remove('is-visible');
    document.body.classList.remove('tasslelife-cart-drawer-open');
    this.drawer.setAttribute('aria-hidden', 'true');
  }

  // ─── Static Event Binding ─────────────────────────────────────────────────

  bindStaticEvents() {
    this.overlay?.addEventListener('click', () => this.close());
    this.drawer.querySelectorAll('[data-tasslelife-cart-drawer-close]').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.close();
    });
  }

  interceptCartIconLinks() {
    // Selectors for cart icon links/buttons — safe ones that are never also ATC buttons
    const safeSelectors = [
      'a[href="/cart"]',
      'a[href$="/cart"]',       // For multi-language (e.g. /fr/cart)
      'a[href*="/cart?"]',      // For query params
      '#cart-icon-bubble',
      '.cart-icon-bubble',
      '.header__icon--cart',
      'a[href="/cart/show"]',
      '[data-cart-icon]',
      '.cart__icon',
      'a.site-header__cart',
      '.js-drawer-open-cart',
      '.site-header__cart-toggle',
      '#CartButton',
      '.cart-link'
    ].join(',');

    // A single global capture-phase listener guarantees we intercept the click BEFORE
    // the event travels down to the button itself, completely blocking the theme's JS.
    document.addEventListener('click', (e) => {
      const cartLink = e.target.closest(safeSelectors);
      if (cartLink) {
        e.preventDefault();
        e.stopPropagation(); // Stops the event from reaching the theme's elements
        this.open();
      }
    }, true);
  }

  // ─── Suppress theme cart (Horizon + other themes) ────────────────────────

  suppressThemeCart() {
    // Elements to close — covers Horizon, Dawn, Refresh, and other common themes
    const cartEls = [
      '#cart-notification',
      'cart-notification',
      '#CartNotification',
      '#CartDrawer',
      '#cart-drawer',
      'cart-drawer',
      '#CartDrawerContainer',
      '.cart-drawer',
      '.cart-notification',
      '[data-cart-drawer]',
      '.js-cart-drawer',
      '#mini-cart',
      '.mini-cart',
      '.ajax-cart',
    ];
    cartEls.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          // Covers <details open>, aria-expanded, custom open attribute, visible classes
          if (el.tagName === 'DETAILS') el.open = false;
          el.removeAttribute('open');
          el.setAttribute('aria-expanded', 'false');
          el.setAttribute('aria-hidden', 'true');
          el.classList.remove('is-open', 'is-active', 'active', 'open', 'is-visible',
                              'animate-in', 'cart-open', 'drawer--open', 'show');
          el.style.display === 'block' && (el.style.display = '');
          // Horizon's cart-notification uses a close() method
          if (typeof el.close === 'function') el.close();
          if (typeof el.hide === 'function') el.hide();
        });
      } catch {}
    });

    // Body/html overflow classes that themes add when their cart is open
    ['overflow-hidden', 'cart-is-open', 'drawer-open', 'is-cart-open', 'js-cart-open',
     'cart-notification-open', 'prevent-scroll']
      .forEach(cls => {
        document.body.classList.remove(cls);
        document.documentElement.classList.remove(cls);
      });

    // Overlays
    ['#modal-overlay', '.overlay--cart', '.cart-overlay', '.js-cart-overlay',
     '#CartOverlay', '.drawer__overlay']
      .forEach(sel => {
        try {
          document.querySelectorAll(sel).forEach(el =>
            el.classList.remove('is-visible', 'active', 'is-active', 'open'));
        } catch {}
      });
  }

  interceptAddToCart() {
    const self = this;

    // ── Intercept fetch ──────────────────────────────────────────
    const originalFetch = window.fetch;

    window.fetch = function () {
      const promise = originalFetch.apply(window, arguments);

      if (!self._skipIntercept) {
        const args = arguments;
        let url = '';
        if (typeof args[0] === 'string') {
          url = args[0];
        } else if (args[0] && typeof args[0].url === 'string') {
          url = args[0].url;
        }

        if (url && url.includes('/cart/add')) {
          // Observe the promise on the side — never modify it
          promise.then(function (response) {
            if (response.ok) {
              // Let the theme's own .then() handlers run first, then open our drawer
              setTimeout(function () {
                try { self.open(); } catch (e) {}
              }, 50);
            }
          }).catch(function () {}); // absorb errors — never affect the original chain
        }
      }

      return promise; // theme gets back the exact original Promise
    };

    // ── Intercept XHR (legacy themes) ───────────────────────────
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      if (typeof url === 'string' && url.includes('/cart/add')) {
        this.addEventListener('load', function () {
          if (!self._skipIntercept && this.status >= 200 && this.status < 300) {
            setTimeout(function () {
              try { self.open(); } catch (e) {}
            }, 50);
          }
        });
      }
      return originalXhrOpen.call(this, method, url, ...rest);
    };

    // ── Custom theme events ──────────────────────────────────────
    // These events are fired by various themes (Dawn, Horizon, Prestige, etc.)
    ['cart:add', 'cart:item-added', 'product:added-to-cart', 'Shopify:cart-add-item'].forEach(evt => {
      document.addEventListener(evt, function () {
        if (!self._skipIntercept) {
          setTimeout(function () { try { self.open(); } catch (e) {} }, 50);
        }
      });
    });
    document.addEventListener('cart:updated', function () {
      try { self.refresh(); } catch (e) {}
    });

    // ── Horizon: intercept cart-notification show() before it renders ────
    // Horizon calls cartNotification.renderContents() then show() after ATC
    const patchCartNotification = () => {
      const notif = document.querySelector('cart-notification');
      if (notif && !notif._tasslelifePatchedOpen) {
        notif._tasslelifePatchedOpen = true;
        const originalOpen = notif.open?.bind(notif);
        const originalShow = notif.show?.bind(notif);
        if (typeof originalOpen === 'function') {
          notif.open = function(...args) {
            if (!self._skipIntercept) { self.suppressThemeCart(); return; }
            return originalOpen(...args);
          };
        }
        if (typeof originalShow === 'function') {
          notif.show = function(...args) {
            if (!self._skipIntercept) { self.suppressThemeCart(); return; }
            return originalShow(...args);
          };
        }
      }
    };
    // Try immediately, then watch for Horizon's lazy element upgrade
    patchCartNotification();
    const upgradeObserver = new MutationObserver(patchCartNotification);
    upgradeObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => upgradeObserver.disconnect(), 10000);
  }

  // ─── Form Submission Intercept (for non-AJAX themes) ────────────────────
  
  interceptFormSubmits() {
    document.addEventListener('submit', async (e) => {
      // If theme already prevents default to do its own AJAX, let it handle it
      if (e.defaultPrevented) return;

      const form = e.target;
      const action = form.getAttribute('action') || form.action || '';
      
      if (action.includes('/cart/add')) {
        e.preventDefault(); // Stop full page redirect
        
        const formData = new FormData(form);
        this._skipIntercept = true;
        
        // Optional: show loading state on the button
        const submitBtn = form.querySelector('[type="submit"], button:not([type="button"])');
        let originalText = '';
        if (submitBtn) {
          originalText = submitBtn.innerHTML;
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<div class="tasslelife-cart-drawer__spinner" style="width:20px;height:20px;border-width:2px;margin:auto;"></div>';
        }

        try {
          const res = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Accept': 'application/javascript' },
            body: formData
          });
          
          if (res.ok) {
            await this.open();
          } else {
            const err = await res.json();
            alert(err.description || 'Error adding item to cart');
          }
        } catch (err) {
          console.error('Cart Drawer Error:', err);
        } finally {
          this._skipIntercept = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
          }
        }
      }
    });
  }

  // ─── Gift Wrap ────────────────────────────────────────────────────────────

  initGiftWrap() {
    const section = this.drawer.querySelector('.tasslelife-cart-drawer__gift-wrap');
    if (!section) return;

    this.giftWrapVariantId = section.dataset.variantId;
    this.giftWrapAddBtn  = section.querySelector('#tasslelife-cart-drawer-gift-wrap');
    if (!this.giftWrapAddBtn || !this.giftWrapVariantId) return;

    this.giftWrapAddBtn.addEventListener('click', async () => {
      if (this.isUpdating) return;
      const adding = this.giftWrapAddBtn.textContent.trim() === '+ Add';
      await this.handleGiftWrap(adding);
    });
  }

  async handleGiftWrap(checked) {
    this.isUpdating    = true;
    this._skipIntercept = true;
    const originalText = this.giftWrapAddBtn.innerHTML;
    this.giftWrapAddBtn.innerHTML = '<div class="tasslelife-cart-drawer__spinner" style="width:16px;height:16px;border-width:2px;border-top-color:currentColor;margin:auto;"></div>';
    try {
      if (checked) {
        await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: this.giftWrapVariantId, quantity: 1 }),
        });
      } else {
        const cart = await this.fetchCart();
        const item = cart.items.find(i => String(i.variant_id) === String(this.giftWrapVariantId));
        if (item) {
          await fetch('/cart/change.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.key, quantity: 0 }),
          });
        }
      }
      await this.refresh();
    } finally {
      this.isUpdating    = false;
      this._skipIntercept = false;
    }
  }

  syncGiftWrap(cart) {
    if (!this.giftWrapAddBtn || !this.giftWrapVariantId) return;
    const inCart = cart.items.some(i => String(i.variant_id) === String(this.giftWrapVariantId));
    if (inCart) {
      this.giftWrapAddBtn.textContent = 'Remove';
      this.giftWrapAddBtn.classList.add('is-added');
    } else {
      this.giftWrapAddBtn.textContent = '+ Add';
      this.giftWrapAddBtn.classList.remove('is-added');
    }
  }

  // ─── Delivery Date ────────────────────────────────────────────────────────

  initDeliveryDate() {
    const input = document.getElementById('tasslelife-cart-drawer-date');
    if (!input) return;

    this.deliveryDateInput = input;
    const minDays = parseInt(input.dataset.minDays || 1, 10);
    const maxDays = parseInt(input.dataset.maxDays || 30, 10);

    const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const fmt     = d => d.toISOString().split('T')[0];
    const today   = new Date();

    input.min = fmt(addDays(today, minDays));
    input.max = fmt(addDays(today, maxDays));

    // Restore from session
    const saved = sessionStorage.getItem('tasslelife_cart_drawer_delivery_date');
    if (saved) input.value = saved;

    input.addEventListener('change', e => this.handleDeliveryDate(e.target.value));
  }

  async handleDeliveryDate(date) {
    sessionStorage.setItem('tasslelife_cart_drawer_delivery_date', date);
    await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: { 'Delivery Date': date } }),
    });
  }

  syncDeliveryDate(cart) {
    if (!this.deliveryDateInput) return;
    const saved = cart.attributes?.['Delivery Date'];
    if (saved) {
      this.deliveryDateInput.value = saved;
      sessionStorage.setItem('tasslelife_cart_drawer_delivery_date', saved);
    }
  }

  // ─── Handwritten Note ─────────────────────────────────────────────────────

  initNote() {
    const textarea = document.getElementById('tasslelife-cart-drawer-note');
    const counter  = document.getElementById('tasslelife-cart-drawer-note-count');
    if (!textarea) return;

    this.noteTextarea = textarea;

    const update = val => {
      if (counter) counter.textContent = val.length;
      clearTimeout(this.noteTimeout);
      this.noteTimeout = setTimeout(() => this.handleNote(val), 800);
    };

    textarea.addEventListener('input', e => update(e.target.value));
  }

  async handleNote(text) {
    await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: text }),
    });
  }

  syncNote(cart) {
    if (!this.noteTextarea) return;
    if (cart.note) {
      this.noteTextarea.value = cart.note;
      const counter = document.getElementById('tasslelife-cart-drawer-note-count');
      if (counter) counter.textContent = cart.note.length;
    }
  }

  // ─── Coupons & Discount ───────────────────────────────────────────────────

  initDiscount() {
    this.couponsData = [];
    try {
      const script = document.getElementById('tasslelife-coupons-data');
      if (script) this.couponsData = JSON.parse(script.textContent);
    } catch (e) {}

    this.compactEl = document.getElementById('tasslelife-cart-drawer-coupons-compact');
    this.modalEl = document.getElementById('tasslelife-cart-drawer-coupons-modal');
    this.modalOverlay = document.getElementById('tasslelife-cart-drawer-coupons-overlay');
    
    // Bind modal events
    const viewAllBtn = document.getElementById('tasslelife-cart-drawer-coupons-view-all');
    if (viewAllBtn) viewAllBtn.addEventListener('click', () => this.openCouponsModal());
    
    const modalBack = document.querySelector('.tasslelife-cart-drawer__coupons-modal-back');
    if (modalBack) modalBack.addEventListener('click', () => this.closeCouponsModal());
    if (this.modalOverlay) this.modalOverlay.addEventListener('click', () => this.closeCouponsModal());

    // Bind compact apply button
    const compactApplyBtn = document.querySelector('.tasslelife-cart-drawer__coupons-compact-apply');
    if (compactApplyBtn) {
      compactApplyBtn.addEventListener('click', () => {
        if (compactApplyBtn.dataset.state === 'applied') {
          this.removeDiscount();
        } else if (this.bestCoupon) {
          this.applyDiscount(this.bestCoupon.code, `Save ${this.formatMoney(this.bestCoupon.savings)}`);
        }
      });
    }

    // Manual input bindings
    this.discountInput = document.getElementById('tasslelife-cart-drawer-discount-input');
    this.discountMsg = document.getElementById('tasslelife-cart-drawer-discount-msg');
    this.discountApplyBtn = document.getElementById('tasslelife-cart-drawer-discount-apply');
    
    if (this.discountApplyBtn && this.discountInput) {
      this.discountApplyBtn.addEventListener('click', () => {
        if (this.discountApplyBtn.dataset.state === 'applied') {
          this.removeDiscount();
        } else {
          const code = this.discountInput.value.trim().toUpperCase();
          if (code) this.applyDiscount(code, `Code applied`);
        }
      });
      this.discountInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') this.discountApplyBtn.click();
      });
    }

    const saved = sessionStorage.getItem('tasslelife_cart_drawer_discount');
    if (saved) {
      this.appliedCode = saved;
      this.appliedLabel = sessionStorage.getItem('tasslelife_cart_drawer_discount_label');
    }
  }

  openCouponsModal() {
    if (!this.modalEl) return;
    this.modalEl.classList.add('is-open');
    this.modalOverlay.classList.add('is-visible');
    this.modalEl.setAttribute('aria-hidden', 'false');
  }

  closeCouponsModal() {
    if (!this.modalEl) return;
    this.modalEl.classList.remove('is-open');
    this.modalOverlay.classList.remove('is-visible');
    this.modalEl.setAttribute('aria-hidden', 'true');
  }

  renderCoupons(cart) {
    if (!this.compactEl || !this.couponsData.length) return;
    
    const subtotal = cart.original_total_price / 100;
    
    // Sort and calculate savings
    const evaluated = this.couponsData.map(c => {
      let savingsCents = 0;
      if (c.type === 'percentage') savingsCents = Math.round(cart.original_total_price * (c.value / 100));
      else if (c.type === 'fixed') savingsCents = c.value * 100;
      
      const isAvailable = subtotal >= c.minThreshold;
      const shortfall = isAvailable ? 0 : c.minThreshold - subtotal;
      
      return { ...c, savings: savingsCents, isAvailable, shortfall };
    });
    
    // Split
    const available = evaluated.filter(c => c.isAvailable).sort((a,b) => b.savings - a.savings);
    const unavailable = evaluated.filter(c => !c.isAvailable).sort((a,b) => a.shortfall - b.shortfall);
    
    this.bestCoupon = available[0] || null;
    
    // Render Compact
    this.compactEl.style.display = 'block';
    const compactApplyBtn = document.querySelector('.tasslelife-cart-drawer__coupons-compact-apply');
    if (this.bestCoupon) {
      document.getElementById('tasslelife-cart-drawer-best-savings').innerHTML = `Save ${this.formatMoney(this.bestCoupon.savings)}`;
      document.getElementById('tasslelife-cart-drawer-best-code').innerHTML = `with '${this.bestCoupon.code}'`;
      const moreCount = available.length + unavailable.length - 1;
      document.getElementById('tasslelife-cart-drawer-more-count').textContent = moreCount;
      
      const isApplied = this.appliedCode === this.bestCoupon.code;
      compactApplyBtn.style.display = 'block';
      compactApplyBtn.textContent = isApplied ? 'Applied' : 'Apply';
      compactApplyBtn.dataset.state = isApplied ? 'applied' : '';
      if (isApplied) compactApplyBtn.classList.add('is-applied');
      else compactApplyBtn.classList.remove('is-applied');
    } else if (unavailable.length) {
      // Show closest unavailable
      const closest = unavailable[0];
      document.getElementById('tasslelife-cart-drawer-best-savings').innerHTML = `Save ${this.formatMoney(closest.savings || closest.value*100)}`;
      document.getElementById('tasslelife-cart-drawer-best-code').innerHTML = `with '${closest.code}'`;
      document.getElementById('tasslelife-cart-drawer-more-count').textContent = evaluated.length - 1;
      compactApplyBtn.style.display = 'none';
    } else {
      this.compactEl.style.display = 'none';
    }
    
    // Render Modal Lists
    const availContainer = document.getElementById('tasslelife-cart-drawer-available-coupons');
    const unavailContainer = document.getElementById('tasslelife-cart-drawer-unavailable-coupons');
    
    if (availContainer) availContainer.innerHTML = available.map(c => this.couponCardHTML(c, true)).join('');
    if (unavailContainer) unavailContainer.innerHTML = unavailable.map(c => this.couponCardHTML(c, false)).join('');
    
    // Bind modal apply buttons
    document.querySelectorAll('.tasslelife-cart-drawer__coupon-apply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const code = e.target.dataset.code;
        const label = e.target.dataset.label;
        if (e.target.dataset.state === 'applied') {
          this.removeDiscount();
        } else {
          this.applyDiscount(code, label);
          this.closeCouponsModal();
        }
      });
    });
    
    // Sync manual input state
    if (this.discountInput && this.discountApplyBtn) {
      if (this.appliedCode) {
        this.discountInput.value = this.appliedCode;
        this.discountInput.readOnly = true;
        this.discountApplyBtn.textContent = 'Remove';
        this.discountApplyBtn.dataset.state = 'applied';
        if (this.discountMsg) {
          this.discountMsg.textContent = `"${this.appliedCode}" will be applied at checkout`;
          this.discountMsg.className = 'tasslelife-cart-drawer__discount-msg is-success';
        }
      } else {
        this.discountInput.value = '';
        this.discountInput.readOnly = false;
        this.discountApplyBtn.textContent = 'Apply';
        this.discountApplyBtn.dataset.state = '';
        if (this.discountMsg) this.discountMsg.textContent = '';
      }
    }
  }

  couponCardHTML(c, isAvailable) {
    const isApplied = this.appliedCode === c.code;
    const desc = c.type === 'percentage' ? `${c.value}% off` : `${this.formatMoney(c.value * 100)} off`;
    return `
      <div class="tasslelife-cart-drawer__coupon-card ${isAvailable ? 'is-available' : 'is-unavailable'}">
        <div class="tasslelife-cart-drawer__coupon-header">
          <div class="tasslelife-cart-drawer__coupon-code">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="7" y1="7" x2="7.01" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${c.code}
          </div>
          ${isAvailable ? `
            <button class="tasslelife-cart-drawer__coupon-apply-btn" data-code="${c.code}" data-label="Save ${this.formatMoney(c.savings)}" data-state="${isApplied ? 'applied' : ''}">
              ${isApplied ? 'Applied' : 'Apply'}
            </button>
          ` : ''}
        </div>
        <p class="tasslelife-cart-drawer__coupon-desc">${desc}</p>
        <p class="tasslelife-cart-drawer__coupon-cond">on orders above ${this.formatMoney(c.minThreshold * 100)}</p>
        ${isAvailable ? `
          <p class="tasslelife-cart-drawer__coupon-save-msg">Save ${this.formatMoney(c.savings)} on this order!</p>
          <p class="tasslelife-cart-drawer__coupon-view-more">View more</p>
        ` : `
          <p class="tasslelife-cart-drawer__coupon-shortfall">Add ${this.formatMoney(c.shortfall * 100)} more to avail this offer</p>
        `}
      </div>
    `;
  }

  applyDiscount(code, label) {
    this.appliedCode = code;
    this.appliedLabel = label;
    sessionStorage.setItem('tasslelife_cart_drawer_discount', code);
    if (label) sessionStorage.setItem('tasslelife_cart_drawer_discount_label', label);
    this.updateCheckoutUrl(code);
    this.refresh();
  }

  removeDiscount() {
    this.appliedCode = null;
    this.appliedLabel = null;
    sessionStorage.removeItem('tasslelife_cart_drawer_discount');
    sessionStorage.removeItem('tasslelife_cart_drawer_discount_label');
    this.updateCheckoutUrl(null);
    this.updateSavingsDisplay(0);
    this.refresh();
  }

  // ─── Savings display ─────────────────────────────────────────────────────

  initSavingsRow() {
    if (!this.footer) return;
    const subtotalRow = this.footer.querySelector('.tasslelife-cart-drawer__subtotal-row');
    if (!subtotalRow) return;
    const row = document.createElement('div');
    row.id = 'tasslelife-cart-drawer-savings';
    row.className = 'tasslelife-cart-drawer__savings-row';
    row.style.display = 'none';
    row.innerHTML = `
      <span class="tasslelife-cart-drawer__savings-label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5L5 19M19 19L5 5"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
        Coupon savings
      </span>
      <span class="tasslelife-cart-drawer__savings-value" id="tasslelife-cart-drawer-savings-value">—</span>`;
    subtotalRow.insertAdjacentElement('afterend', row);
  }

  parseSavings(label, cartTotalCents) {
    if (!label) return 0;
    const pct = label.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pct) return Math.round(cartTotalCents * parseFloat(pct[1]) / 100);
    const dollar = label.match(/\$\s*(\d+(?:\.\d+)?)/);
    if (dollar) return Math.round(parseFloat(dollar[1]) * 100);
    return 0;
  }

  renderSavings(cart) {
    const row = document.getElementById('tasslelife-cart-drawer-savings');
    const valEl = document.getElementById('tasslelife-cart-drawer-savings-value');
    if (!row) return;
    const code  = sessionStorage.getItem('tasslelife_cart_drawer_discount');
    const label = sessionStorage.getItem('tasslelife_cart_drawer_discount_label') || '';
    if (!code) { row.style.display = 'none'; return; }
    const savings = this.parseSavings(label, cart.total_price);
    if (savings > 0) {
      row.style.display = 'flex';
      if (valEl) valEl.innerHTML = `-${this.formatMoney(savings)}`;
    } else {
      row.style.display = 'none';
    }
  }

  updateSavingsDisplay(savings) {
    const row = document.getElementById('tasslelife-cart-drawer-savings');
    if (row) row.style.display = savings > 0 ? 'flex' : 'none';
  }

  updateCheckoutUrl(code) {
    const btn = document.getElementById('tasslelife-cart-drawer-checkout');
    if (!btn) return;
    btn.href = code ? `/checkout?discount=${encodeURIComponent(code)}` : '/checkout';
  }

  // The renderDiscountChips method is no longer needed since we use Coupons Modal.

  // ─── Delivery Timeline ────────────────────────────────────────────────────

  initTimeline() {
    const timeline = document.getElementById('tasslelife-cart-drawer-timeline');
    if (!timeline) return;

    const fulfillMin  = parseInt(timeline.dataset.fulfillMin,  10) || 4;
    const fulfillMax  = parseInt(timeline.dataset.fulfillMax,  10) || 5;
    const deliveryMin = parseInt(timeline.dataset.deliveryMin, 10) || 10;
    const deliveryMax = parseInt(timeline.dataset.deliveryMax, 10) || 11;

    const today   = new Date();
    const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const fmt     = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const todayEl   = document.getElementById('tasslelife-cart-drawer-timeline-today');
    const fulfillEl = document.getElementById('tasslelife-cart-drawer-timeline-fulfill');
    const deliverEl = document.getElementById('tasslelife-cart-drawer-timeline-deliver');

    if (todayEl)   todayEl.textContent   = fmt(today);
    if (fulfillEl) fulfillEl.textContent = fulfillMin === fulfillMax
      ? fmt(addDays(today, fulfillMin))
      : `${fmt(addDays(today, fulfillMin))} – ${fmt(addDays(today, fulfillMax))}`;
    if (deliverEl) deliverEl.textContent = deliveryMin === deliveryMax
      ? fmt(addDays(today, deliveryMin))
      : `${fmt(addDays(today, deliveryMin))} – ${fmt(addDays(today, deliveryMax))}`;
  }

  // ─── Cart API ─────────────────────────────────────────────────────────────

  async fetchCart() {
    const res = await fetch('/cart.js', { cache: 'no-cache' });
    return res.json();
  }

  async updateItem(key, quantity) {
    this.isUpdating = true;
    this.setItemLoading(key, true);
    try {
      const res = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key, quantity }),
      });
      const cart = await res.json();
      this.render(cart);
      return cart;
    } finally {
      this.isUpdating = false;
    }
  }

  async removeItem(key) {
    return this.updateItem(key, 0);
  }

  async addItem(variantId, quantity = 1) {
    this.isUpdating = true;
    this._skipIntercept = true;
    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: variantId, quantity }),
      });
      if (!res.ok) return;
      await this.refresh();
    } finally {
      this.isUpdating = false;
      this._skipIntercept = false;
    }
  }

  async refresh() {
    const cart = await this.fetchCart();
    this.render(cart);
    // Re-apply stored discount URL
    const saved = sessionStorage.getItem('tasslelife_cart_drawer_discount');
    if (saved) this.updateCheckoutUrl(saved);
    return cart;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  render(cart) {
    this.renderCount(cart);
    this.renderItems(cart);
    this.renderSubtotal(cart);
    this.renderProgressBar(cart);
    this.renderUpsell(cart);
    this.syncGiftWrap(cart);
    this.syncDeliveryDate(cart);
    this.syncNote(cart);
    this.renderCoupons(cart);
    this.renderSavings(cart);
    this.toggleFooter(cart);
  }

  renderCount(cart) {
    if (this.countEl) this.countEl.textContent = cart.item_count;
    // Update only the first numeric text node inside count elements to preserve theme HTML structure
    document.querySelectorAll('.cart-count-bubble, [data-cart-count], .cart__count').forEach(el => {
      // If there's a direct child span that holds the visible count (Dawn-style), update that
      const numericSpan = el.querySelector('span[aria-hidden="true"], span:first-child');
      if (numericSpan) {
        numericSpan.textContent = cart.item_count;
      } else {
        el.textContent = cart.item_count;
      }
      // Show/hide the bubble (some themes hide it when count is 0)
      if (cart.item_count > 0) {
        el.removeAttribute('hidden');
        el.classList.remove('hidden', 'is-hidden');
      }
    });
  }

  renderItems(cart) {
    if (!this.itemsContainer) return;
    if (cart.item_count === 0) {
      this.itemsContainer.innerHTML = this.emptyCartHTML();
      this.itemsContainer.querySelectorAll('[data-tasslelife-cart-drawer-close]').forEach(btn => {
        btn.addEventListener('click', () => this.close());
      });
      return;
    }
    this.itemsContainer.innerHTML = cart.items.map(item => this.itemHTML(item)).join('');
    this.bindItemEvents();
  }

  itemHTML(item) {
    const linePrice    = this.formatMoney(item.final_line_price);
    const comparePrice = item.compare_at_price > item.final_price
      ? `<s class="tasslelife-cart-drawer__item-compare">${this.formatMoney(item.compare_at_price * item.quantity)}</s>`
      : '';
    const variant = item.variant_title && item.variant_title !== 'Default Title'
      ? `<p class="tasslelife-cart-drawer__item-variant">${item.variant_title}</p>` : '';
    const image = item.image
      ? `<img src="${item.image}" alt="${this.escape(item.product_title)}" width="80" height="80" loading="lazy">`
      : `<div class="tasslelife-cart-drawer__item-image-placeholder"></div>`;

    const isGiftWrap = String(item.variant_id) === String(this.giftWrapVariantId);

    return `
      <div class="tasslelife-cart-drawer__item" data-key="${item.key}">
        <a href="${item.url}" class="tasslelife-cart-drawer__item-img-link">${image}</a>
        <div class="tasslelife-cart-drawer__item-details">
          <div class="tasslelife-cart-drawer__item-header">
            <a href="${item.url}" class="tasslelife-cart-drawer__item-title">${this.escape(item.product_title)}</a>
            <div class="tasslelife-cart-drawer__item-prices">${comparePrice}<span class="tasslelife-cart-drawer__item-price">${linePrice}</span></div>
          </div>
          ${variant}
          <div class="tasslelife-cart-drawer__item-bottom">
            <button class="tasslelife-cart-drawer__item-remove" data-key="${item.key}" aria-label="Remove ${this.escape(item.product_title)}">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
            ${isGiftWrap ? '' : `
            <div class="tasslelife-cart-drawer__qty">
              <button class="tasslelife-cart-drawer__qty-btn" data-key="${item.key}" data-qty="${item.quantity - 1}" aria-label="Decrease">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <span class="tasslelife-cart-drawer__qty-value">${item.quantity}</span>
              <button class="tasslelife-cart-drawer__qty-btn" data-key="${item.key}" data-qty="${item.quantity + 1}" aria-label="Increase">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>
            `}
          </div>
        </div>
      </div>`;
  }

  emptyCartHTML() {
    return `
      <div class="tasslelife-cart-drawer__empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <p class="tasslelife-cart-drawer__empty-title">Your cart is empty</p>
        <p class="tasslelife-cart-drawer__empty-sub">Add items to get started</p>
        <button class="tasslelife-cart-drawer__continue-btn" data-tasslelife-cart-drawer-close>Continue Shopping</button>
      </div>`;
  }

  bindItemEvents() {
    this.itemsContainer.querySelectorAll('.tasslelife-cart-drawer__qty-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (this.isUpdating) return;
        await this.updateItem(btn.dataset.key, parseInt(btn.dataset.qty, 10));
      });
    });
    this.itemsContainer.querySelectorAll('.tasslelife-cart-drawer__item-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (this.isUpdating) return;
        await this.removeItem(btn.dataset.key);
      });
    });
  }

  renderSubtotal(cart) {
    if (this.subtotalEl) this.subtotalEl.innerHTML = this.formatMoney(cart.total_price);
  }

  // ─── Multi-tier Progress Bar ──────────────────────────────────────────────

  renderProgressBar(cart) {
    if (!this.progressEl || !this.progressTiers.length) return;

    const tiers      = this.progressTiers;
    const total      = cart.total_price;                          // cents
    const maxThresh  = tiers[tiers.length - 1].threshold * 100;  // cents
    const fillPct    = Math.min((total / maxThresh) * 100, 100);

    // Next unlocked tier
    const nextTier = tiers.find(t => total < t.threshold * 100);

    const statusText = nextTier
      ? `Add ${this.formatMoney((nextTier.threshold * 100) - total)} more for <strong>${nextTier.label}</strong>`
      : `🎉 You've unlocked all rewards!`;

    // Milestone markers — positioned proportionally along the bar
    const milestonesHTML = tiers.map(tier => {
      const posPct   = (tier.threshold * 100 / maxThresh) * 100;
      const unlocked = total >= tier.threshold * 100;
      return `
        <div class="tasslelife-cart-drawer__milestone ${unlocked ? 'is-unlocked' : ''}" style="left:${posPct}%">
          <div class="tasslelife-cart-drawer__milestone-top-label">${this.formatMoney(tier.threshold * 100)}</div>
          <div class="tasslelife-cart-drawer__milestone-dot">${tier.icon}</div>
          <div class="tasslelife-cart-drawer__milestone-bottom-label">${tier.label}</div>
        </div>`;
    }).join('');

    this.progressEl.innerHTML = `
      <p class="tasslelife-cart-drawer__progress-text">${statusText}</p>
      <div class="tasslelife-cart-drawer__progress-wrap">
        <div class="tasslelife-cart-drawer__progress-track">
          <div class="tasslelife-cart-drawer__progress-fill ${fillPct >= 100 ? 'is-full' : ''}" style="width:${fillPct}%"></div>
          ${milestonesHTML}
        </div>
      </div>
    `;
  }

  // ─── Upsell ───────────────────────────────────────────────────────────────

  renderUpsell(cart) {
    if (!this.upsellSection || !this.upsellItems) return;
    if (cart.item_count === 0) { this.upsellSection.style.display = 'none'; return; }

    const mode           = this.upsellSection.dataset.upsellMode || 'ai';
    const cartProductIds = cart.items.map(i => i.product_id);

    if (mode === 'manual') {
      // Products were resolved server-side and injected as a JSON script tag
      const dataEl = document.getElementById('tasslelife-upsell-products');
      if (!dataEl) { this.upsellSection.style.display = 'none'; return; }
      let products;
      try { products = JSON.parse(dataEl.textContent); } catch { products = []; }
      products = products.filter(p => !cartProductIds.includes(p.id));
      if (!products.length) { this.upsellSection.style.display = 'none'; return; }
      this.upsellSection.style.display = 'block';
      this.upsellItems.innerHTML = products.map(p => this.upsellItemHTMLManual(p)).join('');
      this.bindUpsellEvents();
      return;
    }

    if (mode === 'collection') {
      const handle = this.upsellSection.dataset.upsellCollection;
      if (!handle) { this.upsellSection.style.display = 'none'; return; }
      fetch(`/collections/${encodeURIComponent(handle)}/products.json?limit=6`)
        .then(r => r.json())
        .then(data => {
          const products = (data.products || []).filter(p => !cartProductIds.includes(p.id)).slice(0, 4);
          if (!products.length) { this.upsellSection.style.display = 'none'; return; }
          this.upsellSection.style.display = 'block';
          this.upsellItems.innerHTML = products.map(p => this.upsellItemHTMLAi(p)).join('');
          this.bindUpsellEvents();
        })
        .catch(() => { this.upsellSection.style.display = 'none'; });
      return;
    }

    // Default: AI / Shopify recommendations
    const firstItem = cart.items[0];
    fetch(`/recommendations/products.json?product_id=${firstItem.product_id}&limit=4&intent=related`)
      .then(r => r.json())
      .then(data => {
        const products = (data.products || []).filter(p => !cartProductIds.includes(p.id));
        if (!products.length) { this.upsellSection.style.display = 'none'; return; }
        this.upsellSection.style.display = 'block';
        this.upsellItems.innerHTML = products.map(p => this.upsellItemHTMLAi(p)).join('');
        this.bindUpsellEvents();
      })
      .catch(() => { this.upsellSection.style.display = 'none'; });
  }

  // For AI / collection mode — product object from Shopify AJAX API (prices already in cents)
  upsellItemHTMLAi(product) {
    const variant      = product.variants?.[0];
    if (!variant) return '';
    const price        = variant.price || 0;
    const comparePrice = variant.compare_at_price || 0;
    const imgHTML      = product.featured_image
      ? `<img src="${product.featured_image}" alt="${this.escape(product.title)}" loading="lazy">`
      : '';
    const badgeHTML    = comparePrice > price
      ? `<div class="tasslelife-cart-drawer__upsell-badge">${Math.round((1 - price / comparePrice) * 100)}% OFF</div>`
      : '';
    const priceHTML    = comparePrice > price
      ? `<s class="tasslelife-cart-drawer__upsell-compare">${this.formatMoney(comparePrice)}</s>
         <span class="tasslelife-cart-drawer__upsell-final">${this.formatMoney(price)}</span>`
      : `<span class="tasslelife-cart-drawer__upsell-final">${this.formatMoney(price)}</span>`;
    return `
      <div class="tasslelife-cart-drawer__upsell-card">
        <div class="tasslelife-cart-drawer__upsell-img-wrap">${imgHTML}${badgeHTML}</div>
        <div class="tasslelife-cart-drawer__upsell-card-body">
          <p class="tasslelife-cart-drawer__upsell-name">${this.escape(product.title)}</p>
          <p class="tasslelife-cart-drawer__upsell-price">${priceHTML}</p>
          <button class="tasslelife-cart-drawer__upsell-add-btn" data-variant-id="${variant.id}">+ ADD</button>
        </div>
      </div>`;
  }

  // For manual mode — product object resolved server-side via Liquid (prices are in cents already)
  upsellItemHTMLManual(product) {
    if (!product.variant_id) return '';
    const price        = product.price || 0;
    const comparePrice = product.compare_price || 0;
    const imgHTML      = product.image
      ? `<img src="${product.image}" alt="${this.escape(product.title)}" loading="lazy">`
      : '';
    const badgeHTML    = comparePrice > price
      ? `<div class="tasslelife-cart-drawer__upsell-badge">${Math.round((1 - price / comparePrice) * 100)}% OFF</div>`
      : '';
    const priceHTML    = comparePrice > price
      ? `<s class="tasslelife-cart-drawer__upsell-compare">${this.formatMoney(comparePrice)}</s>
         <span class="tasslelife-cart-drawer__upsell-final">${this.formatMoney(price)}</span>`
      : `<span class="tasslelife-cart-drawer__upsell-final">${this.formatMoney(price)}</span>`;
    return `
      <div class="tasslelife-cart-drawer__upsell-card">
        <div class="tasslelife-cart-drawer__upsell-img-wrap">${imgHTML}${badgeHTML}</div>
        <div class="tasslelife-cart-drawer__upsell-card-body">
          <p class="tasslelife-cart-drawer__upsell-name">${this.escape(product.title)}</p>
          <p class="tasslelife-cart-drawer__upsell-price">${priceHTML}</p>
          <button class="tasslelife-cart-drawer__upsell-add-btn" data-variant-id="${product.variant_id}">+ ADD</button>
        </div>
      </div>`;
  }

  bindUpsellEvents() {
    this.upsellItems?.querySelectorAll('.tasslelife-cart-drawer__upsell-add-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (this.isUpdating) return;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<div class="tasslelife-cart-drawer__spinner" style="width:16px;height:16px;border-width:2px;border-top-color:currentColor;margin:auto;"></div>';
        btn.disabled = true;
        await this.addItem(btn.dataset.variantId, 1);
        if (document.body.contains(btn)) {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      });
    });
  }

  toggleFooter(cart) {
    if (this.footer) this.footer.style.display = cart.item_count > 0 ? 'block' : 'none';
  }

  setItemLoading(key, loading) {
    const item = this.itemsContainer?.querySelector(`[data-key="${key}"]`);
    if (item) item.classList.toggle('is-loading', loading);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  formatMoney(cents) {
    const formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: this.settings.currency,
    }).format(cents / 100);
    return `<span class="money">${formatted}</span>`;
  }

  escape(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str || ''));
    return d.innerHTML;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { window.__tasslelifeCartDrawer = new TasslelifeCartDrawer(); });
} else {
  window.__tasslelifeCartDrawer = new TasslelifeCartDrawer();
}
