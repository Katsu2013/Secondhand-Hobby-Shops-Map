const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');

/** 店舗データの端末別上書き撤去を検証するための配布レコード。 */
const officialShop = { id: 'official_1', name: '公式店舗', chain: 'bookoff',
  lat: 35, lng: 139, address: '公式住所', hours: '10:00-20:00',
  categories: ['books'], subCategories: [], assortmentStatus: 'confirmed' };

test('旧編集・追加・削除を適用せず、保存値を消さずに配布DBを表示する', async () => {
  /** 過去に編集した端末でも、新しい公式情報へ戻ることを確認します。 */
  const saved = new Map([
    ['REUSE_MAP_EDITED_SHOPS_V1', JSON.stringify({ official_1: { name: '端末だけの店名', hours: '休業' } })],
    ['REUSE_MAP_DELETED_IDS_V1', JSON.stringify(['official_2'])],
    ['REUSE_MAP_CUSTOM_SHOPS_V1', JSON.stringify([{ ...officialShop, id: 'user_1', isCustom: true }])],
    ['REUSE_MAP_USER_PREFS_V1', '{"enabledChains":["bookoff"]}'],
    ['REUSE_MAP_GOOGLE_API_KEY', 'test-only-key'],
  ]);
  /** 店舗読込によるストレージの読取り・書換え自体を検出します。 */
  const before = [...saved];
  /** 例外がサービス内で捕捉されても、旧キーへのアクセスを見逃さない記録。 */
  const operations = [];
  const load = createLoader({
    localStorage: {
      getItem(key) { operations.push(['read', key]); return saved.get(key) ?? null; },
      setItem(key, value) { operations.push(['write', key]); saved.set(key, value); },
      removeItem(key) { operations.push(['remove', key]); saved.delete(key); },
    },
    fetch: async () => ({ ok: true, json: async () => [officialShop, { ...officialShop, id: 'official_2' }] }),
  });
  /** 削除指定した店も復帰し、端末追加店は混ざらないことを確認します。 */
  const shops = await load('src/services/storageService.ts').fetchShopsDatabase();
  assert.deepEqual(Array.from(shops, shop => shop.id), ['official_1', 'official_2']);
  assert.equal(shops[0].name, officialShop.name);
  assert.equal(shops[0].hours, officialShop.hours);
  assert.deepEqual(operations, []);
  assert.deepEqual([...saved], before);
});

test('配布DBの不正な店舗を除外し、有効な同一IDは先頭の1件を採用する', async () => {
  const load = createLoader({ fetch: async () => ({ ok: true, json: async () => [
    { ...officialShop, lat: 999 }, officialShop, { ...officialShop, name: '重複店舗' }, null,
  ] }) });
  const shops = await load('src/services/storageService.ts').fetchShopsDatabase();
  assert.equal(shops.length, 1);
  assert.equal(shops[0].name, officialShop.name);
});
