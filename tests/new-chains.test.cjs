const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');

test('新チェーン（イエローサブマリン・ポポンデッタ・お宝あっとマーケット）の看板・チェーン分類を検証する', () => {
  const master = createLoader()('src/config/shopMaster.ts');

  // 1. 各チェーンの分類と看板の検証
  const testCases = [
    { name: 'イエローサブマリン 秋葉原本店★ミント', chain: 'yellowsubmarine', brand: 'yellowsubmarine' },
    { name: 'イエローサブマリン 新宿店', chain: 'yellowsubmarine', brand: 'yellowsubmarine' },
    { name: 'ポポンデッタ 秋葉原店', chain: 'popondetta', brand: 'popondetta' },
    { name: 'ポポンデッタ イオンモール幕張新都心店', chain: 'popondetta', brand: 'popondetta' },
    { name: 'お宝あっとマーケット 町田店', chain: 'otakara_market', brand: 'otakara_market' },
    { name: 'クイーンオフ 野田七光台店', chain: 'otakara_market', brand: 'otakara_market' },
  ];

  for (const tc of testCases) {
    const result = master.classifyShopByName(tc.name);
    assert.equal(result.chain, tc.chain);
    assert.ok(result.brands.includes(tc.brand), `Expected brands to include ${tc.brand} for ${tc.name}`);
    assert.ok(result.chains.includes(tc.chain), `Expected chains to include ${tc.chain} for ${tc.name}`);

    // 看板生成の検証
    const shop = { id: tc.name, name: tc.name, ...result };
    const plates = master.getShopActivePlates(shop, new Set([tc.chain]));
    assert.ok(plates.length > 0, `Expected active plate for ${tc.name}`);
    assert.equal(plates[0].chainId, tc.chain);
    assert.ok(plates[0].cls.includes(`plate-${tc.brand}`), `Expected class to include plate-${tc.brand}`);
  }

  // 2. CHAIN_GROUPS に全チェーンが含まれているか検証
  const chainIds = master.CHAIN_GROUPS.map((c) => c.id);
  assert.ok(chainIds.includes('yellowsubmarine'), 'yellowsubmarine must be in CHAIN_GROUPS');
  assert.ok(chainIds.includes('popondetta'), 'popondetta must be in CHAIN_GROUPS');
  assert.ok(chainIds.includes('otakara_market'), 'otakara_market must be in CHAIN_GROUPS');

  // 3. BRAND_PLATES 定義の検証
  for (const bid of ['yellowsubmarine', 'popondetta', 'otakara_market']) {
    const spec = master.BRAND_PLATES[bid];
    assert.ok(spec, `BRAND_PLATES must have ${bid}`);
    assert.equal(spec.chainId, bid);
  }
});

test('アニメ系および総合ゲーム・リユース系が系列ごとに個別チェーンとして分離されていることを検証する', () => {
  const master = createLoader()('src/config/shopMaster.ts');

  // 1. 各分離チェーンの個別判定テスト
  const testCases = [
    { name: 'アニメイト 秋葉原1号館', chain: 'animate', brand: 'animate' },
    { name: 'らしんばん 秋葉原店新館', chain: 'lashinbang', brand: 'lashinbang' },
    { name: 'メロンブックス 秋葉原店舗受取館', chain: 'melonbooks', brand: 'melonbooks' },
    { name: 'まんだらけ コンプレックス', chain: 'mandarake', brand: 'mandarake' },
    { name: 'ゲオ 北新宿店', chain: 'geo', brand: 'geo' },
    { name: 'ゲオモバイル アキバ店', chain: 'geo', brand: 'geo_mobile' },
    { name: '古本市場 西川口店', chain: 'furuichi', brand: 'furuichi' },
    { name: 'ふるいち イオンモール店', chain: 'furuichi', brand: 'furuiti' },
    { name: 'トレカパーク 柏東口店', chain: 'furuichi', brand: 'torekapark' },
    { name: 'お宝創庫 中村店', chain: 'otakarasouko', brand: 'otakarasouko' },
    { name: 'プレイズ 日本橋店', chain: 'otakarasouko', brand: 'preyz' },
    { name: 'おじゃま館 上新庄店', chain: 'otakarasouko', brand: 'ojamakan' },
    { name: '万代 仙台南店', chain: 'mandai', brand: 'mandai' },
    { name: '万代書店 川越店', chain: 'mandai', brand: 'mandaishoten' },
    { name: 'マンガ倉庫 八女店', chain: 'mangasouko', brand: 'mangasouko' },
  ];

  for (const tc of testCases) {
    const result = master.classifyShopByName(tc.name);
    assert.equal(result.chain, tc.chain, `Chain mismatch for ${tc.name}`);
    assert.ok(result.brands.includes(tc.brand), `Expected brand ${tc.brand} for ${tc.name}`);

    // 単独チェーンONでの看板描画検証
    const shop = { id: tc.name, name: tc.name, ...result };
    const plates = master.getShopActivePlates(shop, new Set([tc.chain]));
    assert.ok(plates.length > 0, `Plate not generated for ${tc.name}`);
    assert.equal(plates[0].chainId, tc.chain);
  }

  // 2. CHAIN_GROUPS のジャンル見出し検証
  const genres = new Set(master.CHAIN_GROUPS.map((c) => c.genre));
  assert.ok(genres.has('💻 PC・スマホ・デジタル系'));
  assert.ok(genres.has('🏠 総合リユース・ハードオフ系'));
  assert.ok(genres.has('🎮 ゲーム・エンタメ・大型リユース系'));
  assert.ok(genres.has('✨ アニメ・キャラクター・同人系'));
  assert.ok(genres.has('🎲 ホビー・模型・カード専門店系'));
  assert.ok(genres.has('🧵 手芸・ハンドメイド・クラフト系'));

  // 全23チェーンにジャンルが設定されていること
  assert.equal(master.CHAIN_GROUPS.length, 23);
  for (const c of master.CHAIN_GROUPS) {
    assert.ok(c.genre, `Chain ${c.id} must have a genre defined`);
  }
});
