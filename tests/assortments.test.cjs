const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');
const master = createLoader()('src/config/shopMaster.ts');
const all = new Set(master.SUB_CATEGORIES.map(s => s.id));
const base = { id: 'a', name: 'ゲオモバイル A店', chain: 'general_game', categories: [], subCategories: [], assortmentStatus: 'unverified' };

test('未確認店は全選択ORに残し、特定商品の取扱店としては表示しない', () => {
  assert.equal(master.matchesShopCategories(base, all, 'OR'), true);
  assert.equal(master.matchesShopCategories(base, new Set(['sub_retro_game']), 'OR'), false);
});
test('ゲーム大分類からレトロと現行の両方を生成しない', () => {
  const shop = { ...base, categories: ['retro_game'] };
  assert.equal(master.getEffectiveShopSubCategories(shop).length, 0);
  assert.equal(master.matchesShopCategories(shop, new Set(['sub_retro_game']), 'OR'), false);
  assert.equal(master.matchesShopCategories(shop, new Set(['sub_retro_game','sub_modern_game']), 'OR'), true);
});
test('併設ブックオフをOFFにしたゲオモバイルへコミック分類を混入させない', () => {
  const shop = { ...base, assortmentStatus: 'confirmed', assortmentSources: [
    { name: 'ブックオフ', chain: 'bookoff', categories: ['book_media'], subCategories: ['sub_comic_book'] },
    { name: 'ゲオモバイル', chain: 'general_game', categories: ['pc_junk'], subCategories: ['sub_smartphone'] }
  ] };
  const scoped = master.scopeShopAssortment(shop, new Set(['general_game']));
  assert.equal(master.matchesShopCategories(scoped, new Set(['sub_comic_book']), 'OR'), false);
  assert.equal(master.matchesShopCategories(scoped, new Set(['sub_smartphone']), 'OR'), true);
  assert.equal(scoped.assortmentSources.length, 1);
});
test('ゲオモバイルの看板は通常ゲオと分け、店名だけでは商品を推定しない', () => {
  const result = master.classifyShopByName('ゲオモバイル A店');
  assert.ok(result.brands.includes('geo_mobile'));
  assert.equal(result.subCategories.length, 0);
  assert.match(master.BRAND_PLATES.geo_mobile.html, /geo_mobile-display\.svg/);
  assert.doesNotMatch(master.BRAND_PLATES.animate.html, /an<em/);
});


test('通常ゲオのモバイル部門だけの確認を常時案内し、専門店や全体確認と区別する', () => {
  const source = { name: 'ゲオA店', chain: 'general_game', url: 'https://geo-mobile.jp/store/00001.html' };
  const shop = { assortmentStatus: 'partial', brands: ['geo'], assortmentSources: [source] };
  assert.match(master.getGeoAssortmentNotice(shop), /モバイル部門のみ確認/);
  assert.equal(master.getGeoAssortmentNotice({ ...shop, assortmentSources: [{ ...source, name: 'ゲオモバイルA店' }] }), null);
  assert.equal(master.getGeoAssortmentNotice({ ...shop, assortmentStatus: 'user_edited' }), null);
  assert.equal(master.getGeoAssortmentNotice({ ...shop, assortmentSources: [source, { ...source, url: 'https://geo-online.co.jp/store/00001/' }] }), null);
  assert.match(master.getGeoAssortmentNotice({ ...shop, assortmentSources: [source, { ...source, name: 'ゲオB店', url: 'https://geo-online.co.jp/store/00002/' }] }), /モバイル部門のみ確認/);
});
