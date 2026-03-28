/**
 * components.js — Minella Jewels Shared Components
 * Drop this file in the repo root and call MJ.init() in each page.
 * Controls: topbar, footer, WhatsApp float button, shared CSS.
 *
 * Usage in each HTML page:
 *   1. Add <script src="/components.js"></script> in <head> (or before </body>)
 *   2. Call MJ.init() — or MJ.init({ hideCart: true }) for non-shop pages
 *   3. On pages WITH a cart (index.html), call MJ.init({ cart: true })
 *
 * Options for MJ.init(opts):
 *   opts.hideCart  — don't show cart icon in topbar (default: false)
 *   opts.activeNav — which nav link to mark active: 'home'|'about'|'contact'|'track'
 *   opts.noFooter  — skip footer injection (e.g. success pages)
 */

(function () {
  "use strict";

  /* ─── CONFIG — edit here for site-wide changes ────────────────────────── */
  const CFG = {
    whatsapp: "919080014835",           // WhatsApp number (country code + number)
    whatsappMsg: "Hi! I need help with Minella Jewels 😊",
    logoSrc: "/favicon.png",
    brandName: "Minella Jewels",
    navLinks: [
      { label: "Shop",    href: "/",            key: "home"    },
      { label: "About",   href: "/about.html",  key: "about"   },
      { label: "Contact", href: "/contact.html",key: "contact" },
      { label: "Track",   href: "/track.html",  key: "track"   },
    ],
  };
  /* ──────────────────────────────────────────────────────────────────────── */

  /* ── Inject shared CSS (variables, topbar, footer, whatsapp fab) ───────── */
  function injectCSS() {
    if (document.getElementById("mj-shared-css")) return;
    const style = document.createElement("style");
    style.id = "mj-shared-css";
    style.textContent = `
/* ── Shared reset & tokens ─────────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#1c1018;--plum:#4a1942;--plum2:#6b2d61;
  --gold:#b8903a;--gold2:#d4a84b;
  --cream:#faf6f0;--cream2:#f2ece0;--cream3:#e8dfd0;
  --muted:#8a7878;--white:#ffffff;
  --error:#b83232;--ok:#2e7d4f;--border:#ddd4c8;
  --shadow:0 4px 24px rgba(28,16,24,0.10);
  --shadow-lg:0 12px 48px rgba(28,16,24,0.16);
  --r:14px;--r-sm:8px;
  --safe-bottom:env(safe-area-inset-bottom,0px);
  --safe-top:env(safe-area-inset-top,0px)
}
html{scroll-behavior:smooth}
body{background:var(--cream);font-family:'Outfit',sans-serif;color:var(--ink);overflow-x:hidden;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}
button{font-family:'Outfit',sans-serif;cursor:pointer}
input,select{font-family:'Outfit',sans-serif}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--cream2)}
::-webkit-scrollbar-thumb{background:var(--plum2);border-radius:4px}

/* ── Topbar ─────────────────────────────────────────────────────────────── */
#mj-topbar{
  position:fixed;top:0;left:0;right:0;z-index:500;
  height:60px;
  background:rgba(250,246,240,0.92);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 20px;
  padding-top:var(--safe-top);
  gap:12px;
}
#mj-topbar .mj-logo{
  display:flex;align-items:center;gap:10px;
  text-decoration:none;flex-shrink:0;
}
#mj-topbar .mj-logo img{height:36px;width:auto;object-fit:contain}
#mj-topbar .mj-logo span{
  font-family:'Libre Baskerville',serif;
  font-size:20px;color:var(--plum);letter-spacing:1px;
}
#mj-topbar .mj-nav{
  display:flex;gap:24px;
  position:absolute;left:50%;transform:translateX(-50%);
}
#mj-topbar .mj-nav a{
  font-size:12px;font-weight:500;color:var(--muted);
  text-decoration:none;letter-spacing:0.8px;text-transform:uppercase;
  transition:.2s;padding:4px 0;border-bottom:2px solid transparent;
}
#mj-topbar .mj-nav a:hover,
#mj-topbar .mj-nav a.mj-active{color:var(--plum);border-bottom-color:var(--gold)}
#mj-topbar .mj-topbar-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
/* cart fab inside topbar */
#mj-cart-btn{
  position:relative;background:var(--plum);color:white;border:none;
  width:44px;height:44px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 16px rgba(74,25,66,0.30);
  transition:transform .2s,box-shadow .2s;
}
#mj-cart-btn:hover{transform:scale(1.08);box-shadow:0 6px 22px rgba(74,25,66,0.40)}
#mj-cart-btn svg{width:20px;height:20px}
#mj-cart-badge{
  position:absolute;top:-4px;right:-4px;
  background:var(--gold2);color:var(--plum);
  font-size:10px;font-weight:700;
  min-width:18px;height:18px;border-radius:9px;
  display:flex;align-items:center;justify-content:center;
  padding:0 4px;display:none;
}
@media(max-width:600px){#mj-topbar .mj-nav{display:none}}

/* ── Footer ─────────────────────────────────────────────────────────────── */
#mj-footer{
  background:var(--plum);color:rgba(255,255,255,0.75);
  padding:48px 24px 32px;margin-top:64px;
  padding-bottom:calc(32px + var(--safe-bottom));
}
#mj-footer .mj-footer-inner{
  max-width:900px;margin:0 auto;
  display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;
}
#mj-footer .mj-footer-brand .mj-footer-logo{
  display:flex;align-items:center;gap:10px;margin-bottom:12px;
}
#mj-footer .mj-footer-brand .mj-footer-logo img{height:32px;filter:brightness(2)}
#mj-footer .mj-footer-brand .mj-footer-logo span{
  font-family:'Libre Baskerville',serif;
  font-size:18px;color:white;letter-spacing:1px;
}
#mj-footer .mj-footer-brand p{font-size:13px;line-height:1.6;max-width:200px}
#mj-footer h4{
  font-size:11px;letter-spacing:2px;text-transform:uppercase;
  color:var(--gold2);margin-bottom:14px;font-family:'Outfit',sans-serif;font-weight:600;
}
#mj-footer ul{list-style:none}
#mj-footer ul li{margin-bottom:8px}
#mj-footer ul li a{
  color:rgba(255,255,255,0.7);text-decoration:none;
  font-size:13px;transition:.2s;
}
#mj-footer ul li a:hover{color:white}
#mj-footer .mj-footer-bottom{
  max-width:900px;margin:32px auto 0;
  padding-top:20px;border-top:1px solid rgba(255,255,255,0.12);
  display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
  font-size:12px;color:rgba(255,255,255,0.45);
}
@media(max-width:600px){
  #mj-footer .mj-footer-inner{grid-template-columns:1fr 1fr}
  #mj-footer .mj-footer-brand{grid-column:1/-1}
}

/* ── WhatsApp Float Button ──────────────────────────────────────────────── */
#mj-wa-btn{
  position:fixed;
  bottom:calc(24px + var(--safe-bottom));
  right:20px;
  z-index:450;
  width:54px;height:54px;
  border-radius:50%;
  background:#25d366;
  box-shadow:0 4px 20px rgba(37,211,102,0.45);
  display:flex;align-items:center;justify-content:center;
  text-decoration:none;
  transition:transform .2s,box-shadow .2s;
  animation:mj-wa-pop .4s cubic-bezier(.34,1.56,.64,1) both;
  animation-delay:.8s;
  opacity:0;
}
#mj-wa-btn:hover{
  transform:scale(1.1);
  box-shadow:0 6px 28px rgba(37,211,102,0.60);
}
#mj-wa-btn svg{width:28px;height:28px;fill:white}
@keyframes mj-wa-pop{
  0%{opacity:0;transform:scale(.5)}
  100%{opacity:1;transform:scale(1)}
}
/* pulse ring */
#mj-wa-btn::after{
  content:'';
  position:absolute;inset:0;
  border-radius:50%;
  border:2px solid #25d366;
  animation:mj-wa-ring 2.5s ease-out infinite;
  animation-delay:1.5s;
}
@keyframes mj-wa-ring{
  0%{transform:scale(1);opacity:.7}
  100%{transform:scale(1.7);opacity:0}
}

/* ── Scroll progress bar ────────────────────────────────────────────────── */
#mj-scroll-bar{
  position:fixed;top:0;left:0;height:2px;width:0%;
  background:linear-gradient(90deg,var(--gold),var(--gold2));
  z-index:9999;pointer-events:none;transition:width .1s linear;
}
    `;
    document.head.appendChild(style);
  }

  /* ── Inject Google Fonts if not already present ─────────────────────────── */
  function injectFonts() {
    if (document.querySelector('link[href*="Outfit"]')) return;
    const preconn = document.createElement("link");
    preconn.rel = "preconnect";
    preconn.href = "https://fonts.googleapis.com";
    document.head.appendChild(preconn);

    const fonts = document.createElement("link");
    fonts.rel = "stylesheet";
    fonts.href =
      "https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap";
    document.head.appendChild(fonts);
  }

  /* ── Inject favicon if not present ─────────────────────────────────────── */
  function injectFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    const fav = document.createElement("link");
    fav.rel = "icon";
    fav.type = "image/png";
    fav.href = "/favicon.png";
    document.head.appendChild(fav);
    const apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    apple.href = "/favicon.png";
    document.head.appendChild(apple);
  }

  /* ── Render Topbar ──────────────────────────────────────────────────────── */
  function renderTopbar(opts) {
    if (document.getElementById("mj-topbar")) return;

    const navHTML = CFG.navLinks.map(
      (l) =>
        `<a href="${l.href}" class="${opts.activeNav === l.key ? "mj-active" : ""}">${l.label}</a>`
    ).join("");

    const cartBtn = opts.hideCart
      ? ""
      : `<button id="mj-cart-btn" aria-label="Cart" onclick="MJ.openCart && MJ.openCart()">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
             <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
             <line x1="3" y1="6" x2="21" y2="6"/>
             <path d="M16 10a4 4 0 01-8 0"/>
           </svg>
           <span id="mj-cart-badge"></span>
         </button>`;

    const el = document.createElement("div");
    el.id = "mj-topbar";
    el.innerHTML = `
      <a href="/" class="mj-logo">
        <img src="${CFG.logoSrc}" alt="${CFG.brandName} logo">
        <span>${CFG.brandName}</span>
      </a>
      <nav class="mj-nav">${navHTML}</nav>
      <div class="mj-topbar-right">${cartBtn}</div>
    `;
    document.body.insertAdjacentElement("afterbegin", el);
  }

  /* ── Render Footer ──────────────────────────────────────────────────────── */
  function renderFooter() {
    if (document.getElementById("mj-footer")) return;
    const year = new Date().getFullYear();
    const el = document.createElement("footer");
    el.id = "mj-footer";
    el.innerHTML = `
      <div class="mj-footer-inner">
        <div class="mj-footer-brand">
          <div class="mj-footer-logo">
            <img src="${CFG.logoSrc}" alt="${CFG.brandName}">
            <span>${CFG.brandName}</span>
          </div>
          <p>Anti-tarnish jewellery crafted for the modern woman. Ships across India.</p>
        </div>
        <div>
          <h4>Quick Links</h4>
          <ul>
            <li><a href="/">Shop</a></li>
            <li><a href="/about.html">About Us</a></li>
            <li><a href="/contact.html">Contact</a></li>
            <li><a href="/track.html">Track Order</a></li>
          </ul>
        </div>
        <div>
          <h4>Policies</h4>
          <ul>
            <li><a href="/return-policy.html">Return Policy</a></li>
            <li><a href="/shipping-policy.html">Shipping Policy</a></li>
            <li><a href="/privacy-policy.html">Privacy Policy</a></li>
            <li><a href="/terms.html">Terms &amp; Conditions</a></li>
          </ul>
        </div>
      </div>
      <div class="mj-footer-bottom">
        <span>© ${year} ${CFG.brandName}. All rights reserved.</span>
        <span>Made with ♥ in Coimbatore</span>
      </div>
    `;
    document.body.appendChild(el);
  }

  /* ── Render WhatsApp Float Button ───────────────────────────────────────── */
  function renderWhatsApp() {
    if (document.getElementById("mj-wa-btn")) return;
    const url = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(CFG.whatsappMsg)}`;
    const el = document.createElement("a");
    el.id = "mj-wa-btn";
    el.href = url;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
    el.setAttribute("aria-label", "Chat on WhatsApp");
    el.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    `;
    document.body.appendChild(el);
  }

  /* ── Scroll progress bar ─────────────────────────────────────────────────── */
  function renderScrollBar() {
    if (document.getElementById("mj-scroll-bar")) return;
    const bar = document.createElement("div");
    bar.id = "mj-scroll-bar";
    document.body.appendChild(bar);
    window.addEventListener("scroll", () => {
      const pct =
        (window.scrollY /
          (document.documentElement.scrollHeight - window.innerHeight)) *
        100;
      bar.style.width = Math.min(pct, 100) + "%";
    }, { passive: true });
  }

  /* ── Cart badge sync (called from cart logic in index.html) ─────────────── */
  function syncCartBadge(count) {
    const badge = document.getElementById("mj-cart-badge");
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }
  }

  /* ── Public API ──────────────────────────────────────────────────────────── */
  window.MJ = window.MJ || {};

  /**
   * MJ.init(opts)
   *  opts.hideCart  — hide cart button (default false)
   *  opts.activeNav — 'home' | 'about' | 'contact' | 'track'
   *  opts.noFooter  — skip footer (default false)
   */
  window.MJ.init = function (opts) {
    opts = opts || {};
    injectFonts();
    injectFavicon();
    injectCSS();

    // Wait for body to exist (should always be true when called at bottom of body)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => doRender(opts));
    } else {
      doRender(opts);
    }
  };

  function doRender(opts) {
    renderTopbar(opts);
    renderScrollBar();
    if (!opts.noFooter) renderFooter();
    renderWhatsApp();
  }

  window.MJ.syncCartBadge = syncCartBadge;

  /**
   * MJ.openCart — pages with a cart can assign this:
   *   MJ.openCart = () => openCartDrawer();
   */
  window.MJ.openCart = null;

})();
