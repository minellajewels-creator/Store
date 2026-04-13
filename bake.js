// ============================================================
// bake.js — Minella Jewels static site generator
// Run: node bake.js
// Generates:
//   index.html              → main store (fully baked, no sheet at runtime)
//   product/201/index.html  → individual product pages
//   product/202/index.html  → ...etc
// ============================================================

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const STORE_URL  = 'https://minella.in';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxcWsMJFT2QTsP9chLWcn39PCjqYnxEuehJWalv2i6aRJM6duhHu1DGxnxErFHtathO/exec';
const SHEET_URL  = `${SCRIPT_URL}?action=getProducts`;

// ── Load and split style.css into sections ────────────────────
const RAW_CSS = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

function cssSection(marker) {
  // Extract from "/* ── N. MARKER" up to (but not including) the next "/* ── " section header
  const start = RAW_CSS.indexOf(`/* ── ${marker}`);
  if (start === -1) throw new Error(`CSS section not found: ${marker}`);
  // Find next section after this one
  const nextSection = RAW_CSS.indexOf('/* ── ', start + 10);
  return nextSection === -1 ? RAW_CSS.slice(start) : RAW_CSS.slice(start, nextSection);
}

const ROOT_CSS    = cssSection('1. ROOT');
const SHARED_CSS  = cssSection('2. SHARED');
const INDEX_CSS   = cssSection('3. INDEX PAGE');
const PRODUCT_CSS = cssSection('4. PRODUCT PAGE');

// ── HTTP fetch with redirect ──────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ── Drive helpers ─────────────────────────────────────────────
function extractDriveId(url) {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^\/\?&]+)/)
    || url.match(/[?&]id=([^&]+)/)
    || url.match(/\/d\/([^\/\s,]+)/);
  return m ? m[1] : null;
}
function driveThumb(rawUrl, width = 600) {
  if (!rawUrl || !rawUrl.trim()) return '';
  const id = extractDriveId(rawUrl.trim());
  return id ? `https://lh3.googleusercontent.com/d/${id}=w${width}` : rawUrl.trim();
}
function getAdditionalImgs(cell) {
  if (!cell || !cell.trim()) return [];
  return cell.replace(/^"|"$/g, '').split(',').map(u => u.trim()).filter(Boolean);
}

// ── Helpers ───────────────────────────────────────────────────
function stockStatus(stock) {
  const s = parseInt(stock) || 0;
  return s <= 0 ? 'out' : s <= 3 ? 'limited' : 'available';
}
function calcDiscount(price, wo) {
  if (!wo || wo <= price) return null;
  return Math.round((wo - price) / wo * 100);
}
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function getField(p, ...keys) {
  for (const k of keys) if (p[k] !== undefined && p[k] !== '') return p[k];
  return '';
}
function getProductCategory(p) {
  const cat = ((p.category || p.Category || '')).trim().toLowerCase();
  if (cat) return cat;
  const t = ((p.title || p.Title || '')).trim().toLowerCase();
  if (/earring|stud|hoop|jhumk/i.test(t)) return 'earring';
  if (/necklace|pendant|chain/i.test(t)) return 'necklace';
  if (/bracelet|bangle/i.test(t)) return 'bracelet';
  if (/anklet|payal/i.test(t)) return 'anklet';
  if (/\bring\b/i.test(t)) return 'ring';
  return 'other';
}
function categoryLabel(cat) {
  const map = { earring: 'Earrings', necklace: 'Necklaces', bracelet: 'Bracelets', anklet: 'Anklets', ring: 'Rings', other: 'Jewellery' };
  return map[cat] || 'Jewellery';
}

// ── Shared HTML fragments ─────────────────────────────────────
const CART_HTML = `<div class="overlay" id="overlay"></div>
<div class="cart-drawer" id="cartDrawer">
  <div class="drawer-head"><h3>Your Bag</h3><button class="btn-close" id="cartCloseBtn">&#10005;</button></div>
  <div class="cart-body" id="cartBody"><div class="cart-empty"><div class="cart-empty-icon">&#128717;</div><p>Your bag is empty</p></div></div>
  <div class="cart-foot" id="cartFoot" style="display:none">
    <div class="cart-cod-note">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Cash on Delivery available at checkout
    </div>
    <div class="cart-total-row"><span>Subtotal</span><span id="cartSubtotalEl">&#8377;0</span></div>
    <button class="btn-checkout" id="checkoutBtn">Proceed to Checkout</button>
  </div>
</div>`;

const CHECKOUT_HTML = `<div class="overlay" id="coOverlay"></div>
<div class="co-modal" id="coModal">
  <div class="co-box">
    <div class="co-head"><h3>Checkout</h3><button class="btn-close" id="coCloseBtn">&#10005;</button></div>
    <div class="stepper">
      <div class="step-item active" id="st1"><div class="step-circle" id="sc1">1</div><div class="step-label">Review</div></div>
      <div class="step-line" id="sl1"></div>
      <div class="step-item" id="st2"><div class="step-circle" id="sc2">2</div><div class="step-label">Delivery</div></div>
      <div class="step-line" id="sl2"></div>
      <div class="step-item" id="st3"><div class="step-circle" id="sc3">3</div><div class="step-label">Payment</div></div>
    </div>
    <div class="co-body" id="coBody">
      <div class="err-banner" id="errBanner">&#9888;&#65039; <span id="errMsg"></span></div>
      <div class="co-section active" id="coSec1">
        <div class="co-sec-title">Order Summary</div>
        <div class="co-cod-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Cash on Delivery available — pay when your order arrives!
        </div>
        <div id="orderLines"></div>
        <div class="order-line sub-line"><span>Shipping</span><span id="shippingDisplay">Calculated in next step</span></div>
        <div class="order-line sub-line" id="codRow" style="display:none"><span>COD Charge</span><span id="codDisplay"></span></div>
        <div class="order-line total-line"><span>Grand Total</span><span id="grandTotal">&#8212;</span></div>
      </div>
      <div class="co-section" id="coSec2">
        <div class="co-sec-title">Delivery Details</div>
        <div class="form-g"><label class="form-label">Full Name <span class="req">*</span></label><input class="form-input" id="f_name" placeholder="e.g. Priya Krishnan" autocomplete="name"><div class="field-err" id="e_name">Please enter your full name</div></div>
        <div class="form-g"><label class="form-label">Mobile Number <span class="req">*</span></label><input class="form-input" id="f_phone" placeholder="10-digit mobile" maxlength="10" type="tel" autocomplete="tel" inputmode="numeric"><div class="field-err" id="e_phone">Enter a valid 10-digit number</div></div>
        <div class="form-g"><label class="form-label">Email <span class="req">*</span></label><input class="form-input" id="f_email" placeholder="yourname@email.com" type="email" autocomplete="email"><div class="field-err" id="e_email">Enter a valid email address</div></div>
        <div class="form-g"><label class="form-label">Address <span class="req">*</span></label><input class="form-input" id="f_addr" placeholder="House/Flat no., Street, Area" autocomplete="street-address"><div class="field-err" id="e_addr">Please enter your address</div></div>
        <div class="form-row">
          <div class="form-g"><label class="form-label">City</label><input class="form-input" id="f_city" placeholder="City" autocomplete="address-level2"></div>
          <div class="form-g"><label class="form-label">State</label><input class="form-input" id="f_state" placeholder="State" autocomplete="address-level1"></div>
        </div>
        <div class="form-g"><label class="form-label">Pincode <span class="req">*</span></label><input class="form-input" id="f_pin" placeholder="6-digit pincode" maxlength="6" type="tel" inputmode="numeric" autocomplete="postal-code"><div class="field-err" id="e_pin">Enter a valid 6-digit pincode</div></div>
        <div class="shipping-info" id="shippingBox"><div class="shipping-label">Estimated Shipping</div><div class="shipping-amount" id="shippingAmt"></div><div class="shipping-zone" id="shippingZone"></div></div>
      </div>
      <div class="co-section" id="coSec3">
        <div class="co-sec-title">Payment Method</div>
        <div class="pay-sec-label">Pay Online</div>
        <div class="pay-methods-grid" id="payMethodsGrid">
          <div class="pay-method-card" data-pay="upi"><div class="pay-method-icon">&#128242;</div><div class="pay-method-label">UPI</div><div class="pay-method-sub">GPay, PhonePe, Paytm</div></div>
          <div class="pay-method-card" data-pay="card"><div class="pay-method-icon">&#128179;</div><div class="pay-method-label">Credit / Debit Card</div><div class="pay-method-sub">Visa, Mastercard, RuPay</div></div>
          <div class="pay-method-card" data-pay="netbanking"><div class="pay-method-icon">&#127974;</div><div class="pay-method-label">Net Banking</div><div class="pay-method-sub">All major banks</div></div>
          <div class="pay-method-card" data-pay="wallet"><div class="pay-method-icon">&#128091;</div><div class="pay-method-label">Wallets</div><div class="pay-method-sub">Paytm, Mobikwik, Airtel</div></div>
          <div class="pay-method-card" data-pay="emi"><div class="pay-method-icon">&#128197;</div><div class="pay-method-label">EMI</div><div class="pay-method-sub">Credit card EMI</div></div>
        </div>
        <div class="pay-divider">or</div>
        <div class="cod-card" id="codCard" data-pay="cod"><div class="cod-card-icon">&#128181;</div><div class="cod-card-text"><div class="cod-card-label">Cash on Delivery</div><div class="cod-card-sub">Pay when your order arrives — no upfront payment needed</div></div></div>
        <div class="err-banner" id="payErr">&#9888;&#65039; Please select a payment method</div>
        <div class="confirm-box" id="confirmBox" style="display:none"><div class="confirm-box-title">Order Summary</div><div id="confirmLines"></div><div class="confirm-total"><span>Grand Total</span><span id="confirmTotal"></span></div></div>
        <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-top:8px" id="payNote"></div>
      </div>
    </div>
    <div class="co-foot">
      <button class="btn-back" id="btnBack" style="display:none">&#8592; Back</button>
      <button class="btn-next" id="btnNext">Continue &#8594;</button>
    </div>
  </div>
</div>`;

