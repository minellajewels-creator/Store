// ============================================================
// bake/shared-js.js — browser-side cart + checkout + PayU JS
// Exported as a string, injected into every baked HTML page.
// ============================================================

'use strict';

const { SCRIPT_URL, STORE_URL } = require('./shared');

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

module.exports = { SHARED_JS };
