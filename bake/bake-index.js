// ============================================================
// bake/bake-index.js — builds index.html
// Run standalone: node bake/bake-index.js
// Or called from bake.js master runner
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

const {
  STORE_URL, ROOT_CSS, SHARED_CSS, INDEX_CSS,
  fetchProducts, driveThumb, getAdditionalImgs,
  stockStatus, calcDiscount, esc, getField, getProductCategory,
} = require('./shared');

const { CART_HTML, CHECKOUT_HTML, PAYU_FORM, WA_BUTTON, PVIEW_MODAL_HTML, FOOTER_HTML } = require('./html-fragments');
const { SHARED_JS } = require('./shared-js');

// ── Sidebar HTML (index-only) ─────────────────────────────────
function sidebarHtml(logoHtml) {
  return `
<div class="sidebar-overlay" id="sidebarOverlay"></div>
<div class="sidebar" id="sidebar">
  <div class="sidebar-head">
    <div class="sidebar-logo">Minella Jewels</div>
    <button class="sidebar-close" id="sidebarClose">&#10005;</button>
  </div>
  <nav class="sidebar-nav">
    <a href="/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Shop</a>
    <a href="/about.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>About Us</a>
    <a href="/contact.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Contact</a>
    <div class="sidebar-divider"></div>
    <a href="/track.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>Track My Order</a>
    <a href="/faqs.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>FAQs</a>
    <a href="/ring-size-guide.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>Ring Size Guide</a>
    <a href="/jewellery-care.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>Jewellery Care</a>
  </nav>
  <div class="sidebar-footer">&#169; 2026 Minella Jewels &middot; Coimbatore</div>
</div>`;
}

// ── Build index.html ──────────────────────────────────────────
function buildIndexHtml(products) {
  const logoP   = products.find(p => getField(p, 'logo_link'));
  const logoSrc = logoP ? driveThumb(getField(logoP, 'logo_link'), 200) : null;
  const logoHtml = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="Minella Jewels" style="height:36px;width:auto;object-fit:contain">`
    : `<span style="font-family:'Libre Baskerville',serif;font-size:20px;color:var(--plum);letter-spacing:1px">Minella Jewels</span>`;

  // JSON-LD: Organization + WebSite + all Products
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "name": "Minella Jewels",
        "url": STORE_URL,
        "logo": `${STORE_URL}/favicon.png`,
        "sameAs": ["https://instagram.com/minellajewels"],
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+91-9080014835",
          "contactType": "customer service",
          "areaServed": "IN",
          "availableLanguage": ["English", "Tamil"]
        }
      },
      {
        "@type": "WebSite",
        "name": "Minella Jewels",
        "url": STORE_URL,
        "potentialAction": {
          "@type": "SearchAction",
          "target": `${STORE_URL}/?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      },
      ...products.map(p => ({
        "@type": "Product",
        "name": getField(p, 'title', 'Title', 'Product Name'),
        "image": driveThumb(getField(p, 'image link', 'Image Link', 'raw image'), 600),
        "sku": String(getField(p, 'id')),
        "brand": { "@type": "Brand", "name": "Minella" },
        "offers": {
          "@type": "Offer",
          "url": `${STORE_URL}/product/${getField(p, 'id')}`,
          "priceCurrency": "INR",
          "price": (parseFloat(getField(p, 'price', 'Price')) || 0).toFixed(2),
          "availability": (parseInt(getField(p, 'stocks', 'Stocks', 'stock')) || 0) > 0
            ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
        }
      }))
    ]
  };
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is anti-tarnish jewellery?",
      "acceptedAnswer": { "@type": "Answer", "text": "Anti-tarnish jewellery uses a protective coating that prevents oxidation, keeping it shiny for months even with daily wear, sweat, and water exposure." }
    },
    {
      "@type": "Question",
      "name": "Is Minella Jewels jewellery waterproof?",
      "acceptedAnswer": { "@type": "Answer", "text": "Yes. All Minella Jewels pieces are 100% waterproof and sweat-resistant. You can wear them in rain, while exercising, or in the shower." }
    },
    {
      "@type": "Question",
      "name": "Is cash on delivery available?",
      "acceptedAnswer": { "@type": "Answer", "text": "Yes. Minella Jewels offers Cash on Delivery (COD) across India. Free shipping on orders above ₹999." }
    },
    {
      "@type": "Question",
      "name": "Is the jewellery skin safe?",
      "acceptedAnswer": { "@type": "Answer", "text": "Yes. All pieces are nickel-free and hypoallergenic, safe for sensitive skin." }
    }
  ]
};
  // Product cards
  let cardsHtml = '';
  products.forEach(p => {
    const id     = String(getField(p, 'id'));
    const title  = getField(p, 'title', 'Title', 'Product Name');
    const price  = parseFloat(getField(p, 'price', 'Price')) || 0;
    const wo     = parseFloat(getField(p, 'without_offer')) || 0;
    const stock  = parseInt(getField(p, 'stocks', 'Stocks', 'stock')) || 0;
    const img    = driveThumb(getField(p, 'image link', 'Image Link', 'raw image'), 400);
    const status = stockStatus(stock);
    const disc   = calcDiscount(price, wo);
    const isOut  = status === 'out';

    const badge = isOut
      ? '<div class="stock-badge out">Out of Stock</div>'
      : status === 'limited' ? '<div class="stock-badge limited">Few left</div>' : '';

    const discHtml = disc > 0
      ? `<span class="badge" style="position:absolute;top:10px;right:10px;background:var(--gold);padding:2px 8px;font-size:10px;border-radius:10px;color:#fff;z-index:4;">${disc}% OFF</span>`
      : '';

    const priceHtml = disc
      ? `<div class="price-offer"><span class="price-now">&#8377;${price.toLocaleString('en-IN')}</span><span class="price-original">&#8377;${wo.toLocaleString('en-IN')}</span></div>`
      : `<div class="price-single">&#8377;${price.toLocaleString('en-IN')}</div>`;

    cardsHtml += `<div class="product-card fade-in" id="pc-${id}" data-pid="${id}">`
      + badge + discHtml
      + `<div class="img-wrap" style="cursor:pointer;">`
      + `<img src="${esc(img)}" alt="${esc(title)}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.classList.add('loaded');this.style.opacity='0.15'">`
      + `</div>`
      + `<div class="card-body">`
      + `<div class="card-title">${esc(title)}</div>`
      + `<div class="price-row">${priceHtml}</div>`
      + `<div class="card-actions">`
      + `<button class="btn-add" data-pid="${id}"${isOut ? ' disabled' : ''}>${isOut ? 'Out of Stock' : 'Add to Bag'}</button>`
      + `</div></div></div>`;
  });

  const bakedData = JSON.stringify(products);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<script async src="https://www.googletagmanager.com/gtag/js?id=G-QSYZM26PGX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-QSYZM26PGX');</script>