const PAYU_FORM = `<form id="payuForm" method="POST">
  <input type="hidden" name="key" id="pu_key">
  <input type="hidden" name="txnid" id="pu_txnid">
  <input type="hidden" name="amount" id="pu_amount">
  <input type="hidden" name="productinfo" id="pu_productinfo">
  <input type="hidden" name="firstname" id="pu_firstname">
  <input type="hidden" name="email" id="pu_email">
  <input type="hidden" name="phone" id="pu_phone">
  <input type="hidden" name="surl" id="pu_surl">
  <input type="hidden" name="furl" id="pu_furl">
  <input type="hidden" name="hash" id="pu_hash">
  <input type="hidden" name="udf1" id="pu_udf1">
  <input type="hidden" name="udf2" id="pu_udf2">
  <input type="hidden" name="udf3" id="pu_udf3" value="">
  <input type="hidden" name="udf4" id="pu_udf4" value="">
  <input type="hidden" name="udf5" id="pu_udf5" value="">
</form>`;

const FOOTER_HTML = `<footer style="text-align:center;padding:32px 20px 40px;font-size:13px;color:var(--muted);border-top:1px solid var(--border);margin-top:20px">
  <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:14px">
    <a href="/about" style="color:var(--muted);text-decoration:none">About Us</a>
    <a href="/contact" style="color:var(--muted);text-decoration:none">Contact Us</a>
    <a href="/track" style="color:var(--muted);text-decoration:none">Track Order</a>
    <a href="/faqs" style="color:var(--muted);text-decoration:none">FAQ's</a>
    <a href="/ring-size-guide" style="color:var(--muted);text-decoration:none">Ring Size Guide</a>
    <a href="/jewellery-care" style="color:var(--muted);text-decoration:none">Jewellery Care</a>
    <a href="/shipping-policy" style="color:var(--muted);text-decoration:none">Shipping &amp; Delivery</a>
    <a href="/return-policy" style="color:var(--muted);text-decoration:none">Refund &amp; Exchange Policy</a>
    <a href="/warranty-policy" style="color:var(--muted);text-decoration:none">Warranty</a>
    <a href="/privacy-policy" style="color:var(--muted);text-decoration:none">Privacy Policy</a>
    <a href="/terms" style="color:var(--muted);text-decoration:none">Terms &amp; Conditions</a>
  </div>
  <div style="display:flex;justify-content:center;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:14px">
    <a href="https://instagram.com/minellajewels" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;color:var(--muted);text-decoration:none;font-size:12px;transition:.2s" onmouseover="this.style.color='var(--plum)'" onmouseout="this.style.color='var(--muted)'">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
      @minellajewels
    </a>
    <a href="mailto:minellajewels@gmail.com" style="display:inline-flex;align-items:center;gap:6px;color:var(--muted);text-decoration:none;font-size:12px;transition:.2s" onmouseover="this.style.color='var(--plum)'" onmouseout="this.style.color='var(--muted)'">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      minellajewels@gmail.com
    </a>
    <a href="https://wa.me/919080014835" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;color:var(--muted);text-decoration:none;font-size:12px;transition:.2s" onmouseover="this.style.color='var(--ok)'" onmouseout="this.style.color='var(--muted)'">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      +91 90800 14835
    </a>
  </div>
  <div style="color:var(--cream3);font-size:18px;margin-bottom:8px">&#10022; &#10022; &#10022;</div>
  &copy; 2025 Minella Jewels &middot; Made with &hearts; in Coimbatore
</footer>`;

const WA_BUTTON = `<a href="https://wa.me/919080014835" target="_blank" rel="noopener" id="waBtn" aria-label="Chat on WhatsApp"
  style="position:fixed;bottom:calc(24px + var(--safe-bottom));right:20px;z-index:9990;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#25d366,#128c7e);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(37,211,102,0.45);transition:transform .2s,box-shadow .2s;text-decoration:none"
  onmouseover="this.style.transform='scale(1.1)';this.style.boxShadow='0 6px 28px rgba(37,211,102,0.55)'"
  onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 4px 20px rgba(37,211,102,0.45)'">
  <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
</a>`;

const PVIEW_MODAL_HTML = `<div class="overlay" id="pviewOverlay"></div>
<div class="pview-modal" id="pviewModal">
  <div class="pview-box">
    <div class="pview-imgs" id="pviewImgsEl">
      <button class="pview-close" id="pviewCloseBtn">&#10005;</button>
      <div class="pview-thumbs" id="pviewThumbs"></div>
    </div>
    <div class="pview-info">
      <div class="pview-title" id="pviewTitle"></div>
      <div class="pview-price-row" id="pviewPriceRow"></div>
      <div class="pview-stock" id="pviewStock"></div>
      <div class="pview-cod">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Cash on Delivery available
      </div>
      <div class="pview-trust">
        <div class="pview-trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Anti-tarnish</div>
        <div class="pview-trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Fast delivery</div>
        <div class="pview-trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Secure pay</div>
      </div>
      <button class="pview-details-toggle" id="pviewDetailsToggle" style="display:none">
        Product Details
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="pview-details-body" id="pviewDetailsBody"></div>
      <button class="btn-pview-add" id="pviewAddBtn">Add to Bag</button>
    </div>
  </div>
</div>`;

