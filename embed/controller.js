/**
 * ShopController - Embed Script v3
 * 
 * Correct toggle logic:
 *   cartButton.disabled = true   -> hide cart buttons
 *   checkout.disabled = true     -> block checkout
 *   homeBlocks.hiddenSectionIds  -> hide those sections
 *   passwordProtection.enabled + protectedPages/protectAllPages -> lock pages
 * 
 * Also scans the site and reports sections + navigation links back to the API
 * so the dashboard can show them for the user to select.
 */
(function() {
  'use strict';

  const SCRIPT_TAG = document.currentScript;
  const PROJECT_ID = SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-project-id') : null;
  const API_BASE = SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-api') : null;

  if (!PROJECT_ID || !API_BASE) {
    console.warn('[ShopController] Missing data-project-id or data-api attribute.');
    return;
  }

  // ============ FETCH & APPLY ============
  async function fetchSettings() {
    try {
      const res = await fetch(`${API_BASE}/api/embed/${PROJECT_ID}`);
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      applySettings(data.settings);
      // Scan site after applying settings (delayed to let page load fully)
      setTimeout(() => scanSite(), 2000);
    } catch (err) {
      console.warn('[ShopController] Could not load settings:', err.message);
    }
  }

  function applySettings(s) {
    if (!s) return;

    // 1. Cart Button - disabled=true means HIDE cart buttons
    if (s.cartButton && s.cartButton.disabled) {
      hideCartButtons();
    }

    // 2. Checkout - disabled=true means BLOCK checkout
    if (s.checkout && s.checkout.disabled) {
      disableCheckout(s.checkout.blockedMessage);
    }

    // 3. Home Blocks - hide specific sections by their IDs
    if (s.homeBlocks && s.homeBlocks.hiddenSectionIds && s.homeBlocks.hiddenSectionIds.length > 0) {
      if (isHomePage()) {
        hideHomeSections(s.homeBlocks.hiddenSectionIds);
      }
    }

    // 4. Announcement
    if (s.announcement && s.announcement.enabled) {
      showAnnouncement(s.announcement);
    }

    // 5. Custom CSS
    if (s.customCSS && s.customCSS.enabled && s.customCSS.code) {
      injectCSS(s.customCSS.code);
    }

    // 6. Popup
    if (s.popup && s.popup.enabled) {
      showPopup(s.popup);
    }

    // 7. Password Protection
    if (s.passwordProtection && s.passwordProtection.enabled) {
      applyPasswordProtection(s.passwordProtection);
    }
  }

  // ============ UTILITY ============
  function injectCSS(css) {
    const style = document.createElement('style');
    style.setAttribute('data-shopcontroller', 'true');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getCleanPath() {
    let path = window.location.pathname;
    if (window.location.protocol === 'file:') {
      const parts = path.split('/');
      path = '/' + parts[parts.length - 1]; // e.g. "/index.html"
    }
    return path || '/';
  }

  function isHomePage() {
    const p = getCleanPath().toLowerCase();
    return p === '/' || p === '' || p.endsWith('/index') || p.endsWith('/index.html');
  }

  function getElText(el) {
    return (el.textContent || el.innerText || el.value || '').trim().toLowerCase();
  }

  // ============ SITE SCANNER ============
  // Scans the current site and sends sections + page links to the API
  async function scanSite() {
    try {
      const sections = scanSections();
      const pages = scanPages();

      await fetch(`${API_BASE}/api/embed/${PROJECT_ID}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, pages })
      });
    } catch (err) {
      // Silent fail - scanning is not critical
    }
  }

  function scanSections() {
    const sections = [];
    const seen = new Set();

    // Only scan home page for sections
    if (!isHomePage()) return sections;

    // Strategy 1: Shopify sections (id="shopify-section-*")
    document.querySelectorAll('[id^="shopify-section-"]').forEach(el => {
      const id = el.id;
      if (seen.has(id)) return;
      seen.add(id);

      // Try to find a heading inside to get a nice name
      const heading = el.querySelector('h1, h2, h3');
      let name = heading ? heading.textContent.trim() : '';
      if (!name) {
        // Use section ID but clean it up
        name = id.replace('shopify-section-', '').replace(/[-_]/g, ' ');
        // Capitalize words
        name = name.replace(/\b\w/g, c => c.toUpperCase());
      }
      // Keep name short
      if (name.length > 60) name = name.substring(0, 57) + '...';

      sections.push({ id, name, tagName: el.tagName.toLowerCase() });
    });

    // Strategy 2: Generic <section> tags with IDs or classes
    if (sections.length === 0) {
      document.querySelectorAll('main section, main > div, body > section, body > div > section, #content > section, #main > section, .main-content > section').forEach((el, index) => {
        // Skip tiny elements, scripts, styles
        if (el.offsetHeight < 50) return;
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;

        const id = el.id || el.className.split(' ')[0] || `section-${index}`;
        if (seen.has(id)) return;
        seen.add(id);

        const heading = el.querySelector('h1, h2, h3');
        let name = heading ? heading.textContent.trim() : '';
        if (!name) {
          name = el.id || el.className.split(' ')[0] || `Section ${index + 1}`;
          name = name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        if (name.length > 60) name = name.substring(0, 57) + '...';

        sections.push({ id, name, tagName: el.tagName.toLowerCase() });
      });
    }

    return sections;
  }

  function scanPages() {
    const pages = [];
    const seen = new Set();
    const currentHost = window.location.host;

    // Scan all navigation links
    document.querySelectorAll('nav a, .nav a, header a, .header a, .menu a, .navigation a, .navbar a, #menu a, [role="navigation"] a').forEach(link => {
      try {
        const url = new URL(link.href, window.location.origin);
        // Only same-host links
        if (url.host !== currentHost) return;

        let path = url.pathname;
        if (window.location.protocol === 'file:') {
          const parts = path.split('/');
          path = '/' + parts[parts.length - 1]; // e.g. "/shop.html"
        }

        // Skip anchors, empty, home, checkout, cart, account system pages
        if (!path || path === '/' || path === '#') return;
        if (path.includes('/checkout') || path.includes('/account') || path.includes('/cart')) return;
        if (path.includes('.js') || path.includes('.css') || path.includes('.png')) return;
        if (seen.has(path)) return;
        seen.add(path);

        const title = link.textContent.trim() || path;
        pages.push({ path, title: title.length > 60 ? title.substring(0, 57) + '...' : title });
      } catch (e) {}
    });

    return pages;
  }

  // ============ 1. CART BUTTON HIDE ============
  function hideCartButtons() {
    const shopifySelectors = [
      'product-form button[type="submit"]',
      'product-form .product-form__submit',
      '.product-form__submit', '.product-form__cart-submit',
      '.shopify-payment-button', 'button[name="add"]',
      '[data-add-to-cart]',
      '.btn--add-to-cart', '.add-to-cart',
      '.product-form--add-to-cart', '#AddToCart', '#addToCart',
      'form[action="/cart/add"] button[type="submit"]',
      'form[action="/cart/add"] input[type="submit"]',
      'form[action*="/cart/add"] button',
      '.shopify-payment-button__button',
      '[data-shopify="payment-button"]',
      '.dynamic-checkout__button',
      '.add-to-cart-button', '.product__add-to-cart',
      '.product-add-to-cart', '#product-add-to-cart',
      '[data-action="add-to-cart"]', '.js-add-to-cart',
      '.addtocart', '.AddToCart'
    ];

    injectCSS(shopifySelectors.join(',\n') + ` {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }`);

    const cartTextPatterns = [
      'add to cart', 'add to bag', 'add to basket',
      'buy now', 'buy it now', 'purchase'
    ];

    document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a.button').forEach(el => {
      const text = getElText(el);
      if (cartTextPatterns.some(p => text.includes(p))) {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
      }
    });

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.querySelectorAll) {
            node.querySelectorAll(shopifySelectors.join(',')).forEach(el => {
              el.style.display = 'none';
              el.style.visibility = 'hidden';
            });
          }
          if (node.tagName === 'BUTTON' || (node.tagName === 'INPUT' && (node.type === 'submit' || node.type === 'button'))) {
            const text = getElText(node);
            if (cartTextPatterns.some(p => text.includes(p))) {
              node.style.display = 'none';
              node.style.visibility = 'hidden';
            }
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ============ 2. CHECKOUT DISABLE ============
  function disableCheckout(message) {
    const msg = message || 'Checkout is currently unavailable.';
    const currentPath = getCleanPath().toLowerCase();

    // Block checkout page directly
    if (currentPath.includes('checkout')) {
      document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f9fa;">
          <div style="text-align:center;padding:48px;background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.1);max-width:480px;width:90%;">
            <div style="width:64px;height:64px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;">&#128274;</div>
            <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:22px;">${msg}</h2>
            <p style="color:#666;margin:0 0 24px;font-size:15px;">Please try again later.</p>
            <a href="/" style="display:inline-block;padding:14px 28px;background:#333;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Return to Home</a>
          </div>
        </div>`;
      return;
    }

    const checkoutSelectors = [
      'button[name="checkout"]', 'input[name="checkout"]',
      '.cart__checkout-button', '.cart__checkout',
      '.cart__ctas button', '#cart-checkout', '#checkout',
      'a[href="/checkout"]', 'a[href*="/checkout"]', 'a[href*="/checkouts"]',
      '.cart__ctas a', '#CartDrawer-Checkout', '#checkout-button',
      '.checkout-button', '.checkout-btn', '.btn-checkout',
      '[data-checkout]', '.js-checkout'
    ];

    const checkoutTextPatterns = [
      'check out', 'checkout', 'proceed to checkout',
      'go to checkout', 'complete order', 'place order'
    ];

    function disableElement(el) {
      if (el.hasAttribute('data-sc-blocked')) return;
      el.setAttribute('data-sc-blocked', 'true');
      el.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showBlockedModal(msg);
        return false;
      }, true);
      el.style.opacity = '0.4';
      el.style.cursor = 'not-allowed';
      if (el.tagName === 'A') {
        el.setAttribute('data-original-href', el.href);
        el.removeAttribute('href');
      }
    }

    function scanCheckout() {
      document.querySelectorAll(checkoutSelectors.join(',')).forEach(disableElement);
      document.querySelectorAll('button, a, input[type="submit"]').forEach(el => {
        if (el.hasAttribute('data-sc-blocked')) return;
        const text = getElText(el);
        if (checkoutTextPatterns.some(p => text.includes(p))) disableElement(el);
      });
    }

    scanCheckout();

    // Intercept all checkout navigation
    window.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link) {
        const href = (link.href || link.getAttribute('href') || '').toLowerCase();
        if (href.includes('/checkout') || href.includes('/checkouts')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          showBlockedModal(msg);
        }
      }
    }, true);

    window.addEventListener('submit', function(e) {
      const action = (e.target.action || '').toLowerCase();
      if (action.includes('/checkout') || action.includes('/checkouts')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showBlockedModal(msg);
      }
    }, true);

    new MutationObserver(() => scanCheckout()).observe(document.body, { childList: true, subtree: true });
  }

  function showBlockedModal(message) {
    if (document.getElementById('sc-blocked-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'sc-blocked-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:999999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:white;padding:40px;border-radius:16px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="width:56px;height:56px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px;">&#128274;</div>
        <h3 style="margin:0 0 8px;color:#1a1a1a;font-size:20px;">${message}</h3>
        <p style="color:#888;margin:0 0 24px;font-size:14px;">Please try again later.</p>
        <button id="sc-blocked-close" style="padding:12px 28px;background:#333;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">OK</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('sc-blocked-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ============ 3. HOME SECTIONS HIDE (by detected IDs) ============
  function hideHomeSections(hiddenIds) {
    if (!hiddenIds || hiddenIds.length === 0) return;

    hiddenIds.forEach(id => {
      // Try by exact ID
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        return;
      }
      // Try by class name (for sections detected by class)
      const byClass = document.querySelector('.' + CSS.escape(id));
      if (byClass) {
        byClass.style.display = 'none';
      }
    });

    // Also inject CSS for reliability
    const cssRules = hiddenIds.map(id => `#${CSS.escape(id)}, .${CSS.escape(id)}`).join(',\n');
    injectCSS(cssRules + ' { display: none !important; }');
  }

  // ============ 4. ANNOUNCEMENT BAR ============
  function showAnnouncement(config) {
    if (document.getElementById('sc-announcement')) return;
    const bar = document.createElement('div');
    bar.id = 'sc-announcement';
    bar.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:99999;
      background:${config.bgColor || '#000'};color:${config.textColor || '#fff'};
      padding:12px 20px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      font-size:14px;font-weight:500;line-height:1.4;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 8px rgba(0,0,0,0.15);
    `;
    bar.innerHTML = `<span>${config.text}</span>
      ${config.dismissible ? '<button id="sc-announce-close" style="background:none;border:none;color:inherit;font-size:20px;cursor:pointer;margin-left:16px;padding:0 4px;opacity:0.7;">&times;</button>' : ''}`;
    document.body.prepend(bar);
    document.body.style.marginTop = bar.offsetHeight + 'px';
    if (config.dismissible) {
      document.getElementById('sc-announce-close').addEventListener('click', () => {
        bar.remove();
        document.body.style.marginTop = '0';
      });
    }
  }

  // ============ 6. POPUP ============
  function showPopup(config) {
    if (sessionStorage.getItem('sc-popup-shown')) return;
    setTimeout(() => {
      const overlay = document.createElement('div');
      overlay.id = 'sc-popup-overlay';
      overlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:${config.overlayColor || 'rgba(0,0,0,0.5)'};z-index:999999;display:flex;align-items:center;justify-content:center;`;
      const popup = document.createElement('div');
      popup.style.cssText = `background:${config.bgColor || '#fff'};color:${config.textColor || '#333'};padding:40px;border-radius:16px;max-width:450px;width:90%;text-align:center;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:scSlideUp 0.3s ease;`;
      popup.innerHTML = `
        <button id="sc-popup-close" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:24px;cursor:pointer;color:inherit;opacity:0.5;">&times;</button>
        <h2 style="margin:0 0 12px;font-size:24px;">${config.title || ''}</h2>
        <p style="margin:0 0 24px;opacity:0.8;font-size:16px;line-height:1.5;">${config.message || ''}</p>
        ${config.buttonText ? `<a href="${config.buttonUrl || '/'}" style="display:inline-block;padding:14px 32px;background:#333;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${config.buttonText}</a>` : ''}`;
      overlay.appendChild(popup);
      document.body.appendChild(overlay);
      injectCSS('@keyframes scSlideUp { from { transform:translateY(20px);opacity:0; } to { transform:translateY(0);opacity:1; } }');
      const close = () => { overlay.remove(); sessionStorage.setItem('sc-popup-shown', 'true'); };
      document.getElementById('sc-popup-close').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }, (config.delay || 3) * 1000);
  }

  // ============ 7. PASSWORD PROTECTION ============
  function applyPasswordProtection(config) {
    const currentPath = getCleanPath();
    let shouldProtect = false;

    if (config.protectAllPages) {
      shouldProtect = true;
    } else {
      // Check manual protectedPages array
      const allProtected = [...(config.protectedPages || [])];
      // Also check detectedPages that are marked as protected
      if (config.detectedPages) {
        config.detectedPages.forEach(p => {
          if (p.protected && !allProtected.includes(p.path)) {
            allProtected.push(p.path);
          }
        });
      }

      shouldProtect = allProtected.some(page => {
        const p = page.trim().toLowerCase();
        const cp = currentPath.toLowerCase();
        if (cp === p) return true;
        if (p && cp.includes(p)) return true;
        if (p.endsWith('*') && cp.startsWith(p.slice(0, -1))) return true;
        return false;
      });
    }

    if (!shouldProtect) return;
    if (sessionStorage.getItem('sc-unlocked-' + currentPath)) return;

    const originalHTML = document.body.innerHTML;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.innerHTML = `
      <div id="sc-pw-gate" style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;">
        <div style="text-align:center;padding:48px;background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.1);max-width:420px;width:90%;">
          <div style="width:64px;height:64px;background:#fef3c7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px;">&#128272;</div>
          <h2 style="margin:0 0 8px;color:#333;font-size:22px;">Password Required</h2>
          <p style="color:#888;margin:0 0 24px;font-size:14px;">${config.message || 'This page is password protected.'}</p>
          <input type="password" id="sc-pw-input" placeholder="Enter password" style="width:100%;padding:14px 16px;border:2px solid #e0e0e0;border-radius:10px;font-size:16px;box-sizing:border-box;outline:none;">
          <button id="sc-pw-submit" style="width:100%;padding:14px;background:#333;color:white;border:none;border-radius:10px;font-size:16px;cursor:pointer;margin-top:12px;font-weight:600;">Unlock</button>
          <p id="sc-pw-error" style="color:#e74c3c;margin:12px 0 0;display:none;font-size:13px;">Incorrect password. Try again.</p>
        </div>
      </div>`;

    setTimeout(() => { const i = document.getElementById('sc-pw-input'); if (i) i.focus(); }, 100);

    function tryUnlock() {
      const input = document.getElementById('sc-pw-input');
      if (input.value === config.password) {
        sessionStorage.setItem('sc-unlocked-' + currentPath, 'true');
        document.body.innerHTML = originalHTML;
        document.body.style.overflow = originalOverflow;
      } else {
        document.getElementById('sc-pw-error').style.display = 'block';
        input.style.borderColor = '#e74c3c';
        input.value = '';
        input.focus();
      }
    }

    document.getElementById('sc-pw-submit').addEventListener('click', tryUnlock);
    document.getElementById('sc-pw-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
      document.getElementById('sc-pw-error').style.display = 'none';
      document.getElementById('sc-pw-input').style.borderColor = '#333';
    });
  }

  // ============ INIT ============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchSettings);
  } else {
    fetchSettings();
  }
})();
