// ============================================================
// bake/shared.js — shared constants, helpers, CSS loader
// ============================================================

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Constants ─────────────────────────────────────────────────
const STORE_URL  = 'https://minella.in';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxcWsMJFT2QTsP9chLWcn39PCjqYnxEuehJWalv2i6aRJM6duhHu1DGxnxErFHtathO/exec';
const SHEET_URL  = `${SCRIPT_URL}?action=getProducts`;

// ── CSS section loader ────────────────────────────────────────
// Reads assets/css/style.css once, splits by /* ── N. MARKER headers
const STYLE_PATH = path.join(__dirname, '..', 'assets', 'css', 'style.css');
const RAW_CSS    = fs.readFileSync(STYLE_PATH, 'utf8');

function cssSection(marker) {
  const start = RAW_CSS.indexOf(`/* ── ${marker}`);
  if (start === -1) throw new Error(`CSS section not found: "${marker}"`);
  const next = RAW_CSS.indexOf('/* ── ', start + 10);
  return next === -1 ? RAW_CSS.slice(start) : RAW_CSS.slice(start, next);
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

// ── Fetch + parse product sheet ───────────────────────────────
async function fetchProducts() {
  console.log('📦 Fetching sheet data...');
  const raw  = await fetchUrl(SHEET_URL);
  const json = JSON.parse(raw);
  const all  = json.products;
  const products = all.filter(p => getField(p, 'id') && getField(p, 'title', 'Title', 'Product Name'));
  console.log(`✅ Got ${products.length} products`);
  return products;
}

// ── Drive image helpers ───────────────────────────────────────
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

// ── Generic helpers ───────────────────────────────────────────
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
  if (/necklace|pendant|chain/i.test(t))   return 'necklace';
  if (/bracelet|bangle/i.test(t))          return 'bracelet';
  if (/anklet|payal/i.test(t))             return 'anklet';
  if (/\bring\b/i.test(t))                 return 'ring';
  return 'other';
}

function categoryLabel(cat) {
  const map = {
    earring: 'Earrings', necklace: 'Necklaces', bracelet: 'Bracelets',
    anklet: 'Anklets',  ring: 'Rings',          other: 'Jewellery'
  };
  return map[cat] || 'Jewellery';
}

// ── Exports ───────────────────────────────────────────────────
module.exports = {
  STORE_URL, SCRIPT_URL, SHEET_URL,
  ROOT_CSS, SHARED_CSS, INDEX_CSS, PRODUCT_CSS,
  fetchUrl, fetchProducts,
  extractDriveId, driveThumb, getAdditionalImgs,
  stockStatus, calcDiscount, esc, getField,
  getProductCategory, categoryLabel,
};