<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#B76E79">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/favicon.png">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">

<title>Minella Jewels — Anti-Tarnish Jewellery | Waterproof | Minimalist | India</title>
<meta name="description" content="Shop premium anti-tarnish, waterproof, minimalist jewellery online. 18K gold plated necklaces, earrings, bracelets, rings & anklets. Skin-safe, nickel-free. COD available across India.">
<meta name="keywords" content="anti tarnish jewellery, waterproof jewellery, minimalist jewellery India, gold plated jewellery, tarnish free jewellery, everyday jewellery, skin safe jewellery, nickel free jewellery, anti tarnish necklace, anti tarnish earrings, anti tarnish bracelet, jewellery COD India, buy jewellery online India, Coimbatore jewellery">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="author" content="Minella Jewels">
<link rel="canonical" href="${STORE_URL}/">

<meta name="geo.region" content="IN-TN">
<meta name="geo.placename" content="Coimbatore, Tamil Nadu, India">
<meta name="geo.position" content="11.0168;76.9558">
<meta name="ICBM" content="11.0168, 76.9558">

<meta property="og:title" content="Minella Jewels — Anti-Tarnish Jewellery | India">
<meta property="og:description" content="Shop premium anti-tarnish, waterproof, minimalist jewellery. 18K gold plated. Skin-safe. COD across India.">
<meta property="og:image" content="${STORE_URL}/assets/images/og-home.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Minella Jewels anti-tarnish waterproof jewellery collection">
<meta property="og:url" content="${STORE_URL}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Minella Jewels">
<meta property="og:locale" content="en_IN">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Minella Jewels — Anti-Tarnish Jewellery | India">
<meta name="twitter:description" content="Shop premium anti-tarnish, waterproof, minimalist jewellery. 18K gold plated. Skin-safe. COD across India.">
<meta name="twitter:image" content="${STORE_URL}/assets/images/og-home.jpg">
<meta name="twitter:image:alt" content="Minella Jewels anti-tarnish jewellery">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://www.googletagmanager.com">
<link rel="preconnect" href="https://lh3.googleusercontent.com">

