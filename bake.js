// ============================================================
// bake.js — Minella Jewels master bake runner
//
// Usage:
//   node bake.js            → bakes everything (index + products)
//   node bake.js index      → index.html only
//   node bake.js products   → product pages + sitemap + llms.txt
//
// Individual bakers can also be run directly:
//   node bake/bake-index.js
//   node bake/bake-products.js
// ============================================================

'use strict';

const arg = process.argv[2];

async function main() {
  if (!arg || arg === 'index' || arg === 'all') {
    const { run } = require('./bake/bake-index');
    await run();
  }
  if (!arg || arg === 'products' || arg === 'all') {
    const { run } = require('./bake/bake-products');
    await run();
  }
  console.log('\n🎉 Bake complete!');
}

main().catch(e => { console.error(e); process.exit(1); });