// ── Shared JS (cart + checkout + PayU) ────────────────────────
const SHARED_JS = `
const SCRIPT_URL="${SCRIPT_URL}";
const STORE_URL="${STORE_URL}";
const CART_KEY="minella_cart_v1";
let cart={},selectedPay=null,shippingCost=null,currentStep=1;

function saveCart(){try{localStorage.setItem(CART_KEY,JSON.stringify(cart));}catch(e){}}
function loadCart(){try{var r=localStorage.getItem(CART_KEY);if(r){var p=JSON.parse(r);if(p&&typeof p==="object")cart=p;}}catch(e){cart={};}}
function clearCart(){cart={};saveCart();}
loadCart();

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function unesc(s){var d=document.createElement("div");d.innerHTML=s;return d.textContent;}
function showToast(msg){var t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(function(){t.classList.remove("show");},2400);}
function showSpinner(msg){document.getElementById("spinnerText").textContent=msg||"Processing\u2026";document.getElementById("spinner").classList.add("show");}
function hideSpinner(){document.getElementById("spinner").classList.remove("show");}
function showErr(msg){document.getElementById("errMsg").textContent=msg;document.getElementById("errBanner").classList.add("show");document.getElementById("coBody").scrollTo({top:0,behavior:"smooth"});}

function extractDriveId(url){if(!url)return null;var m=url.match(/\\/file\\/d\\/([^\\/\\?&]+)/)||url.match(/[?&]id=([^&]+)/)||url.match(/\\/d\\/([^\\/]+)/);return m?m[1]:null;}
function driveUrl(rawUrl,width){width=width||600;if(!rawUrl||!rawUrl.trim())return"";var id=extractDriveId(rawUrl.trim());if(id)return"https://lh3.googleusercontent.com/d/"+id+"=w"+width;return rawUrl.trim();}
function getAdditionalImgs(cell){if(!cell||!cell.trim())return[];return cell.replace(/^"|"$/g,"").split(",").map(function(u){return u.trim();}).filter(Boolean);}
function stockStatus(stock){var s=parseInt(stock)||0;return s<=0?"out":s<=3?"limited":"available";}

function cartSubtotal(){return Object.values(cart).reduce(function(s,i){return s+i.price*i.qty;},0);}
function cartCount(){return Object.values(cart).reduce(function(s,i){return s+i.qty;},0);}
function addToCart(title,price,stock){
  var cur=cart[title],qty=cur?cur.qty:0;
  if(qty>=stock){showToast("No more stock available");return;}
  if(cur)cur.qty++;else cart[title]={price:price,qty:1,stock:stock};
  saveCart();updateCartUI();showToast("Added to bag \u2713");pulseCartFab();
}
function changeQty(title,delta){if(!cart[title])return;cart[title].qty+=delta;if(cart[title].qty<=0)delete cart[title];saveCart();updateCartUI();}
function removeFromCart(title){delete cart[title];saveCart();updateCartUI();}
function pulseCartFab(){var fab=document.getElementById("cartFabBtn");if(!fab)return;fab.classList.remove("has-items");void fab.offsetWidth;fab.classList.add("has-items");}

function updateCartUI(){
  var body=document.getElementById("cartBody"),foot=document.getElementById("cartFoot");
  var badge=document.getElementById("cartBadge"),count=cartCount();
  badge.textContent=count;
  if(!count){
    body.innerHTML='<div class="cart-empty"><div class="cart-empty-icon">&#128717;</div><p>Your bag is empty</p></div>';
    foot.style.display="none";return;
  }
  var html="";
  Object.keys(cart).forEach(function(title){
    var item=cart[title];
    html+='<div class="cart-item"><div class="cart-item-info"><div class="cart-item-name">'+esc(title)+'</div>'
      +'<div class="cart-item-sub">&#8377;'+item.price.toLocaleString("en-IN")+' \xd7 '+item.qty+' = &#8377;'+(item.price*item.qty).toLocaleString("en-IN")+'</div></div>'
      +'<div class="qty-row"><div class="qty-ctrl">'
      +'<button data-action="dec" data-title="'+esc(title)+'">-</button>'
      +'<span class="qty-num">'+item.qty+'</span>'
      +'<button data-action="inc" data-title="'+esc(title)+'">+</button>'
      +'</div><button class="btn-remove" data-action="rem" data-title="'+esc(title)+'">\xd7</button></div></div>';
  });
  body.innerHTML=html;
  document.getElementById("cartSubtotalEl").textContent="\u20b9"+cartSubtotal().toLocaleString("en-IN");
  foot.style.display="block";
}

document.getElementById("cartBody").addEventListener("click",function(e){
  var btn=e.target.closest("button[data-action]");if(!btn)return;
  var action=btn.getAttribute("data-action"),title=unesc(btn.getAttribute("data-title"));
  if(action==="dec")changeQty(title,-1);
  else if(action==="inc")changeQty(title,1);
  else if(action==="rem")removeFromCart(title);
});

function openCart(){document.getElementById("cartDrawer").classList.add("open");document.getElementById("overlay").classList.add("open");}
function closeCart(){document.getElementById("cartDrawer").classList.remove("open");document.getElementById("overlay").classList.remove("open");}
document.getElementById("cartFabBtn").addEventListener("click",openCart);
document.getElementById("cartCloseBtn").addEventListener("click",closeCart);
document.getElementById("overlay").addEventListener("click",function(){
  if(document.getElementById("cartDrawer").classList.contains("open"))closeCart();
});

document.getElementById("checkoutBtn").addEventListener("click",openCheckout);
document.getElementById("coCloseBtn").addEventListener("click",closeCheckout);
document.getElementById("coOverlay").addEventListener("click",closeCheckout);
document.getElementById("btnBack").addEventListener("click",function(){if(currentStep>1)setStep(currentStep-1);});
document.getElementById("btnNext").addEventListener("click",nextStep);

function openCheckout(){
  if(!cartCount()){showToast("Add items to your bag first");return;}
  closeCart();selectedPay=null;shippingCost=null;currentStep=1;
  document.querySelectorAll(".pay-method-card,#codCard").forEach(function(c){c.classList.remove("selected");});
  document.getElementById("shippingBox").classList.remove("show");
  document.getElementById("shippingDisplay").textContent="Calculated in next step";
  document.getElementById("codRow").style.display="none";
  document.getElementById("errBanner").classList.remove("show");
  document.getElementById("payErr").classList.remove("show");
  document.getElementById("confirmBox").style.display="none";
  document.getElementById("payNote").textContent="";
  renderOrderLines();setStep(1);
  document.getElementById("coModal").classList.add("open");
  document.getElementById("coOverlay").classList.add("open");
}
function closeCheckout(){
  document.getElementById("coModal").classList.remove("open");
  document.getElementById("coOverlay").classList.remove("open");
}
function renderOrderLines(){
  var html="";
  Object.keys(cart).forEach(function(title){
    var item=cart[title];
    html+='<div class="order-line"><span class="order-line-name">'+esc(title)+' \xd7 '+item.qty+'</span><span class="order-line-price">&#8377;'+(item.price*item.qty).toLocaleString("en-IN")+'</span></div>';
  });
  document.getElementById("orderLines").innerHTML=html;
  updateGrandTotal();
}
function updateGrandTotal(){
  var sub=cartSubtotal(),ship=shippingCost||0,cod=0;
  if(selectedPay==="cod"){cod=Math.max(40,Math.round(sub*0.02));document.getElementById("codRow").style.display="flex";document.getElementById("codDisplay").textContent="\u20b9"+cod.toLocaleString("en-IN");}
  else document.getElementById("codRow").style.display="none";
  document.getElementById("grandTotal").textContent="\u20b9"+(sub+ship+cod).toLocaleString("en-IN");
  return sub+ship+cod;
}
function setStep(s){
  currentStep=s;
  for(var i=1;i<=3;i++){
    var st=document.getElementById("st"+i),sc=document.getElementById("sc"+i);
    st.classList.remove("active","done");
    if(i<s){st.classList.add("done");sc.textContent="\u2713";}
    else if(i===s){st.classList.add("active");sc.textContent=String(i);}
    else sc.textContent=String(i);
    if(i<3)document.getElementById("sl"+i).classList.toggle("done",i<s);
    document.getElementById("coSec"+i).classList.toggle("active",i===s);
  }
  document.getElementById("btnBack").style.display=(s>1)?"block":"none";
  var next=document.getElementById("btnNext");
  if(s===3){next.textContent="Place Order";next.className="btn-place";}
  else{next.textContent="Continue \u2192";next.className="btn-next";}
  document.getElementById("coBody").scrollTo({top:0,behavior:"smooth"});
  document.getElementById("errBanner").classList.remove("show");
}
function nextStep(){
  if(currentStep===1)setStep(2);
  else if(currentStep===2){if(!validateDelivery())return;calcShipping();setStep(3);buildConfirm();}
  else if(currentStep===3)placeOrder();
}
function validateDelivery(){
  var ok=true;
  [{id:"f_name",err:"e_name",fn:function(v){return v.length>=2;}},
   {id:"f_phone",err:"e_phone",fn:function(v){return /^\\d{10}$/.test(v);}},
   {id:"f_email",err:"e_email",fn:function(v){return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v);}},
   {id:"f_addr",err:"e_addr",fn:function(v){return v.length>=5;}},
   {id:"f_pin",err:"e_pin",fn:function(v){return /^\\d{6}$/.test(v);}}
  ].forEach(function(c){
    var el=document.getElementById(c.id),er=document.getElementById(c.err),val=el.value.trim();
    if(!c.fn(val)){el.classList.add("err");er.classList.add("show");ok=false;}
    else{el.classList.remove("err");er.classList.remove("show");}
  });
  if(!ok)showErr("Please fill all mandatory fields correctly.");
  return ok;
}
["f_name","f_phone","f_email","f_addr","f_pin"].forEach(function(id){
  var el=document.getElementById(id);if(!el)return;
  el.addEventListener("input",function(){
    el.classList.remove("err");
    var er=document.getElementById("e_"+id.split("_")[1]);if(er)er.classList.remove("show");
  });
});

var ZONE_RATES={A:{base:35.40,extra:34.22,name:"Zone A \u2014 Local (Coimbatore)"},B:{base:38.94,extra:37.76,name:"Zone B \u2014 Intra-state (Tamil Nadu)"},C:{base:51.92,extra:49.56,name:"Zone C \u2014 Metro"},D:{base:61.36,extra:57.82,name:"Zone D \u2014 Pan India"},E:{base:75.52,extra:71.98,name:"Zone E \u2014 Northeast / J&K"}};
var FLAT_PREFIXES=["380","382","560","562","631","160","140","141","600","602","110","120","121","122","201","250","124","131","132","500","711","712","713","700","400","421","401","410","411","415","395","403","641","642","643","625","626","627","628"];
function getPincodeZone(pin){
  if(!pin||pin.length!==6)return"D";
  var n=parseInt(pin),p2=pin.substring(0,2),p3=pin.substring(0,3);
  if(p2==="18"||p2==="19")return"E";
  if(p2==="73"&&n>=737000&&n<=737199)return"E";
  if(p2==="78"&&n>=781000)return"E";
  if(p2==="79"||p2==="97")return"E";
  if(n>=744100&&n<=744304)return"E";
  if(p3==="641"||p3==="642"||p3==="643"||p3==="638")return"A";
  if(n>=600000&&n<=643999)return"B";
  if(["110","400","600","700","500","560","380","411","160"].indexOf(p3)!==-1)return"C";
  return"D";
}
function calcShipping(){
  var pin=document.getElementById("f_pin").value.trim(),subtotal=cartSubtotal();
  if(subtotal>=999){
    shippingCost=0;
    document.getElementById("shippingAmt").textContent="\u20b90 \u2014 FREE!";
    document.getElementById("shippingZone").textContent="Free shipping on orders above \u20b9999 \uD83C\uDF89";
    document.getElementById("shippingBox").classList.add("show");
    document.getElementById("shippingDisplay").textContent="FREE";
    updateGrandTotal();return;
  }
  var zone=getPincodeZone(pin),r=ZONE_RATES[zone]||ZONE_RATES["D"];
  var totalItems=Object.values(cart).reduce(function(s,i){return s+i.qty;},0);
  var weightG=Math.max(500,totalItems*50),slabs=Math.ceil(weightG/500),extraSlabs=Math.max(0,slabs-1);
  var baseShip=r.base+(extraSlabs*r.extra);
  if(FLAT_PREFIXES.some(function(pf){return pin.startsWith(pf);})&&zone!=="A")baseShip+=2.50;
  var total=Math.ceil(baseShip+(baseShip*0.05));
  shippingCost=total;
  document.getElementById("shippingAmt").textContent="\u20b9"+total;
  document.getElementById("shippingZone").textContent=r.name+" \xb7 "+totalItems+" item(s) \xb7 base \u20b9"+baseShip.toFixed(2)+" + 5% fuel = \u20b9"+total;
  document.getElementById("shippingBox").classList.add("show");
  document.getElementById("shippingDisplay").textContent="\u20b9"+total;
  updateGrandTotal();
}

document.getElementById("payMethodsGrid").addEventListener("click",function(e){
  var card=e.target.closest(".pay-method-card");if(!card)return;
  selectPay(card.getAttribute("data-pay"));
});
document.getElementById("codCard").addEventListener("click",function(){selectPay("cod");});
function selectPay(type){
  selectedPay=type;
  document.querySelectorAll(".pay-method-card,#codCard").forEach(function(c){c.classList.remove("selected");});
  if(type==="cod")document.getElementById("codCard").classList.add("selected");
  else{var card=document.querySelector(".pay-method-card[data-pay='"+type+"']");if(card)card.classList.add("selected");}
  document.getElementById("payErr").classList.remove("show");
  var note=document.getElementById("payNote");
  var payLabels={upi:"UPI",card:"Credit/Debit Card",netbanking:"Net Banking",wallet:"Wallet",emi:"EMI"};
  if(type==="cod"){var sub=cartSubtotal(),cod=Math.max(40,Math.round(sub*0.02));note.textContent="COD charge of \u20b9"+cod+" (\u20b940 or 2% of order, whichever is higher) will be added.";}
  else note.textContent="You\u2019ll be redirected to PayU\u2019s secure page to pay via "+(payLabels[type]||"online")+".";
  updateGrandTotal();buildConfirm();
}
function buildConfirm(){
  var sub=cartSubtotal(),ship=shippingCost||0,cod=(selectedPay==="cod")?Math.max(40,Math.round(sub*0.02)):0,grand=sub+ship+cod,html="";
  Object.keys(cart).forEach(function(title){
    var item=cart[title];
    html+='<div class="confirm-line"><span>'+esc(title)+' \xd7'+item.qty+'</span><span>\u20b9'+(item.price*item.qty).toLocaleString("en-IN")+'</span></div>';
  });
  html+='<div class="confirm-line"><span>Shipping</span><span>\u20b9'+ship+'</span></div>';
  if(cod)html+='<div class="confirm-line"><span>COD Charge</span><span>\u20b9'+cod+'</span></div>';
  document.getElementById("confirmLines").innerHTML=html;
  document.getElementById("confirmTotal").textContent="\u20b9"+grand.toLocaleString("en-IN");
  document.getElementById("confirmBox").style.display="block";
}

function placeOrder(){
  if(!selectedPay){document.getElementById("payErr").classList.add("show");showErr("Please select a payment method.");return;}
  var name=document.getElementById("f_name").value.trim(),
      phone=document.getElementById("f_phone").value.trim(),
      email=document.getElementById("f_email").value.trim(),
      addr=document.getElementById("f_addr").value.trim(),
      city=document.getElementById("f_city").value.trim(),
      state=document.getElementById("f_state").value.trim(),
      pin=document.getElementById("f_pin").value.trim();
  var sub=cartSubtotal(),ship=shippingCost||0,cod=(selectedPay==="cod")?Math.max(40,Math.round(sub*0.02)):0,grand=sub+ship+cod;
  var itemsSummary=Object.keys(cart).map(function(t){return t+" x"+cart[t].qty+" = Rs."+(cart[t].price*cart[t].qty);}).join("; ");
  var fullAddress=addr+(city?", "+city:"")+(state?", "+state:"")+" - "+pin;
  var cartArr=Object.keys(cart).map(function(t){return{title:t,qty:cart[t].qty,price:cart[t].price};});
  if(selectedPay==="cod"){
    showSpinner("Placing your order\u2026");
    var codPayload={action:"placeOrder",name:name,phone:phone,email:email,address:fullAddress,items:itemsSummary,subtotal:sub,shipping:ship,codCharge:cod,grandTotal:grand,cartData:JSON.stringify(cartArr)};
    fetch(SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(codPayload)})
      .catch(function(){}).finally(function(){clearCart();hideSpinner();window.location.href=STORE_URL+"/success.html?method=cod&name="+encodeURIComponent(name);});
    return;
  }
  showSpinner("Setting up secure payment\u2026");
  var payload={action:"initiatePayment",name:name,phone:phone,email:email,address:fullAddress,items:itemsSummary,subtotal:sub,shipping:ship,grandTotal:grand,pincode:pin,paymentMethod:selectedPay,cartData:cartArr};
  fetch(SCRIPT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)})
    .then(function(r){return r.json();})
    .then(function(res){
      if(!res.ok||!res.formFields)throw new Error(res.error||"Payment setup failed");
      clearCart();
      var f=res.formFields;
      document.getElementById("payuForm").action=res.payuUrl;
      document.getElementById("pu_key").value=f.key;
      document.getElementById("pu_txnid").value=f.txnid;
      document.getElementById("pu_amount").value=f.amount;
      document.getElementById("pu_productinfo").value=f.productinfo;
      document.getElementById("pu_firstname").value=f.firstname;
      document.getElementById("pu_email").value=f.email;
      document.getElementById("pu_phone").value=f.phone;
      document.getElementById("pu_surl").value=f.surl;
      document.getElementById("pu_furl").value=f.furl;
      document.getElementById("pu_hash").value=f.hash;
      document.getElementById("pu_udf1").value=f.udf1;
      document.getElementById("pu_udf2").value=f.udf2;
      document.getElementById("pu_udf3").value=f.udf3||"";
      document.getElementById("pu_udf4").value=f.udf4||"";
      document.getElementById("pu_udf5").value=f.udf5||"";
      document.getElementById("payuForm").submit();
    })
    .catch(function(err){hideSpinner();showErr("Payment setup failed. Please try again. ("+err.message+")");});
}
`;

