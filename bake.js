// ============================================================
// bake.js — Minella Jewels static site generator
// Run: node bake.js
// ============================================================

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const STORE_URL  = 'https://minella.in';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxcWsMJFT2QTsP9chLWcn39PCjqYnxEuehJWalv2i6aRJM6duhHu1DGxnxErFHtathO/exec';
const SHEET_URL  = `${SCRIPT_URL}?action=getProducts`;

// ── Load and split style.css into sections ────────────────────
const RAW_CSS = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

function cssSection(marker) {
  const start = RAW_CSS.indexOf(`/* ── ${marker}`);
  if (start === -1) throw new Error(`CSS section not found: ${marker}`);
  const nextSection = RAW_CSS.indexOf('/* ── ', start + 10);
  return nextSection === -1 ? RAW_CSS.slice(start) : RAW_CSS.slice(start, nextSection);
}

const ROOT_CSS    = cssSection('1. ROOT');
const SHARED_CSS  = cssSection('2. SHARED');
const INDEX_CSS   = cssSection('3. INDEX PAGE');
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
  return id ? `https://lh3.googleusercontent.com/d/$${id}=w${width}` : rawUrl.trim();
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

// ── Shared HTML fragments (Intact Logic) ──────────────────────
const CART_HTML = `<div class="overlay" id="overlay"></div>
<div class="cart-drawer" id="cartDrawer">
  <div class="drawer-head"><h3>Your Bag</h3><button class="btn-close" id="cartCloseBtn">✕</button></div>
  <div class="cart-body" id="cartBody"><div class="cart-empty"><div class="cart-empty-icon">🛍</div><p>Your bag is empty</p></div></div>
  <div class="cart-foot" id="cartFoot" style="display:none">
    <div class="cart-cod-note">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Cash on Delivery available at checkout
    </div>
    <div class="cart-total-row"><span>Subtotal</span><span id="cartSubtotalEl">₹0</span></div>
    <button class="btn-checkout" id="checkoutBtn">Proceed to Checkout</button>
  </div>
</div>`;

