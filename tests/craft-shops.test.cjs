const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');

test('手芸チェーンの看板・チェーン分類とサブジャンル定義を検証する', () => {
  const master = createLoader()('src/config/shopMaster.ts');

  // 1. チェーン分類と看板の検証
  const testCases = [
    { name: 'ユザワヤ 吉祥寺店', chain: 'craft_chain', brand: 'yuzawaya' },
    { name: 'クラフトハートトーカイ イトーヨーカドー店', chain: 'craft_chain', brand: 'tokai' },
    { name: 'オカダヤ 新宿本店', chain: 'craft_chain', brand: 'okadaya' },
    { name: 'パンドラハウス イオンモール店', chain: 'craft_chain', brand: 'pandorahouse' },
  ];

  for (const tc of testCases) {
    const result = master.classifyShopByName(tc.name);
    assert.equal(result.chain, tc.chain);
    assert.ok(result.brands.includes(tc.brand), `Expected brands to include ${tc.brand}`);
    assert.ok(result.chains.includes(tc.chain), `Expected chains to include ${tc.chain}`);
  }

  // 2. 手芸親カテゴリ craft とサブジャンル3区分の検証
  const craftCategory = master.CATEGORIES.find((c) => c.id === 'craft');
  assert.ok(craftCategory, 'craft category must exist');
  assert.deepEqual([...craftCategory.subCategories], [
    'sub_craft_fabric',
    'sub_craft_yarn',
    'sub_craft_parts',
  ]);

  // 3. サブジャンルマスターの親子関係検証
  for (const subId of craftCategory.subCategories) {
    const subInfo = master.SUB_CATEGORY_MAP[subId];
    assert.ok(subInfo, `Subcategory ${subId} must exist in SUB_CATEGORY_MAP`);
    assert.equal(subInfo.parentId, 'craft');
  }
});