// ── Build index.html ──────────────────────────────────────────
function buildIndexHtml(products) {
  const logoP   = products.find(p => getField(p, 'logo_link'));
  const logoSrc = logoP ? driveThumb(getField(logoP, 'logo_link'), 200) : null;
  const logoHtml = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="Minella Jewels" style="height:36px;width:auto;object-fit:contain">`
    : `<span style="font-family:'Libre Baskerville',serif;font-size:20px;color:var(--plum);letter-spacing:1px">Minella Jewels</span>`;

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

  let cardsHtml = '';
  products.forEach(p => {
    const id     = String(getField(p, 'id'));
    const title  = getField(p, 'title', 'Title', 'Product Name');
    const price  = parseFloat(getField(p, 'price', 'Price')) || 0;
    const wo     = parseFloat(getField(p, 'without_offer')) || 0;
    const stock  = parseInt(getField(p, 'stocks', 'Stocks', 'stock')) || 0;
    const img    = driveThumb(getField(p, 'image link', 'Image Link', 'raw image'), 400);
    const status = stockStatus(stock);
    const disc   = calcDiscount(price, wo);
    const isOut  = status === 'out';
    const badge  = isOut ? '<div class="stock-badge out">Out of Stock</div>'
                 : status === 'limited' ? '<div class="stock-badge limited">Few in stock</div>' : '';
    const discountHtml = disc > 0 ? `<span class="badge" style="position:absolute; top:10px; right:10px; background:var(--gold); padding:2px 8px; font-size:10px; border-radius:10px; color:#fff; z-index:4;">${disc}% OFF</span>` : '';
    const priceHtml = disc
      ? `<div class="price-offer"><span class="price-now">&#8377;${price.toLocaleString('en-IN')}</span><span class="price-original">&#8377;${wo.toLocaleString('en-IN')}</span></div>`
      : `<div class="price-single">&#8377;${price.toLocaleString('en-IN')}</div>`;

    cardsHtml += `<div class="product-card fade-in" id="pc-${id}" data-pid="${id}">`
      + badge
      + discountHtml
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
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/favicon.png">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Minella Jewels — Anti-Tarnish Jewellery</title>
<meta name="description" content="Shop premium anti-tarnish, water-resistant jewellery. Necklaces, earrings, bracelets and more. Cash on delivery across India.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>
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
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </div>
  <div style="display:flex;align-items:center;gap:10px">
    <a href="/track" class="orders-fab" aria-label="My Orders">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      <span>My Orders</span>
    </a>
    <button class="cart-fab" id="cartFabBtn" aria-label="Open cart">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <span class="cart-badge" id="cartBadge">0</span>
    </button>
  </div>
</nav>

<section class="hero fade-in">
  <div class="hero-slide active" style="background-image: url('/assets/images/hero/hero-1.jpg')">
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <h1>Feel Beautiful Every Day</h1>
      <p>18K Gold Plated • Anti-Tarnish • Skin Friendly</p>
      <button class="hero-cta" id="shopNowBtn" onclick="document.getElementById('shopAnchor').scrollIntoView({behavior:'smooth'})">Shop Now &rarr;</button>
    </div>
  </div>
</section>

<div class="trust-bar fade-in">
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span><strong>Anti-Tarnish</strong> Guaranteed</span></div>
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg><span><strong>Free Shipping</strong> on &#8377;999+</span></div>
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg><span><strong>COD</strong> Available</span></div>
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span><strong>Handpicked</strong> Quality</span></div>
  <div class="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span><strong>Secure</strong> Payments</span></div>
</div>

<div class="cat-bar fade-in" id="shopAnchor">
  <div class="cat-circle active" data-cat="all">
    <div class="cat-img"><img src="/assets/images/categories/necklaces.jpg" alt="All"></div>
    <div class="cat-label">All</div>
  </div>
  <div class="cat-circle" data-cat="necklace">
    <div class="cat-img"><img src="/assets/images/categories/necklaces.jpg" alt="Necklaces"></div>
    <div class="cat-label">Necklaces</div>
  </div>
  <div class="cat-circle" data-cat="bracelet">
    <div class="cat-img"><img src="/assets/images/categories/bracelets.jpg" alt="Bracelets"></div>
    <div class="cat-label">Bracelets</div>
  </div>
  <div class="cat-circle" data-cat="anklet">
    <div class="cat-img"><img src="/assets/images/categories/bracelets.jpg" alt="Anklets"></div>
    <div class="cat-label">Anklets</div>
  </div>
  <div class="cat-circle" data-cat="earring">
    <div class="cat-img"><img src="/assets/images/categories/earrings.jpg" alt="Earrings"></div>
    <div class="cat-label">Earrings</div>
  </div>
  <div class="cat-circle" data-cat="ring">
    <div class="cat-img"><img src="/assets/images/categories/rings.jpg" alt="Rings"></div>
    <div class="cat-label">Rings</div>
  </div>
</div>

<div class="grid-wrap"><div class="grid" id="productGrid">${cardsHtml}</div></div>

${PVIEW_MODAL_HTML}
${CART_HTML}
${CHECKOUT_HTML}
${PAYU_FORM}
${WA_BUTTON}

<div class="toast" id="toast"></div>

${FOOTER_HTML}

<script id="baked-products" type="application/json">${bakedData}<\/script>

<script>
var productMap = {};
(function(){
  var el = document.getElementById("baked-products");
  if (!el) return;
  JSON.parse(el.textContent).forEach(function(p){ productMap[String(p.id)] = p; });
})();

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

/* ── TILT CARD INIT (replaces old initCardAnimations) ── */
function initTiltCards(){
  var TILT_MAX=12,LIFT_PX=8,SCALE=1.03;
  var cards=document.querySelectorAll(".product-card");

  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(entry,i){
      if(entry.isIntersecting){
        setTimeout(function(){entry.target.classList.add("card-visible");},i*55);
        io.unobserve(entry.target);
      }
    });
  },{threshold:0.08});

  cards.forEach(function(card){
    card.style.perspective="800px";
    io.observe(card);
  });

  function onMove(e){
    if(window.matchMedia("(hover:none)").matches)return;
    var card=this;
    var rect=card.getBoundingClientRect();
    var dx=(e.clientX-(rect.left+rect.width/2))/(rect.width/2);
    var dy=(e.clientY-(rect.top+rect.height/2))/(rect.height/2);
    card.style.transform="translateY(-"+LIFT_PX+"px) rotateX("+(-dy*TILT_MAX).toFixed(2)+"deg) rotateY("+(dx*TILT_MAX).toFixed(2)+"deg) scale("+SCALE+")";
    card.style.zIndex="10";
    var glare=card.querySelector(".card-glare");
    if(glare){
      var xPct=((e.clientX-rect.left)/rect.width*100).toFixed(1);
      var yPct=((e.clientY-rect.top)/rect.height*100).toFixed(1);
      glare.style.background="radial-gradient(circle at "+xPct+"% "+yPct+"%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 45%, transparent 72%)";
    }
  }
  function onLeave(){
    this.style.transform="translateY(0) rotateX(0deg) rotateY(0deg) scale(1)";
    this.style.zIndex="";
    var glare=this.querySelector(".card-glare");
    if(glare)glare.style.background="";
  }

  cards.forEach(function(card){
    card.addEventListener("mousemove",onMove);
    card.addEventListener("mouseleave",onLeave);
  });
}
initTiltCards();