const CHECKOUT_HTML = `<div class="overlay" id="coOverlay"></div>
<div class="co-modal" id="coModal">
  <div class="co-box">
    <div class="co-head"><h3>Checkout</h3><button class="btn-close" id="coCloseBtn">✕</button></div>
    <div class="stepper">
      <div class="step-item active" id="st1"><div class="step-circle" id="sc1">1</div><div class="step-label">Review</div></div>
      <div class="step-line" id="sl1"></div>
      <div class="step-item" id="st2"><div class="step-circle" id="sc2">2</div><div class="step-label">Delivery</div></div>
      <div class="step-line" id="sl2"></div>
      <div class="step-item" id="st3"><div class="step-circle" id="sc3">3</div><div class="step-label">Payment</div></div>
    </div>
    <div class="co-body" id="coBody">
      <div class="err-banner" id="errBanner">⚠️ <span id="errMsg"></span></div>
      <div class="co-section active" id="coSec1">
        <div class="co-sec-title">Order Summary</div>
        <div class="co-cod-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Cash on Delivery available — pay when your order arrives!
        </div>
        <div id="orderLines"></div>
        <div class="order-line sub-line"><span>Shipping</span><span id="shippingDisplay">Calculated in next step</span></div>
        <div class="order-line sub-line" id="codRow" style="display:none"><span>COD Charge</span><span id="codDisplay"></span></div>
        <div class="order-line total-line"><span>Grand Total</span><span id="grandTotal">—</span></div>
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
          <div class="pay-method-card" data-pay="upi"><div class="pay-method-icon">📲</div><div class="pay-method-label">UPI</div><div class="pay-method-sub">GPay, PhonePe, Paytm</div></div>
          <div class="pay-method-card" data-pay="card"><div class="pay-method-icon">💳</div><div class="pay-method-label">Credit / Debit Card</div><div class="pay-method-sub">Visa, Mastercard, RuPay</div></div>
          <div class="pay-method-card" data-pay="netbanking"><div class="pay-method-icon">🏦</div><div class="pay-method-label">Net Banking</div><div class="pay-method-sub">All major banks</div></div>
          <div class="pay-method-card" data-pay="wallet"><div class="pay-method-icon">👛</div><div class="pay-method-label">Wallets</div><div class="pay-method-sub">Paytm, Mobikwik, Airtel</div></div>
          <div class="pay-method-card" data-pay="emi"><div class="pay-method-icon">📅</div><div class="pay-method-label">EMI</div><div class="pay-method-sub">Credit card EMI</div></div>
        </div>
        <div class="pay-divider">or</div>
        <div class="cod-card" id="codCard" data-pay="cod"><div class="cod-card-icon">💵</div><div class="cod-card-text"><div class="cod-card-label">Cash on Delivery</div><div class="cod-card-sub">Pay when your order arrives — no upfront payment needed</div></div></div>
        <div class="err-banner" id="payErr">⚠️ Please select a payment method</div>
        <div class="confirm-box" id="confirmBox" style="display:none"><div class="confirm-box-title">Order Summary</div><div id="confirmLines"></div><div class="confirm-total"><span>Grand Total</span><span id="confirmTotal"></span></div></div>
        <div style="font-size:12px;color:var(--color-text-muted);line-height:1.6;margin-top:8px" id="payNote"></div>
      </div>
    </div>
    <div class="co-foot">
      <button class="btn-back" id="btnBack" style="display:none">← Back</button>
      <button class="btn-next" id="btnNext">Continue →</button>
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

// ── New Footer & FAB Templates ────────────────────────────────
const FOOTER_HTML = `
<footer class="footer">
  <div class="footer-container">
    <div class="footer-col brand-col">
      <h2 class="brand-text">Minella</h2>
      <p>Everyday elegance with anti-tarnish, water-resistant jewelry designed for the modern woman.</p>
      <div class="social-links">
        <a href="https://instagram.com/minellajewels">Instagram</a>
        <a href="#">Facebook</a>
      </div>
    </div>
    <div class="footer-col">
      <h4>Quick Links</h4>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/#shop-categories">Shop</a></li>
        <li><a href="/track.html">Track Order</a></li>
        <li><a href="/contact.html">Contact Us</a></li>
        <li><a href="/faqs.html">FAQs</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Important Links</h4>
      <ul>
        <li><a href="/privacy-policy.html">Privacy Policy</a></li>
        <li><a href="/return-policy.html">Refund & Return Policy</a></li>
        <li><a href="/shipping-policy.html">Shipping Policy</a></li>
        <li><a href="/terms.html">Terms of Service</a></li>
        <li><a href="/about.html">About Us</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Have Any Queries?</h4>
      <p>Business Name: MINELLA JEWELS</p>
      <p>Address: Coimbatore, TN</p>
      <p>Email: support@minella.in</p>
      <p>WhatsApp: +91 90800 14835 (Chat Only)</p>
    </div>
  </div>
  <div class="footer-bottom">
    <p>© 2026 Minella Jewels. All rights reserved. GST Included in all prices. Free Delivery above ₹499.</p>
  </div>
</footer>`;

const WA_BUTTON = `
<a href="https://wa.me/919080014835?text=Hi%20Minella!%20I%20need%20help%20with%20my%20order." target="_blank" rel="noopener" id="waBtn" class="whatsapp-fab" title="Chat with us!">
  <svg viewBox="0 0 24 24" fill="white" width="32" height="32"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
</a>`;

// ── Shared JS (Intact PayU Logic) ─────────────────────────────
const SHARED_JS = `
const SCRIPT_URL="${SCRIPT_URL}";
const STORE_URL="${STORE_URL}";
const CART_KEY="minella_cart_v1";
let cart={},selectedPay=null,shippingCost=null,currentStep=1;

function saveCart(){try{localStorage.setItem(CART_KEY,JSON.stringify(cart));}catch(e){}}
function loadCart(){try{var r=localStorage.getItem(CART_KEY);if(r){var p=JSON.parse(r);if(p&&typeof p==="object")cart=p;}}catch(e){cart={};}}
function clearCart(){cart={};saveCart();}
loadCart();

