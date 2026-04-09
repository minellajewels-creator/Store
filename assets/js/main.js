// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  initAccordions();
  initAddToCart();
  checkFirstVisitPopup();
  initThumbnailSwap();
});

// Scroll Fade Animations using Intersection Observer
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// Product Accordions
function initAccordions() {
  const headers = document.querySelectorAll('.accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const parent = header.parentElement;
      parent.classList.toggle('active');
      const icon = header.querySelector('span');
      if (icon) {
        icon.innerText = parent.classList.contains('active') ? '-' : '+';
      }
    });
  });
}

// Cart Functionality
function initAddToCart() {
  const buttons = document.querySelectorAll('.add-to-cart');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-id');
      const title = btn.getAttribute('data-title');
      const price = parseFloat(btn.getAttribute('data-price'));
      const image = btn.getAttribute('data-image');
      
      addToCart({ id, title, price, image, qty: 1 });
      
      // Update UI feedback
      const originalText = btn.innerText;
      btn.innerText = 'Added!';
      setTimeout(() => btn.innerText = originalText, 2000);
    });
  });
}

function addToCart(product) {
  let cart = JSON.parse(localStorage.getItem('minella_cart') || '[]');
  const existing = cart.find(item => item.id === product.id);
  
  if (existing) {
    existing.qty += product.qty;
  } else {
    cart.push(product);
  }
  
  localStorage.setItem('minella_cart', JSON.stringify(cart));
  
  // Sync Badge
  if(window.minellaComponents) {
    window.minellaComponents.updateCartBadge();
  }
}

// Popup Logic
function checkFirstVisitPopup() {
  const popupSeen = localStorage.getItem('minella_popup_seen');
  const now = new Date().getTime();
  
  // Show if never seen or >7 days since last seen
  if (!popupSeen || (now - parseInt(popupSeen)) > 7 * 24 * 60 * 60 * 1000) {
    setTimeout(() => {
      // In a real app we would render a modal. Triggering mock via console
      console.log("Mock: Render First Visit Popup. Code: WELCOME30");
      // MOCK setting it immediately
      localStorage.setItem('minella_popup_seen', now.toString());
    }, 5000);
  }
}

function initThumbnailSwap() {
  const thumbs = document.querySelectorAll('.thumb');
  const mainImg = document.getElementById('main-product-img');
  
  thumbs.forEach(thumb => {
    thumb.addEventListener('click', () => {
      mainImg.src = thumb.src;
      thumbs.forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });
}