document.querySelectorAll(".cat-circle").forEach(function(btn){
  btn.addEventListener("click",function(){
    document.querySelectorAll(".cat-circle").forEach(function(b){b.classList.remove("active");});
    this.classList.add("active");
    var cat=this.getAttribute("data-cat");
    document.querySelectorAll(".product-card[id^='pc-']").forEach(function(card){
      var pid=card.id.replace("pc-","");
      var p=productMap[pid];
      if(!p){card.style.display="";return;}
      card.style.display=(cat==="all"||getProductCategory(p)===cat)?"":"none";
    });
  });
});

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

document.getElementById("shopNowBtn").addEventListener("click",function(){
  document.getElementById("shopAnchor").scrollIntoView({behavior:"smooth"});
});

${SHARED_JS}

updateCartUI();
<\/script>
</body>
</html>`;
}

// ── Build individual product page ─────────────────────────────
function buildProductPage(p, logoSrc, allProducts) {
  const id           = String(getField(p, 'id'));
  const title        = getField(p, 'title', 'Title', 'Product Name');
  const description  = getField(p, 'description');
  const details      = getField(p, 'details');
  const price        = parseFloat(getField(p, 'price', 'Price')) || 0;
  const withoutOffer = parseFloat(getField(p, 'without_offer')) || 0;
  const stock        = parseInt(getField(p, 'stocks', 'Stocks', 'stock')) || 0;
  const imgRaw       = getField(p, 'image link', 'Image Link', 'raw image');
  const addlRaw      = getField(p, 'additional_images');
  const videoRaw     = (getField(p, 'video_link') || '').trim();
  const status       = stockStatus(stock);
  const discount     = calcDiscount(price, withoutOffer);
  const category     = getProductCategory(p);
  const catLabel     = categoryLabel(category);

  const mainImg  = driveThumb(imgRaw, 800);
  const allImgs  = [mainImg, ...getAdditionalImgs(addlRaw).map(u => driveThumb(u, 800))].filter(Boolean);
  const canonical = `${STORE_URL}/product/${id}`;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": title,
    "description": description || `${title} — Anti-tarnish, water-resistant jewellery by Minella Jewels.`,
    "image": allImgs.length > 1 ? allImgs : (allImgs[0] || ''),
    "brand": { "@type": "Brand", "name": "Minella" },
    "sku": id,
    "mpn": `MJ-${id}`,
    "identifier_exists": "false",
    "offers": {
      "@type": "Offer",
      "url": canonical,
      "priceCurrency": "INR",
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
      { "@type": "ListItem", "position": 1, "name": "Home", "item": STORE_URL },
      { "@type": "ListItem", "position": 2, "name": catLabel, "item": `${STORE_URL}/?cat=${category}` },
      { "@type": "ListItem", "position": 3, "name": title, "item": canonical }
    ]
  };

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

  const relatedProducts = allProducts
    .filter(rp => String(getField(rp,'id')) !== id && getProductCategory(rp) === category)
    .slice(0, 8);
  const relatedBaked = JSON.stringify(relatedProducts.map(rp => ({
    id: String(getField(rp,'id')),
    title: getField(rp,'title','Title','Product Name'),
    price: parseFloat(getField(rp,'price','Price')) || 0,
    stock: parseInt(getField(rp,'stocks','Stocks','stock')) || 0,
    img: driveThumb(getField(rp,'image link','Image Link','raw image'), 400)
  })));

  const rvEntry = JSON.stringify({ id, title, price, img: driveThumb(imgRaw, 400) });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
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
<meta property="product:price:amount" content="${price.toFixed(2)}">
<meta property="product:price:currency" content="INR">
<script type="application/ld+json">${JSON.stringify(productJsonLd)}<\/script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}<\/script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
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
    <a href="/track" class="orders-fab">
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
      <button class="pp-arr prev" id="ppPrev" aria-label="Previous">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="pp-arr next" id="ppNext" aria-label="Next">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>` : ''}
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

    ${details ? `
    <div class="acc">
      <button class="acc-head open" data-acc="det">Product Details <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="acc-body open" id="acc-det">
        <ul class="acc-bullets">${details.split(',').map(d=>d.trim()).filter(Boolean).map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
      </div>
    </div>` : ''}

    ${description ? `
    <div class="acc">
      <button class="acc-head" data-acc="desc">Description <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="acc-body" id="acc-desc"><p>${esc(description)}</p></div>
    </div>` : ''}

    <div class="acc">
      <button class="acc-head" data-acc="ship">Shipping Policy <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="acc-body" id="acc-ship">
        <ul class="acc-bullets">
          <li>Shipped via <strong>Delhivery</strong> — reliable pan-India delivery</li>
          <li>Delivery in <strong>2–6 business days</strong> after dispatch</li>
          <li><strong>Free shipping</strong> on orders above &#8377;999</li>
          <li><strong>Cash on Delivery</strong> available across India</li>
          <li>You'll receive a tracking link via SMS/email once shipped</li>
        </ul>
      </div>
    </div>

    <div class="acc">
      <button class="acc-head" data-acc="why">Why Choose Us <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="acc-body" id="acc-why">
        <div class="acc-why">
          <div class="acc-why-item"><div class="acc-why-icon">&#128167;</div><div class="acc-why-text"><strong>100% Waterproof</strong><span>Wear it in rain, sweat or shower — no damage</span></div></div>
          <div class="acc-why-item"><div class="acc-why-icon">&#10024;</div><div class="acc-why-text"><strong>Anti-Tarnish</strong><span>Stays shiny for months — guaranteed</span></div></div>
          <div class="acc-why-item"><div class="acc-why-icon">&#129332;</div><div class="acc-why-text"><strong>Skin-Safe</strong><span>Nickel-free, hypoallergenic for all skin types</span></div></div>
          <div class="acc-why-item"><div class="acc-why-icon">&#128230;</div><div class="acc-why-text"><strong>Fast Delivery</strong><span>Dispatched within 24 hrs via Delhivery</span></div></div>
          <div class="acc-why-item"><div class="acc-why-icon">&#128260;</div><div class="acc-why-text"><strong>Easy Returns</strong><span>Hassle-free returns within 7 days</span></div></div>
          <div class="acc-why-item"><div class="acc-why-icon">&#128274;</div><div class="acc-why-text"><strong>Secure Payments</strong><span>PayU-powered — cards, UPI, COD accepted</span></div></div>
        </div>
      </div>
    </div>

    <div class="acc">
      <button class="acc-head" data-acc="care">Size &amp; Care <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="acc-body" id="acc-care">
        <ul class="acc-bullets">
          <li>Adjustable size fits everyone</li>
          <li>Avoid direct contact with perfume, lotion or chemicals</li>
        </ul>
      </div>
    </div>

    <div class="rv-section">
      <div class="rv-head">
        <div><div class="rv-title">Customer Reviews</div></div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div class="rv-avg">
            <div class="rv-avg-num" id="rvAvgNum">4.8</div>
            <div class="rv-stars-row">
              <div class="rv-stars" id="rvAvgStars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
              <div class="rv-count" id="rvCount">5 reviews</div>
            </div>
          </div>
          <button class="btn-write-rv" id="btnWriteRv">Write a Review</button>
        </div>
      </div>
      <div class="rv-list" id="rvList"></div>
    </div>
  </div>
