// ============================================================
// bake/html-fragments.js — shared HTML template strings
// (CART, CHECKOUT, FOOTER, WA_BUTTON, PAYU_FORM, PVIEW_MODAL)
// ============================================================

'use strict';

const { STORE_URL, SCRIPT_URL } = require('./shared');

// ── Cart drawer ───────────────────────────────────────────────
const CART_HTML = `
<div class="overlay" id="overlay"></div>
<div class="cart-drawer" id="cartDrawer">
  <div class="drawer-head">
    <h3>Your Bag</h3>
    <button class="btn-close" id="cartCloseBtn">&#10005;</button>
  </div>
  <div class="cart-body" id="cartBody">
    <div class="cart-empty">
      <div class="cart-empty-icon">&#128717;</div>
      <p>Your bag is empty</p>
    </div>
  </div>
  <div class="cart-foot" id="cartFoot" style="display:none">
    <div class="cart-cod-note">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Cash on Delivery available at checkout
    </div>
    <div class="cart-total-row">
      <span>Subtotal</span>
      <span id="cartSubtotalEl">&#8377;0</span>
    </div>
    <button class="btn-checkout" id="checkoutBtn">Proceed to Checkout</button>
  </div>
</div>`;

// ── Checkout modal ────────────────────────────────────────────
const CHECKOUT_HTML = `
<div class="overlay" id="coOverlay"></div>
<div class="co-modal" id="coModal">
  <div class="co-box">
    <div class="co-head">
      <h3>Checkout</h3>
      <button class="btn-close" id="coCloseBtn">&#10005;</button>
    </div>
    <div class="stepper">
      <div class="step-item active" id="st1"><div class="step-circle" id="sc1">1</div><div class="step-label">Review</div></div>
      <div class="step-line" id="sl1"></div>
      <div class="step-item" id="st2"><div class="step-circle" id="sc2">2</div><div class="step-label">Delivery</div></div>
      <div class="step-line" id="sl2"></div>
      <div class="step-item" id="st3"><div class="step-circle" id="sc3">3</div><div class="step-label">Payment</div></div>
    </div>
    <div class="co-body" id="coBody">
      <div class="err-banner" id="errBanner">&#9888;&#65039; <span id="errMsg"></span></div>

      <!-- Step 1: Review -->
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

      <!-- Step 2: Delivery -->
      <div class="co-section" id="coSec2">
        <div class="co-sec-title">Delivery Details</div>
        <div class="form-g">
          <label class="form-label">Full Name <span class="req">*</span></label>
          <input class="form-input" id="f_name" placeholder="e.g. Priya Krishnan" autocomplete="name">
          <div class="field-err" id="e_name">Please enter your full name</div>
        </div>
        <div class="form-g">
          <label class="form-label">Mobile Number <span class="req">*</span></label>
          <input class="form-input" id="f_phone" placeholder="10-digit mobile" maxlength="10" type="tel" autocomplete="tel" inputmode="numeric">
          <div class="field-err" id="e_phone">Enter a valid 10-digit number</div>
        </div>
        <div class="form-g">
          <label class="form-label">Email <span class="req">*</span></label>
          <input class="form-input" id="f_email" placeholder="yourname@email.com" type="email" autocomplete="email">
          <div class="field-err" id="e_email">Enter a valid email address</div>
        </div>
        <div class="form-g">
          <label class="form-label">Address <span class="req">*</span></label>
          <input class="form-input" id="f_addr" placeholder="House/Flat no., Street, Area" autocomplete="street-address">
          <div class="field-err" id="e_addr">Please enter your address</div>
        </div>
        <div class="form-row">
          <div class="form-g">
            <label class="form-label">City</label>
            <input class="form-input" id="f_city" placeholder="City" autocomplete="address-level2">
          </div>
          <div class="form-g">
            <label class="form-label">State</label>
            <input class="form-input" id="f_state" placeholder="State" autocomplete="address-level1">
          </div>
        </div>
        <div class="form-g">
          <label class="form-label">Pincode <span class="req">*</span></label>
          <input class="form-input" id="f_pin" placeholder="6-digit pincode" maxlength="6" type="tel" inputmode="numeric" autocomplete="postal-code">
          <div class="field-err" id="e_pin">Enter a valid 6-digit pincode</div>
        </div>
        <div class="shipping-info" id="shippingBox">
          <div class="shipping-label">Estimated Shipping</div>
          <div class="shipping-amount" id="shippingAmt"></div>
          <div class="shipping-zone" id="shippingZone"></div>
        </div>
      </div>

      <!-- Step 3: Payment -->
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
        <div class="cod-card" id="codCard" data-pay="cod">
          <div class="cod-card-icon">&#128181;</div>
          <div class="cod-card-text">
            <div class="cod-card-label">Cash on Delivery</div>
            <div class="cod-card-sub">Pay when your order arrives — no upfront payment needed</div>
          </div>
        </div>
        <div class="err-banner" id="payErr">&#9888;&#65039; Please select a payment method</div>
        <div class="confirm-box" id="confirmBox" style="display:none">
          <div class="confirm-box-title">Order Summary</div>
          <div id="confirmLines"></div>
          <div class="confirm-total"><span>Grand Total</span><span id="confirmTotal"></span></div>
        </div>
        <div style="font-size:12px;color:var(--muted);line-height:1.6;margin-top:8px" id="payNote"></div>
      </div>
    </div>
    <div class="co-foot">
      <button class="btn-back" id="btnBack" style="display:none">&#8592; Back</button>
      <button class="btn-next" id="btnNext">Continue &#8594;</button>
    </div>
  </div>
</div>`;

