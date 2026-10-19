const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');

test('旧設定へ新規チェーンを一度だけ追加し、以後のOFF操作を保持する', () => {
  const values = new Map([['REUSE_MAP_USER_PREFS_V1', JSON.stringify({ enabledChains: ['bookoff'] })]]);
  const load = createLoader({ localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  const storage = load('src/services/storageService.ts');
  const prefs = storage.loadUserPreferencesFromStorage();
  assert.deepEqual([...prefs.enabledChains].sort(), [
    'bookoff',
    'craft_chain',
    'inverse',
    'iosys',
    'janpara',
    'otakara_market',
    'pc_koubou',
    'popondetta',
    'yellowsubmarine',
  ]);
  prefs.enabledChains = ['bookoff', 'janpara'];
  storage.saveUserPreferencesToStorage(prefs);
  assert.deepEqual([...storage.loadUserPreferencesFromStorage().enabledChains].sort(), ['bookoff', 'janpara']);
});

test('追加した専門店の看板とチェーンOFFを共有マスターへ反映する', () => {
  const master = createLoader()('src/config/shopMaster.ts');
  for (const [name, chain, brand] of [
    ['イオシス 中央店', 'iosys', 'iosys'], ['じゃんぱら 秋葉原本店', 'janpara', 'janpara'],
    ['パソコン工房 秋葉原本店', 'pc_koubou', 'pc_koubou'], ['パソコン工房 グッドウィル 大須店', 'pc_koubou', 'goodwill'],
    ['ショップインバース 秋葉原店', 'inverse', 'inverse'],
  ]) {
    const result = master.classifyShopByName(name);
    assert.equal(result.chain, chain);
    assert.ok(result.brands.includes(brand));
    assert.equal(result.subCategories.length, 0);
    const shop = { id: name, name, ...result };
    assert.match(master.getShopActivePlates(shop, new Set([chain]))[0].html, new RegExp(brand + '-display\\.svg'));
    const compound = { ...shop, brands: [...result.brands, 'bookoff'], chains: [chain, 'bookoff'] };
    const visible = master.getShopActivePlates(compound, new Set(['bookoff']));
    assert.equal(visible.length, 1);
    assert.match(visible[0].html, /bookoff-display\.svg/);
  }
});
