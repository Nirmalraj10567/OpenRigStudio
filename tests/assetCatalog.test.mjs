import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/ui/assetCatalog';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { ASSET_CATALOG, catalogMatches } = compiled.exports;

test('asset catalog search and categories expose reusable studio asset families', () => {
  assert.ok(ASSET_CATALOG.some(item => item.categories.includes('characters')));
  assert.ok(ASSET_CATALOG.some(item => item.categories.includes('clothing')));
  assert.ok(ASSET_CATALOG.some(item => item.categories.includes('props')));
  const hoodies = ASSET_CATALOG.filter(item => catalogMatches(item, 'hoodie', 'all'));
  assert.ok(hoodies.some(item => item.id === 'shirt-hoodie-green'));
  assert.ok(hoodies.some(item => item.id === 'outfit-street'));
  assert.ok(ASSET_CATALOG.filter(item => catalogMatches(item, '', 'shoes')).length >= 2);
});
