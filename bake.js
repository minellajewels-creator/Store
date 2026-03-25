const https = require('https');
const fs = require('fs');

const SHEET_ID = '1XtAvGTcVo7sKxmpBKHgZTg77ubxijUY1zt4q6IKl0Dk';
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/Sheet1`;

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractDriveId(url) {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^\/\?&]+)/) || url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}

function driveUrl(rawUrl, width = 600) {
  if (!rawUrl || !rawUrl.trim()) return '';
  const id = extractDriveId(rawUrl.trim());
  return id ? `https://lh3.googleusercontent.com/d/${id}=w${width}` : rawUrl.trim();
}

function stockStatus(stock) {
  const s = parseInt(stock) || 0;
  return s <= 0 ? 'out' : s <= 3 ? 'limited' : 'available';
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

(async () => {
  const raw = await fetch(SHEET_URL);
  const products = JSON.parse(raw);

  // Build JSON-LD structured data for Google (for Merchant Center)
  const jsonLd = products.map((p, i) => {
    const price = parseFloat(p.price || p.Price) || 0;
    const title = (p.title || p.Title || '').trim();
    const imgUrl = driveUrl(p['image link'] || p['Image Link'] || '', 600);
    const stock = parseInt(p.stocks || p.Stocks || p.stock) || 0;
    return {
      "@type": "Product",
      "name": title,
      "image": imgUrl,
      "offers": {
        "@type": "Offer",
        "price": price.toFixed(2),
        "priceCurrency": "INR",
        "availability": stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        "url": `https://minella.in/#product-${i + 1}`
      }
    };
  });

  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": jsonLd
  });

  // Build pre-rendered product card HTML (for Googlebot to see prices)
  let cardsHtml = '';
  products.forEach((p, i) => {
    const title = (p.title || p.Title || '').trim();
    const price = parseFloat(p.price || p.Price) || 0;
    const stock = parseInt(p.stocks || p.Stocks || p.stock) || 0;
    const status = stockStatus(stock);
    const imgUrl = driveUrl(p['image link'] || p['Image Link'] || '', 400);
    const isOut = status === 'out';

    const badge = status === 'out'
      ? '<div class="stock-badge out">Out of Stock</div>'
      : status === 'limited'
        ? `<div class="stock-badge limited">Only ${stock} left</div>`
        : '';

    cardsHtml += `<div class="product-card" id="product-${i + 1}">
      ${badge}
      <div class="img-wrap">
        <img src="${esc(imgUrl)}" alt="${esc(title)}" loading="lazy"
          onload="this.classList.add('loaded')"
          onerror="this.classList.add('loaded');this.style.opacity='0.15'">
      </div>
      <div class="card-body">
        <div class="card-title">${esc(title)}</div>
        <div class="card-price">₹${price.toLocaleString('en-IN')}</div>
        <div class="card-actions">
          <button class="btn-add" data-pid="${i + 1}"${isOut ? ' disabled' : ''}>${isOut ? 'Out of Stock' : 'Add to Bag'}</button>
          <button class="btn-view" data-pid="${i + 1}">View</button>
        </div>
      </div>
    </div>`;
  });

  // Embed product data as JSON for runtime JS (replaces the sheet fetch)
  const productDataScript = `<script id="baked-products" type="application/json">${JSON.stringify(products)}</script>`;

  // Read current index.html
  let html = fs.readFileSync('index.html', 'utf8');

  // 1. Replace/insert JSON-LD structured data in <head>
  const ldTag = `<script type="application/ld+json">${structuredData}</script>`;
  if (html.includes('<!-- BAKED-JSON-LD -->')) {
    html = html.replace(/<!-- BAKED-JSON-LD -->[\s\S]*?<!-- \/BAKED-JSON-LD -->/, `<!-- BAKED-JSON-LD -->\n${ldTag}\n<!-- /BAKED-JSON-LD -->`);
  } else {
    html = html.replace('</head>', `<!-- BAKED-JSON-LD -->\n${ldTag}\n<!-- /BAKED-JSON-LD -->\n</head>`);
  }

  // 2. Replace product grid content
  if (html.includes('<!-- BAKED-GRID -->')) {
    html = html.replace(/<!-- BAKED-GRID -->[\s\S]*?<!-- \/BAKED-GRID -->/, `<!-- BAKED-GRID -->\n${cardsHtml}\n<!-- /BAKED-GRID -->`);
  } else {
    html = html.replace(
      '<div class="grid" id="productGrid"><div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--muted)">Loading collection&#8230;</div></div>',
      `<div class="grid" id="productGrid"><!-- BAKED-GRID -->\n${cardsHtml}\n<!-- /BAKED-GRID --></div>`
    );
  }

  // 3. Inject baked product data for JS (so page doesn't need to fetch sheet)
  if (html.includes('<!-- BAKED-DATA -->')) {
    html = html.replace(/<!-- BAKED-DATA -->[\s\S]*?<!-- \/BAKED-DATA -->/, `<!-- BAKED-DATA -->\n${productDataScript}\n<!-- /BAKED-DATA -->`);
  } else {
    html = html.replace('</body>', `<!-- BAKED-DATA -->\n${productDataScript}\n<!-- /BAKED-DATA -->\n</body>`);
  }

  fs.writeFileSync('index.html', html);
  console.log(`✅ Baked ${products.length} products into index.html`);
})();
