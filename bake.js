const https = require('https');
const fs = require('fs');

const SHEET_ID = '1XtAvGTcVo7sKxmpBKHgZTg77ubxijUY1zt4q6IKl0Dk';
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/Sheet1`;

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
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
  console.log('Fetching sheet data...');
  const raw = await fetchUrl(SHEET_URL);
  const products = JSON.parse(raw);
  console.log(`Got ${products.length} products`);

  // ── 1. Build JSON-LD structured data block ──
  const jsonLdProducts = products.map((p, i) => {
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
    "@graph": jsonLdProducts
  });

  const ldBlock = `<!-- BAKED-JSON-LD --><script type="application/ld+json">${structuredData}<\/script><!-- /BAKED-JSON-LD -->`;

  // ── 2. Build pre-rendered product cards ──
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

    cardsHtml += `<div class="product-card" id="product-${i + 1}">${badge}<div class="img-wrap"><img src="${esc(imgUrl)}" alt="${esc(title)}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.classList.add('loaded');this.style.opacity='0.15'"></div><div class="card-body"><div class="card-title">${esc(title)}</div><div class="card-price">&#8377;${price.toLocaleString('en-IN')}</div><div class="card-actions"><button class="btn-add" data-pid="${i + 1}"${isOut ? ' disabled' : ''}>${isOut ? 'Out of Stock' : 'Add to Bag'}</button><button class="btn-view" data-pid="${i + 1}">View</button></div></div></div>`;
  });

  // ── 3. Baked product data for JS runtime ──
  const bakedDataBlock = `<!-- BAKED-DATA --><script id="baked-products" type="application/json">${JSON.stringify(products)}<\/script><!-- /BAKED-DATA -->`;

  // ── 4. Read & patch index.html ──
  let html = fs.readFileSync('index.html', 'utf8');
  const originalLength = html.length;

  // JSON-LD: replace existing block or inject before </head>
  if (html.includes('<!-- BAKED-JSON-LD -->')) {
    html = html.replace(/<!-- BAKED-JSON-LD -->[\s\S]*?<!-- \/BAKED-JSON-LD -->/, ldBlock);
    console.log('✓ Replaced existing JSON-LD block');
  } else {
    html = html.replace('</head>', ldBlock + '</head>');
    console.log('✓ Injected JSON-LD block before </head>');
  }

  // Product grid: replace existing baked grid or inject into #productGrid
  const gridStart = '<!-- BAKED-GRID -->';
  const gridEnd = '<!-- /BAKED-GRID -->';
  const gridBlock = `${gridStart}${cardsHtml}${gridEnd}`;

  if (html.includes(gridStart)) {
    html = html.replace(/<!-- BAKED-GRID -->[\s\S]*?<!-- \/BAKED-GRID -->/, gridBlock);
    console.log('✓ Replaced existing product grid');
  } else {
    // Find the productGrid div and inject cards inside it
    // Works regardless of whether it has the loading text or is empty
    const gridDivPattern = /(<div[^>]+id="productGrid"[^>]*>)([\s\S]*?)(<\/div>)/;
    if (gridDivPattern.test(html)) {
      html = html.replace(gridDivPattern, `$1${gridBlock}$3`);
      console.log('✓ Injected product grid into #productGrid');
    } else {
      console.error('❌ Could not find #productGrid div! Check index.html structure.');
      process.exit(1);
    }
  }

  // Baked data script: replace existing or inject before </body>
  if (html.includes('<!-- BAKED-DATA -->')) {
    html = html.replace(/<!-- BAKED-DATA -->[\s\S]*?<!-- \/BAKED-DATA -->/, bakedDataBlock);
    console.log('✓ Replaced existing baked data block');
  } else {
    html = html.replace('</body>', bakedDataBlock + '</body>');
    console.log('✓ Injected baked data block before </body>');
  }

  fs.writeFileSync('index.html', html);
  console.log(`✅ Done! index.html grew by ${html.length - originalLength} bytes with ${products.length} products baked in.`);
})();