// ── PayU hidden form ──────────────────────────────────────────
const PAYU_FORM = `
<form id="payuForm" method="POST">
  <input type="hidden" name="key"         id="pu_key">
  <input type="hidden" name="txnid"       id="pu_txnid">
  <input type="hidden" name="amount"      id="pu_amount">
  <input type="hidden" name="productinfo" id="pu_productinfo">
  <input type="hidden" name="firstname"   id="pu_firstname">
  <input type="hidden" name="email"       id="pu_email">
  <input type="hidden" name="phone"       id="pu_phone">
  <input type="hidden" name="surl"        id="pu_surl">
  <input type="hidden" name="furl"        id="pu_furl">
  <input type="hidden" name="hash"        id="pu_hash">
  <input type="hidden" name="udf1"        id="pu_udf1">
  <input type="hidden" name="udf2"        id="pu_udf2">
  <input type="hidden" name="udf3"        id="pu_udf3" value="">
  <input type="hidden" name="udf4"        id="pu_udf4" value="">
  <input type="hidden" name="udf5"        id="pu_udf5" value="">
</form>`;

// ── WhatsApp FAB ──────────────────────────────────────────────
const WA_BUTTON = `
<a href="https://wa.me/919080014835" target="_blank" rel="noopener" id="waBtn" aria-label="Chat on WhatsApp">
  <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
</a>`;

// ── Quick-view modal ──────────────────────────────────────────
const PVIEW_MODAL_HTML = `
<div class="overlay" id="pviewOverlay"></div>
<div class="pview-modal" id="pviewModal">
  <div class="pview-box">
    <div class="pview-imgs" id="pviewImgsEl">
      <button class="pview-close" id="pviewCloseBtn">&#10005;</button>
      <div class="pview-thumbs" id="pviewThumbs"></div>
    </div>
    <div class="pview-info">
      <div class="pview-title"  id="pviewTitle"></div>
      <div class="pview-price-row" id="pviewPriceRow"></div>
      <div class="pview-stock"  id="pviewStock"></div>
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

// ── Footer ────────────────────────────────────────────────────
const FOOTER_HTML = `
<footer class="site-footer">
  <div class="footer-container">
    <div class="footer-col brand-col">
      <h3>Minella Jewels</h3>
      <p>Everyday elegance with anti-tarnish, water-resistant jewelry designed for the modern woman.</p>
      <div class="social-links">
        <a href="https://instagram.com/minellajewels" target="_blank" rel="noopener">@minellajewels</a>
        <a href="mailto:minellajewels@gmail.com">minellajewels@gmail.com</a>
        <a href="https://wa.me/919080014835" target="_blank" rel="noopener">+91 90800 14835</a>
      </div>
    </div>
    <div class="footer-col">
      <h4>Quick Links</h4>
      <div class="col-links">
        <a href="/about.html">About Us</a>
        <a href="/contact.html">Contact Us</a>
        <a href="/track.html">Track Order</a>
        <a href="/faqs.html">FAQ's</a>
        <a href="/ring-size-guide.html">Ring Size Guide</a>
        <a href="/jewellery-care.html">Jewellery Care</a>
      </div>
    </div>
    <div class="footer-col">
      <h4>Company Policies</h4>
      <div class="col-links">
        <a href="/shipping-policy.html">Shipping &amp; Delivery</a>
        <a href="/return-policy.html">Refund &amp; Exchange</a>
        <a href="/warranty-policy.html">Warranty</a>
        <a href="/privacy-policy.html">Privacy Policy</a>
        <a href="/terms.html">Terms &amp; Conditions</a>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    &copy; 2026 Minella Jewels &middot; Made with &hearts; in Coimbatore
  </div>
</footer>`;

module.exports = {
  CART_HTML,
  CHECKOUT_HTML,
  PAYU_FORM,
  WA_BUTTON,
  PVIEW_MODAL_HTML,
  FOOTER_HTML,
};