</div>

<div class="ymal-section" id="ymalSection" style="max-width:980px;margin:0 auto;padding-left:16px;padding-right:16px">
  <div class="ymal-title">You May Also Like</div>
  <div class="ymal-strip" id="ymalStrip"></div>
</div>

<div class="rv-viewed-section" id="rvViewedSection" style="max-width:980px;margin:0 auto;padding-left:16px;padding-right:16px;display:none">
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
    <div class="rv-modal-title">
      Write a Review
      <button class="btn-close" id="rvModalClose">&#10005;</button>
    </div>
    <div class="rv-form-g"><label class="rv-form-label">Your Name</label><input class="rv-form-input" id="rv_name" placeholder="e.g. Priya S." autocomplete="name"></div>
    <div class="rv-form-g">
      <label class="rv-form-label">Rating</label>
      <div class="star-picker" id="starPicker">
        <span class="star-pick" data-val="1">&#9733;</span>
        <span class="star-pick" data-val="2">&#9733;</span>
        <span class="star-pick" data-val="3">&#9733;</span>
        <span class="star-pick" data-val="4">&#9733;</span>
        <span class="star-pick" data-val="5">&#9733;</span>
      </div>
    </div>
    <div class="rv-form-g"><label class="rv-form-label">Your Review</label><textarea class="rv-form-ta" id="rv_text" placeholder="Tell us what you think about this product…" rows="4"></textarea></div>
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