function esc(s){return String(s).replace(/&/g,"&").replace(/</g,"<").replace(/>/g,">").replace(/"/g,""").replace(/'/g,"'");}
function unesc(s){var d=document.createElement("div");d.innerHTML=s;return d.textContent;}
function showToast(msg){var t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(function(){t.classList.remove("show");},2400);}
function showSpinner(msg){document.getElementById("spinnerText").textContent=msg||"Processing\u2026";document.getElementById("spinner").classList.add("show");}
function hideSpinner(){document.getElementById("spinner").classList.remove("show");}
function showErr(msg){document.getElementById("errMsg").textContent=msg;document.getElementById("errBanner").classList.add("show");document.getElementById("coBody").scrollTo({top:0,behavior:"smooth"});}

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
function pulseCartFab(){var badge=document.getElementById("cartBadge");if(!badge)return;badge.classList.remove("pop");void badge.offsetWidth;badge.classList.add("pop");}

function updateCartUI(){
  var body=document.getElementById("cartBody"),foot=document.getElementById("cartFoot");
  var badge=document.getElementById("cartBadge"),count=cartCount();
  if (badge) { badge.textContent=count; badge.style.display = count > 0 ? 'flex' : 'none'; }
  if(!count){
    body.innerHTML='<div class="cart-empty"><div class="cart-empty-icon">🛍</div><p>Your bag is empty</p></div>';
    foot.style.display="none";return;
  }
  var html="";
  Object.keys(cart).forEach(function(title){
    var item=cart[title];
    html+='<div class="cart-item"><div class="cart-item-info"><div class="cart-item-name">'+esc(title)+'</div>'
      +'<div class="cart-item-sub">₹'+item.price.toLocaleString("en-IN")+' \xd7 '+item.qty+' = ₹'+(item.price*item.qty).toLocaleString("en-IN")+'</div></div>'
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
var cartFabBtn = document.getElementById("cartFabBtn");
if(cartFabBtn) cartFabBtn.addEventListener("click",openCart);
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
    html+='<div class="order-line"><span class="order-line-name">'+esc(title)+' \xd7 '+item.qty+'</span><span class="order-line-price">₹'+(item.price*item.qty).toLocaleString("en-IN")+'</span></div>';
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
  if(subtotal>=499){
    shippingCost=0;
    document.getElementById("shippingAmt").textContent="\u20b90 \u2014 FREE!";
    document.getElementById("shippingZone").textContent="Free shipping on orders above \u20b9499 \uD83C\uDF89";
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
          "areaServed": "IN"
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
    const id     = String(getField(p, 'id'));
    const title  = getField(p, 'title', 'Title', 'Product Name');
    const price  = parseFloat(getField(p, 'price', 'Price')) || 0;
    const wo     = parseFloat(getField(p, 'without_offer')) || 0;
    const stock  = parseInt(getField(p, 'stocks', 'Stocks', 'stock')) || 0;
    const img    = driveThumb(getField(p, 'image link', 'Image Link', 'raw image'), 400);
    const status = stockStatus(stock);
    const disc   = calcDiscount(price, wo);
    const isOut  = status === 'out';
    
    // Using New Card Badges
    const badgeHtml = isOut ? '<span class="badge" style="background:#333;">Out of Stock</span>' 
      : (status === 'limited' ? '<span class="badge">Few Left!</span>' : (disc ? `<span class="badge">${disc}% OFF</span>` : ''));
    const tarnishBadge = `<span class="badge badge-tarnish">Anti-Tarnish</span>`;
    
    const priceHtml = disc
      ? `<div class="card-price">₹${price.toLocaleString('en-IN')} <span class="card-mrp">₹${wo.toLocaleString('en-IN')}</span></div>`
      : `<div class="card-price">₹${price.toLocaleString('en-IN')}</div>`;

    // Preserving data-pid and btn-add for SHARED_JS compatibility!
    cardsHtml += `
      <div class="product-card fade-in" id="pc-${id}" data-pid="${id}">
        <a href="/product/${id}/index.html">
          <div class="card-img">
            ${badgeHtml}
            ${tarnishBadge}
            <img src="${esc(img)}" alt="${esc(title)}" loading="lazy">
          </div>
        </a>
        <div class="card-info">
          <h3 class="card-title">${esc(title)}</h3>
          ${priceHtml}
          <button class="btn btn-full btn-add" data-pid="${id}"${isOut ? ' disabled' : ''}>${isOut ? 'Out of Stock' : 'Add to Bag'}</button>
        </div>
      </div>
    `;
  });

  const bakedData = JSON.stringify(products);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/png" href="/favicon.png">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Minella Jewels — Everyday Elegance</title>
<meta name="description" content="Shop premium anti-tarnish, water-resistant jewellery. Cash on delivery across India.">
<script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>
<style>
${ROOT_CSS}
${SHARED_CSS}
</style>
<link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
<div class="spinner-overlay" id="spinner"><div class="spinner"></div><div class="spinner-text" id="spinnerText">Processing…</div></div>

<div class="announcement-bar">
  <!--<marquee scrollamount="5">✨ Free Delivery Above ₹499 | Anti-Tarnish Guarantee | Water Resistant | Skin Safe ✨</marquee>-->
  <marquee scrollamount="5">✨WEBSITE UNDER MAINTENANCE ✨</marquee>
</div>
<nav class="navbar has-shadow">
  <div class="nav-container">
    <div class="hamburger" onclick="document.body.classList.toggle('nav-open')">
      <span></span><span></span><span></span>
    </div>
    <a href="/" class="logo-link">
      <h2 class="brand-text">Minella</h2>
    </a>
    <ul class="nav-links">
      <li><a href="/">Home</a></li>
      <li><a href="#shop-categories">Shop</a></li>
      <li><a href="#best-sellers">Best Sellers</a></li>
      <li><a href="/about.html">About</a></li>
      <li><a href="/track.html">Track Order</a></li>
      <li><a href="/contact.html">Contact</a></li>
    </ul>
    <div class="nav-icons">
      <a href="/track.html" class="icon-link"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></a>
      <a href="#" id="cartFabBtn" class="icon-link cart-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
        <span class="cart-badge" id="cartBadge" style="display:none;">0</span>
      </a>
    </div>
  </div>
</nav>

<main>
  <section class="hero fade-in">
    <div class="hero-slide active" style="background-image: url('/assets/images/hero/hero-1.jpg')">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <h1>Feel Beautiful Every Day</h1>
        <p>18K Gold Plated • Anti-Tarnish • Skin Friendly</p>
        <a href="#shop-categories" class="btn">Shop Now &rarr;</a>
      </div>
    </div>
  </section>

  <section class="section fade-in" id="shop-categories">
    <h2 class="section-title">Shop By Category</h2>
    <div class="horizontal-scroll" id="shopAnchor">
      <div class="category-circle cat-btn active" data-cat="all" style="cursor:pointer;"><div class="category-img"><img src="/assets/images/categories/necklaces.jpg" alt="All"></div><h4>All</h4></div>
      <div class="category-circle cat-btn" data-cat="necklace" style="cursor:pointer;"><div class="category-img"><img src="/assets/images/categories/necklaces.jpg" alt="Necklaces"></div><h4>Necklaces</h4></div>
      <div class="category-circle cat-btn" data-cat="earring" style="cursor:pointer;"><div class="category-img"><img src="/assets/images/categories/earrings.jpg" alt="Earrings"></div><h4>Earrings</h4></div>
      <div class="category-circle cat-btn" data-cat="ring" style="cursor:pointer;"><div class="category-img"><img src="/assets/images/categories/rings.jpg" alt="Rings"></div><h4>Rings</h4></div>
      <div class="category-circle cat-btn" data-cat="bracelet" style="cursor:pointer;"><div class="category-img"><img src="/assets/images/categories/bracelets.jpg" alt="Bracelets"></div><h4>Bracelets</h4></div>
    </div>
  </section>

  <section class="section fade-in" id="best-sellers">
    <h2 class="section-title">Top Picks</h2>
    <div class="product-grid" id="productGrid">
      ${cardsHtml}
    </div>
  </section>

  <section class="section bg-rose fade-in text-center mt-2">
    <h2 class="section-title">Why Minella?</h2>
    <div class="horizontal-scroll" style="gap: 3rem; justify-content: center;">
      <div><div style="font-size:3rem">🛡️</div><h4>Anti-Tarnish</h4></div>
      <div><div style="font-size:3rem">💧</div><h4>Water Resistant</h4></div>
      <div><div style="font-size:3rem">🌸</div><h4>Skin Safe</h4></div>
      <div><div style="font-size:3rem">✨</div><h4>18K Gold Plated</h4></div>
    </div>
  </section>

  <section class="section fade-in">
    <div style="display:flex; gap: 4rem; align-items:center; flex-wrap:wrap;">
      <div style="flex:1; min-width:300px;"><img src="/assets/images/brand/story.jpg" style="border-radius:12px;" alt="Brand Story"></div>
      <div style="flex:1; min-width:300px;">
        <h2 class="section-title" style="text-align:left;">Minella Jewels — Everyday Elegance</h2>
        <p style="margin-bottom:1rem;">Originating from Coimbatore, Tamil Nadu, we believe that premium quality jewellery shouldn't break the bank.</p>
        <p>Our anti-tarnish, skin-safe collections are designed for the modern woman. Whether it's daily wear or a festive night out, you will always find your shine.</p>
        <a href="/about.html" class="btn btn-outline" style="margin-top:1.5rem;">Our Story &rarr;</a>
      </div>
    </div>
  </section>
</main>

${CART_HTML}
${CHECKOUT_HTML}
${PAYU_FORM}
${WA_BUTTON}

<div class="toast" id="toast"></div>

${FOOTER_HTML}

<script src="/assets/js/main.js"></script>
<script id="baked-products" type="application/json">${bakedData}<\/script>

<script>
var productMap = {};
(function(){
  var el = document.getElementById("baked-products");
  if (!el) return;
  JSON.parse(el.textContent).forEach(function(p){ productMap[String(p.id)] = p; });
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

document.querySelectorAll(".cat-btn").forEach(function(btn){
  btn.addEventListener("click",function(){
    document.querySelectorAll(".cat-btn").forEach(function(b){b.classList.remove("active");});
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
    e.preventDefault();
    var pid=String(addBtn.getAttribute("data-pid")),p=productMap[pid];
    if(p)addToCart((p.title||p.Title||"").trim(),parseFloat(p.price||p.Price)||0,parseInt(p.stocks||p.Stocks||p.stock)||0);
    return;
  }
});

${SHARED_JS}

updateCartUI();
<\/script>
</body>
</html>`;
}

// ── Build individual product page ─────────────────────────────
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

  const productJsonLd = { /* existing schema */ };
  const breadcrumbJsonLd = { /* existing schema */ };

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
    ? `<div class="pstock limited">⚠ Only ${stock} left!</div>`
    : `<div class="pstock ok">✓ In Stock</div>`;

  const priceHtml = discount
    ? `<span class="pp-price">₹${price.toLocaleString('en-IN')}</span><span class="pp-was">₹${withoutOffer.toLocaleString('en-IN')}</span><span class="pp-disc">${discount}% off</span>`
    : `<span class="pp-price">₹${price.toLocaleString('en-IN')}</span>`;

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
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)} | Minella Jewels</title>
<style>
${ROOT_CSS}
${SHARED_CSS}
${PRODUCT_CSS}
body{padding-top:calc(100px + var(--safe-top))}
.pp-track{display:flex;height:100%;transition:transform .38s cubic-bezier(.4,0,.2,1);width:${totalSlides*100}%}
</style>
<link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
<div class="spinner-overlay" id="spinner"><div class="spinner"></div><div class="spinner-text" id="spinnerText">Processing…</div></div>

<div class="announcement-bar" style="position:fixed;top:0;width:100%;z-index:1001;">
  <marquee scrollamount="5">✨ Free Delivery Above ₹499 | Anti-Tarnish Guarantee | Water Resistant | Skin Safe ✨</marquee>
</div>
<nav class="navbar has-shadow" style="position:fixed;top:34px;width:100%;z-index:1000;">
  <div class="nav-container">
    <div class="hamburger" onclick="document.body.classList.toggle('nav-open')">
      <span></span><span></span><span></span>
    </div>
    <a href="/" class="logo-link">
      <h2 class="brand-text">Minella</h2>
    </a>
    <ul class="nav-links">
      <li><a href="/">Home</a></li>
      <li><a href="/#shop-categories">Shop</a></li>
    </ul>
    <div class="nav-icons">
      <a href="#" id="cartFabBtn" class="icon-link cart-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
        <span class="cart-badge" id="cartBadge" style="display:none;">0</span>
      </a>
    </div>
  </div>
</nav>

<nav class="breadcrumb" aria-label="breadcrumb" style="margin-top:20px;">
  <a href="/">Home</a>
  <span class="breadcrumb-sep">›</span>
  <a href="/?cat=${esc(category)}">${esc(catLabel)}</a>
  <span class="breadcrumb-sep">›</span>
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
    <h1 class="pp-title">${esc(title)}</h1>
    <div class="pp-price-row">${priceHtml}</div>
    ${stockHtml}
    <div class="pp-trust" style="margin-top:1rem;">
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Anti-tarnish</span>
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Fast delivery</span>
    </div>

    <button class="btn btn-full btn-rose" style="margin-top:2rem;" id="addToBagBtn"${status === 'out' ? ' disabled' : ''}>${status === 'out' ? 'Out of Stock' : 'Add to Bag'}</button>

    ${description ? `
    <div class="acc" style="margin-top:2rem;">
      <button class="acc-head open" data-acc="desc">Description <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="acc-body open" id="acc-desc"><p>${esc(description)}</p></div>
    </div>` : ''}
  </div>
</div>

${FOOTER_HTML}
${CART_HTML}
${CHECKOUT_HTML}
${PAYU_FORM}
${WA_BUTTON}

<script src="/assets/js/main.js"></script>
<script>
${SHARED_JS}

var PPID="${esc(id)}",PTITLE="${esc(title).replace(/"/g,'\\"')}",PPRICE=${price},PSTOCK=${stock},TSLIDES=${totalSlides};

var addBtn=document.getElementById("addToBagBtn");
if(addBtn&&PSTOCK>0){addBtn.addEventListener("click",function(){addToCart(PTITLE,PPRICE,PSTOCK);});}

var ppTrack=document.getElementById("ppTrack");
var CSLIDE=0;
function ppGoTo(idx){
  if(TSLIDES<2)return;
  CSLIDE=((idx%TSLIDES)+TSLIDES)%TSLIDES;
  ppTrack.style.transform="translateX(-"+(CSLIDE*(100/TSLIDES))+"%)";
}
if(TSLIDES>1){
  document.getElementById("ppPrev").addEventListener("click",function(){ppGoTo(CSLIDE-1);});
  document.getElementById("ppNext").addEventListener("click",function(){ppGoTo(CSLIDE+1);});
}

updateCartUI();
<\/script>
</body>
</html>`;
}

// ── Generate sitemap.xml ──────────────────────────────────────
function buildSitemap(products) {
  const now = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: STORE_URL, priority: '1.0', changefreq: 'daily' },
    ...products.map(p => ({
      loc: `${STORE_URL}/product/${getField(p, 'id')}`,
      priority: '0.8',
      changefreq: 'weekly'
    }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
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
  const raw  = await fetchUrl(SHEET_URL);
  const json = JSON.parse(raw);
  const allRows = json.products;
  const products = allRows.filter(p => getField(p, 'id') && getField(p, 'title', 'Title', 'Product Name'));
  console.log(`✅ Got ${products.length} products`);

  console.log('\n📝 Building index.html...');
  fs.writeFileSync('index.html', buildIndexHtml(products));
  console.log('  ✅ index.html written');

  const logoP   = products.find(p => getField(p, 'logo_link'));
  const logoSrc = logoP ? driveThumb(getField(logoP, 'logo_link'), 200) : null;

  console.log('\n🏪 Generating product pages...');
  let created = 0;
  for (const p of products) {
    const id = getField(p, 'id');
    if (!id) continue;
    const dir = path.join('product', String(id));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildProductPage(p, logoSrc, products));
    process.stdout.write(`  ✓ product/${id}/index.html\n`);
    created++;
  }
  console.log(`\n🎉 Done! ${created} product pages + index.html`);

  fs.writeFileSync('sitemap.xml', buildSitemap(products));
  fs.writeFileSync('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${STORE_URL}/sitemap.xml\n`);
})();