<link rel="preload" as="image" href="/assets/images/hero/hero-1.webp" fetchpriority="high">

<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>
<script type="application/ld+json">${JSON.stringify(faqJsonLd)}<\/script>
<style>
${ROOT_CSS}
${SHARED_CSS}
${INDEX_CSS}
</style>
</head>
<body>
<div class="scroll-bar" id="scrollBar"></div>
<div class="spinner-overlay" id="spinner"><div class="spinner"></div><div class="spinner-text" id="spinnerText">Processing&#8230;</div></div>

<nav class="topbar">
  <div id="topbarLogo">${logoHtml}</div>
  <div class="topbar-nav">
    <a href="/">Shop</a>
    <a href="/about.html">About</a>
    <a href="/contact.html">Contact</a>
  </div>
  <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
    <a href="/track.html" class="orders-fab" aria-label="My Orders">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      <span>My Orders</span>
    </a>
    <button class="cart-fab" id="cartFabBtn" aria-label="Open cart">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <span class="cart-badge" id="cartBadge">0</span>
    </button>
    <button class="hamburger" id="hamburgerBtn" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>

${sidebarHtml(logoHtml)}

<section class="hero">
  <div class="hero-slide active" style="background-image:url('/assets/images/hero/hero-1.webp')">
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <h1>Every Day Every WEAR</h1>
      <p>18K Gold Plated &bull; Anti-Tarnish &bull; Skin Friendly</p>
      <button class="hero-cta" onclick="document.getElementById('shopAnchor').scrollIntoView({behavior:'smooth'})">Shop Now &rarr;</button>
    </div>
  </div>
</section>

<div class="trust-bar">
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span><strong>Anti-Tarnish</strong> Guaranteed</span></div>
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg><span><strong>Free Shipping</strong> on &#8377;999+</span></div>
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><span><strong>COD</strong> Available</span></div>
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span><strong>Handpicked</strong> Quality</span></div>
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span><strong>Secure</strong> Payments</span></div>
</div>

<div class="cat-bar" id="shopAnchor">
  <div class="cat-circle active" data-cat="all"><div class="cat-img"><img src="/assets/images/categories/necklaces.jpg" alt="All"></div><div class="cat-label">All</div></div>
  <div class="cat-circle" data-cat="necklace"><div class="cat-img"><img src="/assets/images/categories/necklaces.jpg" alt="Necklaces"></div><div class="cat-label">Necklaces</div></div>
  <div class="cat-circle" data-cat="bracelet"><div class="cat-img"><img src="/assets/images/categories/bracelets.jpg" alt="Bracelets"></div><div class="cat-label">Bracelets</div></div>
  <div class="cat-circle" data-cat="anklet"><div class="cat-img"><img src="/assets/images/categories/bracelets.jpg" alt="Anklets"></div><div class="cat-label">Anklets</div></div>
  <div class="cat-circle" data-cat="earring"><div class="cat-img"><img src="/assets/images/categories/earrings.jpg" alt="Earrings"></div><div class="cat-label">Earrings</div></div>
  <div class="cat-circle" data-cat="ring"><div class="cat-img"><img src="/assets/images/categories/rings.jpg" alt="Rings"></div><div class="cat-label">Rings</div></div>
</div>

<div class="grid-wrap">
  <div class="grid" id="productGrid">${cardsHtml}</div>
</div>

${PVIEW_MODAL_HTML}
${CART_HTML}
${CHECKOUT_HTML}
${PAYU_FORM}
${WA_BUTTON}
<div class="toast" id="toast"></div>
${FOOTER_HTML}

<script id="baked-products" type="application/json">${bakedData}<\/script>
<script>
var productMap={};
(function(){
  var el=document.getElementById("baked-products");
  if(!el)return;
  JSON.parse(el.textContent).forEach(function(p){productMap[String(p.id)]=p;});
})();