var addBtn=document.getElementById("addToBagBtn");
if(addBtn&&PSTOCK>0){addBtn.addEventListener("click",function(){addToCart(PTITLE,PPRICE,PSTOCK);});}
var stickyBtn=document.getElementById("stickyAtbBtn");
if(stickyBtn&&PSTOCK>0){stickyBtn.addEventListener("click",function(){addToCart(PTITLE,PPRICE,PSTOCK);});}

(function(){
  var sticky=document.getElementById("stickyAtb");
  var mainBtn=document.getElementById("addToBagBtn");
  if(!sticky||!mainBtn||window.innerWidth>640)return;
  var io=new IntersectionObserver(function(entries){sticky.classList.toggle("show",!entries[0].isIntersecting);},{threshold:0});
  io.observe(mainBtn);
})();

var ppTrack=document.getElementById("ppTrack");
var CSLIDE=0;
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

(function(){
  var stage=document.getElementById("stage");
  if(!stage)return;
  stage.addEventListener("mousemove",function(e){
    if(window.innerWidth<681)return;
    var rect=stage.getBoundingClientRect();
    var slide=ppTrack.children[CSLIDE];if(!slide)return;
    var img=slide.querySelector("img");if(!img)return;
    img.style.transformOrigin=((e.clientX-rect.left)/rect.width*100).toFixed(2)+"% "+((e.clientY-rect.top)/rect.height*100).toFixed(2)+"%";
    img.style.transform="scale(1.35)";stage.style.cursor="zoom-in";
  });
  stage.addEventListener("mouseleave",function(){
    var slide=ppTrack.children[CSLIDE];if(!slide)return;
    var img=slide.querySelector("img");
    if(img){img.style.transform="scale(1)";img.style.transformOrigin="center center";}
    stage.style.cursor="";
  });
})();

document.getElementById("shareBtn").addEventListener("click",function(){
  if(navigator.share){navigator.share({title:"${esc(title)} | Minella Jewels",url:window.location.href}).catch(function(){});}
  else{navigator.clipboard.writeText(window.location.href).then(function(){showToast("Link copied! \uD83D\uDD17");}).catch(function(){showToast("Link copied! \uD83D\uDD17");});}
});

document.querySelectorAll(".acc-head").forEach(function(btn){
  btn.addEventListener("click",function(){
    var key=this.getAttribute("data-acc"),body=document.getElementById("acc-"+key),isOpen=this.classList.contains("open");
    document.querySelectorAll(".acc-head").forEach(function(b){b.classList.remove("open");});
    document.querySelectorAll(".acc-body").forEach(function(b){b.classList.remove("open");});
    if(!isOpen){this.classList.add("open");if(body)body.classList.add("open");}
  });
});

