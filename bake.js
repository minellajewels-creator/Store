

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
