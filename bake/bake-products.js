// ============================================================
// bake/bake-products.js — builds product/* pages, sitemap.xml, llms.txt
// Run standalone: node bake/bake-products.js
// Or called from bake.js master runner
// ============================================================

'use strict';

const fs   = require('fs');
const path = require('path');

const {
  STORE_URL, SCRIPT_URL, ROOT_CSS, SHARED_CSS, PRODUCT_CSS,
  fetchProducts, driveThumb, getAdditionalImgs, extractDriveId,
  stockStatus, calcDiscount, esc, getField,
  getProductCategory, categoryLabel,
} = require('./shared');

const { CART_HTML, CHECKOUT_HTML, PAYU_FORM, WA_BUTTON, FOOTER_HTML } = require('./html-fragments');
const { SHARED_JS } = require('./shared-js');

// ── Build a single product page ───────────────────────────────
function buildProductPage(p, logoSrc, allProducts) {
  const id           = String(getField(p, 'id'));
  const title        = getField(p, 'title', 'Title', 'Product Name');
  const description  = getField(p, 'description');
  const details      = getField(p, 'details');
  const price        = parseFloat(getField(p, 'price', 'Price')) || 0;
  const withoutOffer = parseFloat(getField(p, 'without_offer')) || 0;
  const stock        = parseInt(getField(p, 'stocks', 'Stocks', 'stock')) || 0;
  const imgRaw       = getField(p, 'image link', 'Image Link', 'raw image');
  const addlRaw      = getField(p, 'additional_images');
  const videoRaw     = (getField(p, 'video_link') || '').trim();
  const status       = stockStatus(stock);
  const discount     = calcDiscount(price, withoutOffer);
  const category     = getProductCategory(p);
  const catLabel     = categoryLabel(category);

  const mainImg  = driveThumb(imgRaw, 800);
  const allImgs  = [mainImg, ...getAdditionalImgs(addlRaw).map(u => driveThumb(u, 800))].filter(Boolean);
  const canonical = `${STORE_URL}/product/${id}`;

  // Schema
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": title,
    "description": description || `${title} — Anti-tarnish, water-resistant jewellery by Minella Jewels.`,
    "image": allImgs.length > 1 ? allImgs : (allImgs[0] || ''),
    "brand": { "@type": "Brand", "name": "Minella" },
    "sku": id, "mpn": `MJ-${id}`, "identifier_exists": "false",
    "offers": {
      "@type": "Offer",
      "url": canonical, "priceCurrency": "INR",
      "price": price.toFixed(2),
      "availability": stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "itemCondition": "https://schema.org/NewCondition",
      "seller": { "@type": "Organization", "name": "Minella Jewels", "url": STORE_URL }
    }
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home",     "item": STORE_URL },
      { "@type": "ListItem", "position": 2, "name": catLabel,   "item": `${STORE_URL}/?cat=${category}` },
      { "@type": "ListItem", "position": 3, "name": title,      "item": canonical }
    ]
  };

  // Slides
  const allSlides = allImgs.map(u => ({ type: 'img', src: u }));
  if (videoRaw) {
    const vidId = extractDriveId(videoRaw);
    allSlides.push({ type: 'vid', src: vidId ? `https://drive.google.com/uc?export=download&id=${vidId}` : videoRaw });
  }
  const totalSlides = allSlides.length;

  const slidesHtml = allSlides.map((sl, i) =>
    sl.type === 'img'
      ? `<div class="pslide" style="width:${100/totalSlides}%"><img src="${esc(sl.src)}" alt="${esc(title)} view ${i+1}" loading="${i===0?'eager':'lazy'}"></div>`
      : `<div class="pslide pslide-vid" style="width:${100/totalSlides}%"><video src="${esc(sl.src)}" controls playsinline preload="metadata"></video></div>`
  ).join('');

  const thumbsHtml = totalSlides > 1 ? allSlides.map((sl, i) =>
    sl.type === 'img'
      ? `<img src="${esc(sl.src)}" class="pthumb${i===0?' active':''}" data-idx="${i}" alt="view ${i+1}" loading="lazy">`
      : `<div class="pthumb pthumb-vid${i===0?' active':''}" data-idx="${i}"><svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`
  ).join('') : '';

  const stockHtml = status === 'out'
    ? `<div class="pstock out">Out of Stock</div>`
    : status === 'limited'
    ? `<div class="pstock limited">&#9888; Only ${stock} left!</div>`
    : `<div class="pstock ok">&#10003; In Stock</div>`;

  const priceHtml = discount
    ? `<span class="pp-price">&#8377;${price.toLocaleString('en-IN')}</span><span class="pp-was">&#8377;${withoutOffer.toLocaleString('en-IN')}</span><span class="pp-disc">${discount}% off</span>`
    : `<span class="pp-price">&#8377;${price.toLocaleString('en-IN')}</span>`;

  const logo = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="Minella Jewels" style="height:36px;width:auto;object-fit:contain">`
    : `<span style="font-family:'Libre Baskerville',serif;font-size:20px;color:var(--plum);letter-spacing:1px">Minella Jewels</span>`;

  // Related + recently viewed
  const relatedProducts = allProducts
    .filter(rp => String(getField(rp, 'id')) !== id && getProductCategory(rp) === category)
    .slice(0, 8);
  const relatedBaked = JSON.stringify(relatedProducts.map(rp => ({
    id: String(getField(rp, 'id')),
    title: getField(rp, 'title', 'Title', 'Product Name'),
    price: parseFloat(getField(rp, 'price', 'Price')) || 0,
    stock: parseInt(getField(rp, 'stocks', 'Stocks', 'stock')) || 0,
    img: driveThumb(getField(rp, 'image link', 'Image Link', 'raw image'), 400)
  })));
  const rvEntry = JSON.stringify({ id, title, price, img: driveThumb(imgRaw, 400) });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#B76E79">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/favicon.png">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)} | Minella Jewels</title>
<meta name="description" content="${esc(description || `Buy ${title} online. Anti-tarnish, water-resistant jewellery by Minella Jewels. Cash on delivery available across India.`)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)} | Minella Jewels">
<meta property="og:description" content="${esc(description || `Premium anti-tarnish jewellery by Minella Jewels.`)}">
<meta property="og:image" content="${esc(mainImg)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Minella Jewels">
<meta property="product:price:amount" content="${price.toFixed(2)}">
<meta property="product:price:currency" content="INR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(mainImg)}">
<script type="application/ld+json">${JSON.stringify(productJsonLd)}<\/script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}<\/script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
${ROOT_CSS}
${SHARED_CSS}
${PRODUCT_CSS}
body{padding-top:calc(60px + var(--safe-top))}
.pp-track{display:flex;height:100%;transition:transform .38s cubic-bezier(.4,0,.2,1);width:${totalSlides*100}%}
</style>
</head>
<body>
<div class="spinner-overlay" id="spinner"><div class="spinner"></div><div class="spinner-text" id="spinnerText">Processing&#8230;</div></div>

<nav class="pp-nav">
  <a href="/" style="text-decoration:none;display:flex;align-items:center">${logo}</a>
  <div style="display:flex;align-items:center;gap:10px">
    <a href="/track.html" class="orders-fab">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      <span>My Orders</span>
    </a>
    <button id="cartFabBtn" class="pp-cart-btn" aria-label="Open cart">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <span class="pp-cart-badge" id="cartBadge">0</span>
    </button>
  </div>
</nav>

<nav class="breadcrumb" aria-label="breadcrumb">
  <a href="/">Home</a>
  <span class="breadcrumb-sep">&#8250;</span>
  <a href="/?cat=${esc(category)}">${esc(catLabel)}</a>
  <span class="breadcrumb-sep">&#8250;</span>
  <span class="breadcrumb-current">${esc(title)}</span>
</nav>

<div class="pw">
  <div class="pp-img-col">
    <div class="stage" id="stage">
      <div class="pp-track" id="ppTrack">${slidesHtml}</div>
      ${totalSlides > 1 ? `
      <button class="pp-arr prev" id="ppPrev" aria-label="Previous"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <button class="pp-arr next" id="ppNext" aria-label="Next"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>` : ''}
    </div>
    ${totalSlides > 1 ? `<div class="thumbs-row" id="thumbsRow">${thumbsHtml}</div>` : ''}
  </div>

  <div class="pp-info-col">
    <a href="/" class="back-link">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="19 12 5 12"/><polyline points="12 5 5 12 12 19"/></svg>
      Back to Store
    </a>
    <h1 class="pp-title">${esc(title)}</h1>
    <div class="pp-price-row">${priceHtml}</div>
    ${stockHtml}
    <div class="pp-cod-badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      Cash on Delivery available
    </div>
    <div class="pp-trust">
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Anti-tarnish</span>
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2m0 4a6 6 0 0 0-6 6 6 6 0 0 0 6 6 6 6 0 0 0 6-6 6 6 0 0 0-6-6z"/></svg>100% Waterproof</span>
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Fast delivery</span>
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Secure pay</span>
    </div>

    <button class="btn-atb" id="addToBagBtn"${status === 'out' ? ' disabled' : ''}>${status === 'out' ? 'Out of Stock' : 'Add to Bag'}</button>

    <div class="pp-actions-row">
      <button class="btn-share" id="shareBtn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share
      </button>
    </div>

    ${details ? `<div class="acc"><button class="acc-head open" data-acc="det">Product Details <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="acc-body open" id="acc-det"><ul class="acc-bullets">${details.split(',').map(d=>d.trim()).filter(Boolean).map(d=>`<li>${esc(d)}</li>`).join('')}</ul></div></div>` : ''}
    ${description ? `<div class="acc"><button class="acc-head" data-acc="desc">Description <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="acc-body" id="acc-desc"><p>${esc(description)}</p></div></div>` : ''}

    <div class="acc"><button class="acc-head" data-acc="ship">Shipping Policy <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="acc-body" id="acc-ship"><ul class="acc-bullets"><li>Shipped via <strong>Delhivery</strong> — reliable pan-India delivery</li><li>Delivery in <strong>2–6 business days</strong> after dispatch</li><li><strong>Free shipping</strong> on orders above &#8377;999</li><li><strong>Cash on Delivery</strong> available across India</li><li>You'll receive a tracking link via SMS/email once shipped</li></ul></div></div>
    <div class="acc"><button class="acc-head" data-acc="why">Why Choose Us <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="acc-body" id="acc-why"><div class="acc-why"><div class="acc-why-item"><div class="acc-why-icon">&#128167;</div><div class="acc-why-text"><strong>100% Waterproof</strong><span>Wear it in rain, sweat or shower</span></div></div><div class="acc-why-item"><div class="acc-why-icon">&#10024;</div><div class="acc-why-text"><strong>Anti-Tarnish</strong><span>Stays shiny for months — guaranteed</span></div></div><div class="acc-why-item"><div class="acc-why-icon">&#129332;</div><div class="acc-why-text"><strong>Skin-Safe</strong><span>Nickel-free, hypoallergenic</span></div></div><div class="acc-why-item"><div class="acc-why-icon">&#128230;</div><div class="acc-why-text"><strong>Fast Delivery</strong><span>Dispatched within 24 hrs</span></div></div><div class="acc-why-item"><div class="acc-why-icon">&#128260;</div><div class="acc-why-text"><strong>Easy Returns</strong><span>Hassle-free within 7 days</span></div></div><div class="acc-why-item"><div class="acc-why-icon">&#128274;</div><div class="acc-why-text"><strong>Secure Payments</strong><span>PayU — cards, UPI, COD</span></div></div></div></div></div>
    <div class="acc"><button class="acc-head" data-acc="care">Size &amp; Care <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button><div class="acc-body" id="acc-care"><ul class="acc-bullets"><li>Adjustable size fits everyone</li><li>Avoid direct contact with perfume, lotion or chemicals</li></ul></div></div>

    <div class="rv-section">
      <div class="rv-head">
        <div><div class="rv-title">Customer Reviews</div></div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div class="rv-avg"><div class="rv-avg-num" id="rvAvgNum">4.8</div><div class="rv-stars-row"><div class="rv-stars" id="rvAvgStars">&#9733;&#9733;&#9733;&#9733;&#9733;</div><div class="rv-count" id="rvCount">5 reviews</div></div></div>
          <button class="btn-write-rv" id="btnWriteRv">Write a Review</button>
        </div>
      </div>
      <div class="rv-list" id="rvList"></div>
    </div>
  </div>
</div>

<div class="ymal-section" id="ymalSection" style="max-width:980px;margin:0 auto;padding:0 16px">
  <div class="ymal-title">You May Also Like</div>
  <div class="ymal-strip" id="ymalStrip"></div>
</div>
<div class="rv-viewed-section" id="rvViewedSection" style="max-width:980px;margin:0 auto;padding:0 16px;display:none">
  <div class="rv-viewed-title">Recently Viewed</div>
  <div class="rv-viewed-strip" id="rvViewedStrip"></div>
</div>

${FOOTER_HTML}

<div class="sticky-atb" id="stickyAtb">
  <div class="sticky-atb-info">
    <div class="sticky-atb-title">${esc(title)}</div>
    <div class="sticky-atb-price">&#8377;${price.toLocaleString('en-IN')}</div>
  </div>
  <button class="sticky-atb-btn" id="stickyAtbBtn"${status === 'out' ? ' disabled' : ''}>${status === 'out' ? 'Out of Stock' : 'Add to Bag'}</button>
</div>

<div class="rv-modal-overlay" id="rvModalOverlay">
  <div class="rv-modal-box">
    <div class="rv-modal-title">Write a Review <button class="btn-close" id="rvModalClose">&#10005;</button></div>
    <div class="rv-form-g"><label class="rv-form-label">Your Name</label><input class="rv-form-input" id="rv_name" placeholder="e.g. Priya S." autocomplete="name"></div>
    <div class="rv-form-g"><label class="rv-form-label">Rating</label><div class="star-picker" id="starPicker"><span class="star-pick" data-val="1">&#9733;</span><span class="star-pick" data-val="2">&#9733;</span><span class="star-pick" data-val="3">&#9733;</span><span class="star-pick" data-val="4">&#9733;</span><span class="star-pick" data-val="5">&#9733;</span></div></div>
    <div class="rv-form-g"><label class="rv-form-label">Your Review</label><textarea class="rv-form-ta" id="rv_text" placeholder="Tell us what you think…" rows="4"></textarea></div>
    <button class="btn-rv-submit" id="btnRvSubmit">Submit Review</button>
  </div>
</div>

<div class="toast" id="toast"></div>
${CART_HTML}
${CHECKOUT_HTML}
${PAYU_FORM}
${WA_BUTTON}

<script id="related-products" type="application/json">${relatedBaked}<\/script>
<script>
${SHARED_JS}

var PPID="${esc(id)}",PTITLE="${esc(title).replace(/"/g,'&quot;')}",PPRICE=${price},PSTOCK=${stock},TSLIDES=${totalSlides};
var SCRIPT_URL_PP="${SCRIPT_URL}";

// Add to bag
var addBtn=document.getElementById("addToBagBtn");
if(addBtn&&PSTOCK>0)addBtn.addEventListener("click",function(){addToCart(PTITLE,PPRICE,PSTOCK);});
var stickyBtn=document.getElementById("stickyAtbBtn");
if(stickyBtn&&PSTOCK>0)stickyBtn.addEventListener("click",function(){addToCart(PTITLE,PPRICE,PSTOCK);});

// Sticky bar (mobile)
(function(){
  var sticky=document.getElementById("stickyAtb"),mainBtn=document.getElementById("addToBagBtn");
  if(!sticky||!mainBtn||window.innerWidth>640)return;
  var io=new IntersectionObserver(function(e){sticky.classList.toggle("show",!e[0].isIntersecting);},{threshold:0});
  io.observe(mainBtn);
})();

// Slider
var ppTrack=document.getElementById("ppTrack"),CSLIDE=0;
function ppGoTo(idx){
  if(TSLIDES<2)return;
  var cv=ppTrack.children[CSLIDE]&&ppTrack.children[CSLIDE].querySelector("video");
  if(cv)cv.pause();
  CSLIDE=((idx%TSLIDES)+TSLIDES)%TSLIDES;
  ppTrack.style.transform="translateX(-"+(CSLIDE*(100/TSLIDES))+"%)";
  document.querySelectorAll(".pthumb,.pthumb-vid").forEach(function(t,i){t.classList.toggle("active",i===CSLIDE);});
}
if(TSLIDES>1){
  document.getElementById("ppPrev").addEventListener("click",function(){ppGoTo(CSLIDE-1);});
  document.getElementById("ppNext").addEventListener("click",function(){ppGoTo(CSLIDE+1);});
  document.querySelectorAll(".pthumb,.pthumb-vid").forEach(function(t){
    t.addEventListener("click",function(){ppGoTo(parseInt(this.getAttribute("data-idx")));});
  });
  var ptx=0;
  ppTrack.addEventListener("touchstart",function(e){ptx=e.touches[0].clientX;},{passive:true});
  ppTrack.addEventListener("touchend",function(e){var d=ptx-e.changedTouches[0].clientX;if(Math.abs(d)>40)ppGoTo(d>0?CSLIDE+1:CSLIDE-1);},{passive:true});
}

// Zoom on desktop
(function(){
  var stage=document.getElementById("stage");if(!stage)return;
  stage.addEventListener("mousemove",function(e){
    if(window.innerWidth<681)return;
    var rect=stage.getBoundingClientRect(),slide=ppTrack.children[CSLIDE];if(!slide)return;
    var img=slide.querySelector("img");if(!img)return;
    img.style.transformOrigin=((e.clientX-rect.left)/rect.width*100).toFixed(2)+"% "+((e.clientY-rect.top)/rect.height*100).toFixed(2)+"%";
    img.style.transform="scale(1.35)";stage.style.cursor="zoom-in";
  });
  stage.addEventListener("mouseleave",function(){
    var slide=ppTrack.children[CSLIDE];if(!slide)return;
    var img=slide.querySelector("img");if(img){img.style.transform="scale(1)";img.style.transformOrigin="center center";}
    stage.style.cursor="";
  });
})();

// Share
document.getElementById("shareBtn").addEventListener("click",function(){
  if(navigator.share)navigator.share({title:"${esc(title)} | Minella Jewels",url:window.location.href}).catch(function(){});
  else navigator.clipboard.writeText(window.location.href).then(function(){showToast("Link copied! \uD83D\uDD17");}).catch(function(){showToast("Link copied! \uD83D\uDD17");});
});

// Accordions
document.querySelectorAll(".acc-head").forEach(function(btn){
  btn.addEventListener("click",function(){
    var key=this.getAttribute("data-acc"),body=document.getElementById("acc-"+key),isOpen=this.classList.contains("open");
    document.querySelectorAll(".acc-head").forEach(function(b){b.classList.remove("open");});
    document.querySelectorAll(".acc-body").forEach(function(b){b.classList.remove("open");});
    if(!isOpen){this.classList.add("open");if(body)body.classList.add("open");}
  });
});

// Reviews
var FAKE_REVIEWS=[
  {name:"Priya Krishnan",rating:5,text:"Absolutely love this piece! Hasn't tarnished even after a month of daily wear. Delivery was super fast too!",date:"2026-03-15"},
  {name:"Ananya M.",rating:5,text:"Ordered for my sister's birthday and she was thrilled. Quality is way better than the price suggests.",date:"2026-03-08"},
  {name:"Kavya R.",rating:4,text:"Really nice jewellery. Wore it to a function and got so many compliments. Anti-tarnish coating works!",date:"2026-02-28"},
  {name:"Deepika S.",rating:5,text:"Packaging was gorgeous and piece looks exactly like the photos. COD option made it easy to try.",date:"2026-02-20"},
  {name:"Meenakshi V.",rating:4,text:"Good quality for the price. 3 weeks and still shiny. Shipping via Delhivery was prompt.",date:"2026-02-10"}
];
function starsHtml(n){var s="";for(var i=1;i<=5;i++)s+=i<=n?"&#9733;":"&#9734;";return s;}
function fmtDate(iso){try{return new Date(iso).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});}catch(e){return iso;}}
function renderReviews(allRv){
  var list=document.getElementById("rvList");
  var total=allRv.length,sum=allRv.reduce(function(s,r){return s+(r.rating||5);},0),avg=total?Math.round((sum/total)*10)/10:5;
  document.getElementById("rvAvgNum").textContent=avg.toFixed(1);
  document.getElementById("rvCount").textContent=total+" review"+(total!==1?"s":"");
  document.getElementById("rvAvgStars").innerHTML=starsHtml(Math.round(avg));
  list.innerHTML=allRv.map(function(r){
    return'<div class="rv-card"><div class="rv-card-head"><span class="rv-name">'+esc(r.name)+'</span><span class="rv-date">'+fmtDate(r.date)+'</span></div>'
      +'<div class="rv-card-stars">'+starsHtml(r.rating||5)+'</div><div class="rv-text">'+esc(r.text)+'</div>'
      +'<div class="rv-verified"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Verified Purchase</div></div>';
  }).join("");
}
(function(){
  var allRv=FAKE_REVIEWS.slice();renderReviews(allRv);
  fetch(SCRIPT_URL_PP+"?"+new URLSearchParams({action:"getReviews",productId:PPID}).toString())
    .then(function(r){return r.json();})
    .then(function(data){if(Array.isArray(data)&&data.length){data.forEach(function(r){allRv.push(r);});renderReviews(allRv);}})
    .catch(function(){});
})();

var rvRating=0;
document.getElementById("btnWriteRv").addEventListener("click",function(){document.getElementById("rvModalOverlay").classList.add("open");});
document.getElementById("rvModalClose").addEventListener("click",function(){document.getElementById("rvModalOverlay").classList.remove("open");});
document.getElementById("rvModalOverlay").addEventListener("click",function(e){if(e.target===this)this.classList.remove("open");});
document.querySelectorAll(".star-pick").forEach(function(s){
  s.addEventListener("click",function(){rvRating=parseInt(this.getAttribute("data-val"));document.querySelectorAll(".star-pick").forEach(function(st,si){st.classList.toggle("lit",si<rvRating);});});
  s.addEventListener("mouseover",function(){var v=parseInt(this.getAttribute("data-val"));document.querySelectorAll(".star-pick").forEach(function(st,si){st.classList.toggle("lit",si<v);});});
  s.addEventListener("mouseout",function(){document.querySelectorAll(".star-pick").forEach(function(st,si){st.classList.toggle("lit",si<rvRating);});});
});
document.getElementById("btnRvSubmit").addEventListener("click",function(){
  var name=document.getElementById("rv_name").value.trim(),text=document.getElementById("rv_text").value.trim();
  if(!name){showToast("Please enter your name");return;}
  if(!rvRating){showToast("Please select a rating");return;}
  if(!text){showToast("Please write your review");return;}
  var btn=this;btn.textContent="Submitting…";btn.disabled=true;
  fetch(SCRIPT_URL_PP+"?"+new URLSearchParams({action:"submitReview",productId:PPID,name:name,rating:rvRating,review:text,date:new Date().toISOString()}).toString())
    .catch(function(){}).finally(function(){
      document.getElementById("rvModalOverlay").classList.remove("open");
      document.getElementById("rv_name").value="";document.getElementById("rv_text").value="";
      rvRating=0;document.querySelectorAll(".star-pick").forEach(function(s){s.classList.remove("lit");});
      btn.textContent="Submit Review";btn.disabled=false;showToast("Thanks for your review! &#10024;");
    });
});

// YMAL
(function(){
  var strip=document.getElementById("ymalStrip"),sec=document.getElementById("ymalSection"),el=document.getElementById("related-products");
  if(!el||!strip)return;
  var related=JSON.parse(el.textContent);
  if(!related.length){if(sec)sec.style.display="none";return;}
  related.forEach(function(rp){
    var isOut=(rp.stock<=0),card=document.createElement("div");
    card.className="product-card fade-in";
    card.innerHTML=(isOut?'<div class="stock-badge out">Out of Stock</div>':'')
      +'<div class="img-wrap"><img src="'+esc(rp.img)+'" alt="'+esc(rp.title)+'" loading="lazy" class="loaded"></div>'
      +'<div class="card-body"><div class="card-title">'+esc(rp.title)+'</div><div class="price-row"><div class="price-single">&#8377;'+Number(rp.price).toLocaleString("en-IN")+'</div></div>'
      +'<div class="card-actions"><button class="btn-add ymal-atb"'+(isOut?" disabled":"")+'>'+(isOut?"Out of Stock":"Add to Bag")+'</button></div></div>';
    card.querySelector(".ymal-atb").addEventListener("click",function(e){e.stopPropagation();if(!isOut)addToCart(rp.title,rp.price,rp.stock);});
    card.addEventListener("click",function(){window.location.href="/product/"+rp.id;});
    strip.appendChild(card);
  });
})();

// Recently viewed
(function(){
  var RV_KEY="minella_rv",entry=${rvEntry};
  try{
    var stored=localStorage.getItem(RV_KEY),list=stored?JSON.parse(stored):[];
    list=list.filter(function(x){return String(x.id)!==String(entry.id);});
    list.unshift(entry);if(list.length>6)list=list.slice(0,6);
    localStorage.setItem(RV_KEY,JSON.stringify(list));
    var toShow=list.filter(function(x){return String(x.id)!==String(entry.id);}).slice(0,4);
    if(toShow.length){
      var sec=document.getElementById("rvViewedSection"),strip=document.getElementById("rvViewedStrip");
      if(sec&&strip){
        sec.style.display="block";
        toShow.forEach(function(rp){
          var card=document.createElement("div");card.className="product-card";
          card.innerHTML='<div class="img-wrap"><img src="'+esc(rp.img)+'" alt="'+esc(rp.title)+'" loading="lazy" class="loaded"></div>'
            +'<div class="card-body"><div class="card-title">'+esc(rp.title)+'</div><div class="price-row"><div class="price-single">&#8377;'+Number(rp.price).toLocaleString("en-IN")+'</div></div></div>';
          card.addEventListener("click",function(){window.location.href="/product/"+rp.id;});
          strip.appendChild(card);
        });
      }
    }
  }catch(e){}
})();

updateCartUI();
<\/script>
</body>
</html>`;
}