var FAKE_REVIEWS=[
  {name:"Priya Krishnan",rating:5,text:"Absolutely love this piece! The finish is so premium and it hasn't tarnished even after a month of daily wear. Delivery was super fast too — received in 3 days!",date:"2026-03-15"},
  {name:"Ananya M.",rating:5,text:"Ordered for my sister's birthday and she was thrilled. The quality is way better than the price suggests. Definitely buying more from Minella.",date:"2026-03-08"},
  {name:"Kavya R.",rating:4,text:"Really nice jewellery. Wore it to a function and got so many compliments. The anti-tarnish coating actually works — tested it in rain!",date:"2026-02-28"},
  {name:"Deepika S.",rating:5,text:"Packaging was gorgeous and the piece looks exactly like the photos. COD option made it easy to try. Will order again for sure.",date:"2026-02-20"},
  {name:"Meenakshi V.",rating:4,text:"Good quality for the price. I was sceptical about anti-tarnish claims but it's been 3 weeks and still shiny. Shipping via Delhivery was prompt.",date:"2026-02-10"}
];
function starsHtml(n){var s="";for(var i=1;i<=5;i++)s+=i<=n?"&#9733;":"&#9734;";return s;}
function ratingText(n){var m={1:"1 star — Poor",2:"2 stars — Fair",3:"3 stars — Good",4:"4 stars — Great",5:"5 stars — Excellent"};return m[n]||n+" stars";}
function fmtDate(iso){try{var d=new Date(iso);return d.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});}catch(e){return iso;}}
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
  var params=new URLSearchParams({action:"getReviews",productId:PPID});
  fetch(SCRIPT_URL+"?"+params.toString()).then(function(r){return r.json();})
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
  fetch(SCRIPT_URL+"?"+new URLSearchParams({action:"submitReview",productId:PPID,name:name,rating:rvRating,ratingText:ratingText(rvRating),review:text,date:new Date().toISOString()}).toString())
    .catch(function(){}).finally(function(){
      document.getElementById("rvModalOverlay").classList.remove("open");
      document.getElementById("rv_name").value="";document.getElementById("rv_text").value="";
      rvRating=0;document.querySelectorAll(".star-pick").forEach(function(s){s.classList.remove("lit");});
      btn.textContent="Submit Review";btn.disabled=false;showToast("Thanks for your review! &#10024;");
    });
});

(function(){
  var strip=document.getElementById("ymalStrip"),sec=document.getElementById("ymalSection"),el=document.getElementById("related-products");
  if(!el||!strip)return;
  var related=JSON.parse(el.textContent);
  if(!related.length){if(sec)sec.style.display="none";return;}
  related.forEach(function(rp){
    var isOut=(rp.stock<=0),card=document.createElement("div");
    card.className="product-card fade-in";
    var badgeHtml = isOut ? '<div class="stock-badge out">Out of Stock</div>' : '';
    card.innerHTML= badgeHtml + '<div class="img-wrap"><img src="'+esc(rp.img)+'" alt="'+esc(rp.title)+'" loading="lazy" class="loaded"></div>'
      +'<div class="card-body"><div class="card-title">'+esc(rp.title)+'</div><div class="price-row"><div class="price-single">&#8377;'+Number(rp.price).toLocaleString("en-IN")+'</div></div>'
      +'<div class="card-actions"><button class="btn-add ymal-atb"'+(isOut?" disabled":"")+'>'+(isOut?"Out of Stock":"Add to Bag")+'</button></div></div>';
    card.querySelector(".ymal-atb").addEventListener("click",function(e){e.stopPropagation();if(!isOut)addToCart(rp.title,rp.price,rp.stock);});
    card.addEventListener("click",function(){window.location.href="/product/"+rp.id;});
    strip.appendChild(card);
  });
})();

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

// ── Generate llms.txt (AI Markdown Mirror) ──────────────────────
function buildLlmsTxt(products) {
  let txt = `# Minella Jewels
> Delicate pieces for every story, built to last.

We offer premium anti-tarnish, water-resistant women's jewellery across India. Categories include Necklaces, Bracelets, Anklets, Earrings, and Rings.

## Main Links
- [Shop Home](${STORE_URL})
- [About Us](${STORE_URL}/about)
- [Contact](${STORE_URL}/contact)
- [Track Orders](${STORE_URL}/track)

## Active Products
`;
  products.forEach(p => {
    const title = getField(p, 'title', 'Title', 'Product Name');
    const price = parseFloat(getField(p, 'price', 'Price')) || 0;
    const stock = parseInt(getField(p, 'stocks', 'Stocks', 'stock')) || 0;
    const isOut = stockStatus(stock) === 'out';
    const id = getField(p, 'id');
    const statusTxt = isOut ? ' (Out of Stock)' : '';
    txt += `- [${title}](${STORE_URL}/product/${id}): ₹${price.toLocaleString('en-IN')}${statusTxt}\n`;
  });

  return txt;
}

// ── Generate humans.txt (SEO/Humans) ────────────────────────────
function buildHumansTxt() {
  return `/* TEAM */
Maker: Minella Jewels Team
Site: ${STORE_URL}

/* SITE */
Last update: ${new Date().toISOString().split('T')[0]}
Language: English
Doctype: HTML5
IDE: Visual Studio Code, bake.js Static Generator`;
}

// ── Generate sitemap.xml ──────────────────────────────────────
function buildSitemap(products) {
  const now = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: STORE_URL, priority: '1.0', changefreq: 'daily' },
    { loc: `${STORE_URL}/about`, priority: '0.5', changefreq: 'monthly' },
    { loc: `${STORE_URL}/contact`, priority: '0.5', changefreq: 'monthly' },
    { loc: `${STORE_URL}/track`, priority: '0.4', changefreq: 'monthly' },
    { loc: `${STORE_URL}/faqs`, priority: '0.5', changefreq: 'monthly' },
    { loc: `${STORE_URL}/ring-size-guide`, priority: '0.4', changefreq: 'monthly' },
    { loc: `${STORE_URL}/jewellery-care`, priority: '0.4', changefreq: 'monthly' },
    { loc: `${STORE_URL}/shipping-policy`, priority: '0.4', changefreq: 'yearly' },
    { loc: `${STORE_URL}/return-policy`, priority: '0.4', changefreq: 'yearly' },
    { loc: `${STORE_URL}/warranty-policy`, priority: '0.3', changefreq: 'yearly' },
    { loc: `${STORE_URL}/privacy-policy`, priority: '0.3', changefreq: 'yearly' },
    { loc: `${STORE_URL}/terms`, priority: '0.3', changefreq: 'yearly' },
    ...products.map(p => ({
      loc: `${STORE_URL}/product/${getField(p, 'id')}`,
      priority: '0.8',
      changefreq: 'weekly'
    }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

// ── Main ──────────────────────────────────────────────────────
(async () => {
  console.log('📦 Fetching sheet data...');
  const raw  = await fetchUrl(SHEET_URL);
  const json = JSON.parse(raw);
  const allRows = json.products;
  const products = allRows.filter(p => getField(p, 'id') && getField(p, 'title', 'Title', 'Product Name'));
  console.log(`✅ Got ${products.length} products`);

  console.log('\n📝 Building index.html...');
  fs.writeFileSync('index.html', buildIndexHtml(products));
  console.log('  ✅ index.html written');

  const logoP   = products.find(p => getField(p, 'logo_link'));
  const logoSrc = logoP ? driveThumb(getField(logoP, 'logo_link'), 200) : null;

  console.log('\n🏪 Generating product pages...');
  let created = 0;
  for (const p of products) {
    const id = getField(p, 'id');
    if (!id) continue;
    const dir = path.join('product', String(id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildProductPage(p, logoSrc, products));
    process.stdout.write(`  ✓ product/${id}/index.html\n`);
    created++;
  }
  console.log(`\n🎉 Done! ${created} product pages + index.html`);

  console.log('\n🗺️  Generating sitemap.xml, robots.txt, llms.txt, humans.txt...');
  fs.writeFileSync('sitemap.xml', buildSitemap(products));
  fs.writeFileSync('robots.txt', `User-agent: *\nAllow: /\nDisallow: /payment-result\nDisallow: /fail\nDisallow: /success.html\nDisallow: /success-handler.html\nDisallow: /success-done.html\n\nSitemap: ${STORE_URL}/sitemap.xml\n`);
  fs.writeFileSync('llms.txt', buildLlmsTxt(products));
  fs.writeFileSync('humans.txt', buildHumansTxt());
  console.log('  ✅ SEO and AI bot files generated successfully!');
})();