// Scroll bar
(function(){
  var bar=document.getElementById("scrollBar");
  window.addEventListener("scroll",function(){
    var max=document.documentElement.scrollHeight-window.innerHeight;
    bar.style.width=max>0?(window.scrollY/max*100)+"%":"0%";
  },{passive:true});
})();

function getProductCategory(p){
  var cat=((p.category||p.Category||"")).trim().toLowerCase();
  if(cat)return cat;
  var t=((p.title||p.Title||"")).trim().toLowerCase();
  if(/earring|stud|hoop|jhumk/i.test(t))return"earring";
  if(/necklace|pendant|chain/i.test(t))return"necklace";
  if(/bracelet|bangle/i.test(t))return"bracelet";
  if(/anklet|payal/i.test(t))return"anklet";
  if(/\\bring\\b/i.test(t))return"ring";
  return"other";
}

// Tilt cards
function initTiltCards(){
  var TILT_MAX=12,LIFT_PX=8,SCALE=1.03;
  var cards=document.querySelectorAll(".product-card");
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(entry,i){
      if(entry.isIntersecting){setTimeout(function(){entry.target.classList.add("card-visible");},i*55);io.unobserve(entry.target);}
    });
  },{threshold:0.08});
  cards.forEach(function(card){card.style.perspective="800px";io.observe(card);});
  function onMove(e){
    if(window.matchMedia("(hover:none)").matches)return;
    var card=this,rect=card.getBoundingClientRect();
    var dx=(e.clientX-(rect.left+rect.width/2))/(rect.width/2);
    var dy=(e.clientY-(rect.top+rect.height/2))/(rect.height/2);
    card.style.transform="translateY(-"+LIFT_PX+"px) rotateX("+(-dy*TILT_MAX).toFixed(2)+"deg) rotateY("+(dx*TILT_MAX).toFixed(2)+"deg) scale("+SCALE+")";
    card.style.zIndex="10";
  }
  function onLeave(){
    this.style.transform="translateY(0) rotateX(0deg) rotateY(0deg) scale(1)";
    this.style.zIndex="";
  }
  cards.forEach(function(card){card.addEventListener("mousemove",onMove);card.addEventListener("mouseleave",onLeave);});
}
initTiltCards();

// Category filter
document.querySelectorAll(".cat-circle").forEach(function(btn){
  btn.addEventListener("click",function(){
    document.querySelectorAll(".cat-circle").forEach(function(b){b.classList.remove("active");});
    this.classList.add("active");
    var cat=this.getAttribute("data-cat");
    document.querySelectorAll(".product-card[id^='pc-']").forEach(function(card){
      var pid=card.id.replace("pc-",""),p=productMap[pid];
      if(!p){card.style.display="";return;}
      card.style.display=(cat==="all"||getProductCategory(p)===cat)?"":"none";
    });
  });
});

// Grid click — add to bag or navigate
document.getElementById("productGrid").addEventListener("click",function(e){
  var addBtn=e.target.closest(".btn-add");
  if(addBtn){
    e.stopPropagation();
    var pid=String(addBtn.getAttribute("data-pid")),p=productMap[pid];
    if(p)addToCart((p.title||p.Title||"").trim(),parseFloat(p.price||p.Price)||0,parseInt(p.stocks||p.Stocks||p.stock)||0);
    return;
  }
  var card=e.target.closest(".product-card[data-pid]");
  if(card)window.location.href="/product/"+card.getAttribute("data-pid");
});

${SHARED_JS}

// Sidebar
(function(){
  var btn=document.getElementById("hamburgerBtn"),sidebar=document.getElementById("sidebar"),
      overlay=document.getElementById("sidebarOverlay"),closeBtn=document.getElementById("sidebarClose");
  function open(){sidebar.classList.add("open");overlay.classList.add("open");}
  function close(){sidebar.classList.remove("open");overlay.classList.remove("open");}
  if(btn)btn.addEventListener("click",open);
  if(closeBtn)closeBtn.addEventListener("click",close);
  if(overlay)overlay.addEventListener("click",close);
})();

updateCartUI();
<\/script>
</body>
</html>`;
}

// ── Run ───────────────────────────────────────────────────────
async function run() {
  const products = await fetchProducts();
  console.log('\n📝 Building index.html...');
  fs.writeFileSync(path.join(__dirname, '..', 'index.html'), buildIndexHtml(products));
  console.log('  ✅ index.html written');
}

// Allow require() without auto-running
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });

module.exports = { run };