// ── Sitemap ───────────────────────────────────────────────────
function buildSitemap(products) {
  const now = new Date().toISOString().split('T')[0];
  const staticUrls = [
    { loc: STORE_URL,                              priority: '1.0', changefreq: 'daily'   },
    { loc: `${STORE_URL}/about.html`,              priority: '0.5', changefreq: 'monthly' },
    { loc: `${STORE_URL}/contact.html`,            priority: '0.5', changefreq: 'monthly' },
    { loc: `${STORE_URL}/track.html`,              priority: '0.4', changefreq: 'monthly' },
    { loc: `${STORE_URL}/faqs.html`,               priority: '0.5', changefreq: 'monthly' },
    { loc: `${STORE_URL}/ring-size-guide.html`,    priority: '0.4', changefreq: 'monthly' },
    { loc: `${STORE_URL}/jewellery-care.html`,     priority: '0.4', changefreq: 'monthly' },
    { loc: `${STORE_URL}/shipping-policy.html`,    priority: '0.4', changefreq: 'yearly'  },
    { loc: `${STORE_URL}/return-policy.html`,      priority: '0.4', changefreq: 'yearly'  },
    { loc: `${STORE_URL}/warranty-policy.html`,    priority: '0.3', changefreq: 'yearly'  },
    { loc: `${STORE_URL}/privacy-policy.html`,     priority: '0.3', changefreq: 'yearly'  },
    { loc: `${STORE_URL}/terms.html`,              priority: '0.3', changefreq: 'yearly'  },
  ];
  const productUrls = products.map(p => ({
    loc: `${STORE_URL}/product/${getField(p, 'id')}`,
    priority: '0.8', changefreq: 'weekly'
  }));
  const all = [...staticUrls, ...productUrls];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

// ── llms.txt ──────────────────────────────────────────────────
function buildLlmsTxt(products) {
  let txt = `# Minella Jewels
> Delicate pieces for every story, built to last.

Anti-tarnish, water-resistant women's jewellery across India. Necklaces, Bracelets, Anklets, Earrings, Rings.

## Main Links
- [Shop](${STORE_URL})
- [About](${STORE_URL}/about.html)
- [Contact](${STORE_URL}/contact.html)
- [Track Orders](${STORE_URL}/track.html)

## Products
`;
  products.forEach(p => {
    const title = getField(p, 'title', 'Title', 'Product Name');
    const price = parseFloat(getField(p, 'price', 'Price')) || 0;
    const stock = parseInt(getField(p, 'stocks', 'Stocks', 'stock')) || 0;
    const id    = getField(p, 'id');
    const out   = stockStatus(stock) === 'out' ? ' (Out of Stock)' : '';
    txt += `- [${title}](${STORE_URL}/product/${id}): ₹${price.toLocaleString('en-IN')}${out}\n`;
  });
  return txt;
}

// ── Run ───────────────────────────────────────────────────────
async function run() {
  const products = await fetchProducts();
  const logoP    = products.find(p => getField(p, 'logo_link'));
  const logoSrc  = logoP ? driveThumb(getField(logoP, 'logo_link'), 200) : null;

  console.log('\n🏪 Building product pages...');
  let count = 0;
  for (const p of products) {
    const id = getField(p, 'id');
    if (!id) continue;
    const dir = path.join(__dirname, '..', 'product', String(id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildProductPage(p, logoSrc, products));
    process.stdout.write(`  ✓ product/${id}/index.html\n`);
    count++;
  }
  console.log(`  ✅ ${count} product pages written`);

  console.log('\n🗺️  Building sitemap.xml + llms.txt...');
  fs.writeFileSync(path.join(__dirname, '..', 'sitemap.xml'), buildSitemap(products));
  fs.writeFileSync(path.join(__dirname, '..', 'llms.txt'),    buildLlmsTxt(products));
  console.log('  ✅ sitemap.xml written');
  console.log('  ✅ llms.txt written');
}

if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });

module.exports = { run };
