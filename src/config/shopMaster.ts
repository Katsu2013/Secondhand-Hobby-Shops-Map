/**
 * @file src/config/shopMaster.ts
 * @description 全国中古＆ホビーショップ巡りマップのマスターデータ定義および距離・所要時間・看板プレート計算ロジック。
 *
 * 【なぜこのモジュールが必要か】
 * 各チェーンの公式ロゴ配色や取扱カテゴリ、移動手段ごとの速度モデル、および店名からの
 * 自動複合店判定ロジックを一元管理し、UIコンポーネントから純粋関数として呼び出せるようにするためです。
 */

import type {
  AreaPreset,
  BrandPlateId,
  BrandPlateSpec,
  CategoryId,
  CategoryInfo,
  ChainGroup,
  ChainId,
  Shop,
  ShopClassification,
  TravelEstimate,
  TravelModeId,
  TravelModeInfo,
} from '../types/shop';

/**
 * 店舗チェーン大分類（8グループ）のマスター配列。
 * オプション画面の店舗ON/OFFリストの描画順序および初期設定として使用します。
 */
export const CHAIN_GROUPS: readonly ChainGroup[] = [
  {
    id: 'hardoff',
    name: 'ハードオフ (HARD OFF)',
    shortName: 'ハードオフ',
    color: '#004098',
    bgLight: '#dbeafe',
    icon: '🔧',
    badgeText: 'HO',
    subBrands: ['ハードオフ'],
    defaultCategories: ['pc_junk', 'audio_inst', 'retro_game'],
    keywords: ['ハードオフ', 'HARD OFF', 'HARD・OFF', 'Hard Off'],
  },
  {
    id: 'hobbyoff',
    name: 'ホビーオフ (HOBBY OFF)',
    shortName: 'ホビーオフ',
    color: '#e50012',
    bgLight: '#fee2e2',
    icon: '🤖',
    badgeText: 'HB',
    subBrands: ['ホビーオフ'],
    defaultCategories: ['figure_hobby', 'tcg', 'retro_game'],
    keywords: ['ホビーオフ', 'HOBBY OFF', 'Hobby Off'],
  },
  {
    id: 'offhouse',
    name: 'オフハウス / モード / ガレージ / リカー',
    shortName: 'オフハウス他',
    color: '#007440',
    bgLight: '#d1fae5',
    icon: '🏠',
    badgeText: 'OH',
    subBrands: ['オフハウス', 'モードオフ', 'ガレージオフ', 'リカーオフ'],
    defaultCategories: ['pc_junk', 'figure_hobby'],
    keywords: [
      'オフハウス',
      'OFF HOUSE',
      'モードオフ',
      'MODE OFF',
      'ガレージオフ',
      'GARAGE OFF',
      'リカーオフ',
      'LIQUOR OFF',
    ],
  },
  {
    id: 'bookoff',
    name: 'ブックオフ (SUPER BAZAAR / PLUS含)',
    shortName: 'ブックオフ',
    color: '#003894',
    bgLight: '#fef9c3',
    icon: '📚',
    badgeText: 'BO',
    subBrands: ['ブックオフ', 'BOOKOFF SUPER BAZAAR', 'BOOKOFF PLUS'],
    defaultCategories: ['book_media', 'retro_game', 'tcg', 'figure_hobby'],
    keywords: ['ブックオフ', 'BOOKOFF', 'BOOK OFF', 'BookOff'],
  },
  {
    id: 'surugaya',
    name: '駿河屋 (SURUGAYA)',
    shortName: '駿河屋',
    color: '#1d2089',
    bgLight: '#e0e7ff',
    icon: '🏯',
    badgeText: '駿',
    subBrands: ['駿河屋'],
    defaultCategories: ['retro_game', 'figure_hobby', 'tcg', 'book_media', 'pc_junk'],
    keywords: ['駿河屋', 'SURUGAYA', 'Surugaya'],
  },
  {
    id: 'anime_shop',
    name: 'らしんばん / まんだらけ / メロン / アニメイト',
    shortName: 'アニメ・同人系',
    color: '#00b8ee',
    bgLight: '#e0f2fe',
    icon: '✨',
    badgeText: 'アニ',
    subBrands: ['らしんばん', 'まんだらけ', 'メロンブックス', 'アニメイト'],
    defaultCategories: ['figure_hobby', 'book_media', 'tcg', 'retro_game'],
    keywords: ['らしんばん', 'まんだらけ', 'MANDARAKE', 'メロンブックス', 'アニメイト', 'animate'],
  },
  {
    id: 'general_game',
    name: 'ゲオ / 古本市場 / お宝創庫 / 万代・マンガ倉庫',
    shortName: '総合・ゲーム系',
    color: '#192a59',
    bgLight: '#fef3c7',
    icon: '🎮',
    badgeText: '総',
    subBrands: ['ゲオ (GEO)', '古本市場・ふるいち', 'お宝創庫', '万代・マンガ倉庫'],
    defaultCategories: ['retro_game', 'tcg', 'figure_hobby', 'book_media', 'pc_junk'],
    keywords: ['ゲオ', 'GEO', '古本市場', 'ふるいち', 'お宝創庫', '万代', 'マンガ倉庫'],
  },
  {
    id: 'kanteidan',
    name: '鑑定団グループ (千葉・茨城・静岡・ガラクタ等)',
    shortName: '鑑定団',
    color: '#111111',
    bgLight: '#f1f5f9',
    icon: '💎',
    badgeText: '鑑',
    subBrands: [
      '千葉鑑定団',
      '茨城鑑定団',
      '水戸鑑定団',
      '静岡鑑定団',
      '富士鑑定団',
      '浜松鑑定団',
      '浜北鑑定団',
      '新清水鑑定団',
      '藤枝鑑定団',
      'ガラクタ鑑定団',
      '宇都宮鑑定団',
    ],
    defaultCategories: ['retro_game', 'figure_hobby', 'tcg', 'book_media', 'pc_junk', 'audio_inst'],
    keywords: ['鑑定団', '千葉鑑定団', '茨城鑑定団', '静岡鑑定団', 'ガラクタ鑑定団'],
  },
];

/**
 * チェーンIDをキーとして高速に `ChainGroup` 定義を引くための辞書マップ。
 * なぜ必要か：店舗リストやマーカー描画のループ内で毎回 `find()` を走らせるコストを省き O(1) で参照するため。
 */
export const CHAIN_MAP: Readonly<Record<ChainId, ChainGroup>> = Object.fromEntries(
  CHAIN_GROUPS.map((c) => [c.id, c])
) as Record<ChainId, ChainGroup>;

/**
 * 各社の公式ロゴ配色・タイポグラフィを忠実に再現した看板プレート定義マップ。
 *
 * 【ユーザー指定の厳密なブランドカラー仕様】
 * - ハードオフ (HARD・OFF): 青背景 `#004098` / 黄色文字・中点 `#fff000`
 * - オフハウス (OFF HOUSE): 緑背景 `#007440` / 白文字 `#ffffff`
 * - ホビーオフ (Hobby OFF): 赤背景 `#e50012` / 黄色文字 `#fff100`
 * - モードオフ (MODE OFF): 赤背景 `#e50012` / 白文字 `#ffffff`
 * - リカーオフ (Liquor OFF): ワインレッド背景 `#a72642` / 白文字 `#ffffff`
 * - ガレージオフ (Garage OFF): 青背景 `#004098` / 黄色文字 `#fff000`
 * - ブックオフ通常店 (BOOK・OFF): 黄色背景 `#fff000` / 青文字・中点 `#003894`
 * - ブックオフ スーパーバザー (BOOK・OFF SUPER BAZAAR): オレンジ背景 `#ee7a00` / 濃紺文字・中点 `#043459`（下部左に濃紺帯＋オレンジ文字 `SUPER`、右に濃紺文字 `BAZAAR`）
 * - ブックオフ プラス (BOOK・OFF PLUS+): オレンジ背景 `#ee7a00` / 濃紺文字・中点 `#043459`（下部に濃紺帯＋オレンジ文字 `PLUS+`）
 * - 駿河屋: 青背景 `#1d2089` / 白文字 `#ffffff`
 * - らしんばん: 水色背景 `#00b8ee` / 白文字 `#ffffff`
 * - まんだらけ: 白背景 `#ffffff` / 赤ロゴマーク `#fe0000` + 黒文字 `#000000`
 * - メロンブックス: 白背景 `#ffffff` / 緑文字 `#18bd67`
 * - アニメイト: 青背景 `#335eac` / 白文字 `#ffffff`（`i` のみ黄色 `#fcc900`）
 * - ゲオ: 黄色背景 `#fed600` / 濃紺幾何学ロゴ＆文字 `#192a59`
 * - 古本市場: 黄色背景 `#f6b020` / 赤文字 `#e50024`
 * - お宝創庫: 白背景 `#ffffff` / 黒文字 `#000000`
 * - 鑑定団: 黒背景 `#000000` / 白文字 `#ffffff`
 */
export const BRAND_PLATES: Readonly<Record<BrandPlateId, BrandPlateSpec>> = {
  hardoff: {
    chainId: 'hardoff',
    cls: 'plate-hardoff',
    html: `<span class="plate-dots-row"><i class="arch-dots">•••</i><i class="arch-dots">•••</i></span><span class="plate-main">HARD<i class="dot-yellow"></i>OFF</span>`,
  },
  bookoff: {
    chainId: 'bookoff',
    cls: 'plate-bookoff',
    html: `<span class="plate-dots-row"><i class="arch-dots">•••</i><i class="arch-dots">•••</i></span><span class="plate-main">BOOK<i class="dot-blue"></i>OFF</span>`,
  },
  bookoff_plus: {
    chainId: 'bookoff',
    cls: 'plate-bookoff-plus',
    html: `<span class="plate-main">BOOK<i class="dot-sb"></i>OFF</span><span class="plus-sub-bar">PLUS<sup>+</sup></span>`,
  },
  bookoff_sb: {
    chainId: 'bookoff',
    cls: 'plate-bookoff-sb',
    html: `<span class="plate-main">BOOK<i class="dot-sb"></i>OFF</span><span class="sb-sub-row"><em class="sb-super-box">SUPER</em><b class="sb-bazaar-txt">BAZAAR</b></span>`,
  },
  offhouse: {
    chainId: 'offhouse',
    cls: 'plate-offhouse',
    html: `<span class="plate-dots-row"><i class="arch-dots">•••</i><i class="arch-dots">•••</i></span><span class="plate-main">OFF HOUSE</span>`,
  },
  modeoff: {
    chainId: 'offhouse',
    cls: 'plate-modeoff',
    html: `<span class="plate-main">MODE OFF</span>`,
  },
  garageoff: {
    chainId: 'offhouse',
    cls: 'plate-garageoff',
    html: `<span class="plate-dots-row"><i class="arch-dots">•••</i><i class="arch-dots">•••</i></span><span class="plate-main">Garage OFF</span>`,
  },
  liquoroff: {
    chainId: 'offhouse',
    cls: 'plate-liquoroff',
    html: `<span class="plate-main">Liquor OFF</span>`,
  },
  hobbyoff: {
    chainId: 'hobbyoff',
    cls: 'plate-hobbyoff',
    html: `<span class="plate-dots-row"><i class="arch-dots">•••</i><i class="arch-dots">•••</i></span><span class="plate-main">Hobby OFF</span>`,
  },
  surugaya: {
    chainId: 'surugaya',
    cls: 'plate-surugaya',
    html: `<span class="plate-arch">SURUGAYA</span><span class="plate-main">駿 河 屋</span>`,
  },
  lashinbang: {
    chainId: 'anime_shop',
    cls: 'plate-lashinbang',
    html: `<span class="plate-arch">LASHINBANG</span><span class="plate-main">らしんばん</span>`,
  },
  mandarake: {
    chainId: 'anime_shop',
    cls: 'plate-mandarake',
    html: `<span class="plate-main"><i class="mandarake-mark">●</i>まんだらけ</span>`,
  },
  melonbooks: {
    chainId: 'anime_shop',
    cls: 'plate-melonbooks',
    html: `<span class="plate-arch-melon">MELONBOOKS</span><span class="plate-main">メロンブックス</span>`,
  },
  animate: {
    chainId: 'anime_shop',
    cls: 'plate-animate',
    html: `<span class="plate-main animate-logo">an<em class="animate-i">i</em>mate</span>`,
  },
  geo: {
    chainId: 'general_game',
    cls: 'plate-geo',
    html: `<span class="plate-main geo-logo"><svg class="geo-mark" viewBox="0 0 44 20" width="28" height="13"><path d="M10 2 L2 10 L10 18 L17 11 L13 7 L9 11 M22 2 L14 10 L22 18 L29 11 M20 12 L24 8 M34 2 L26 10 L34 18 L42 10 Z" fill="none" stroke="#192a59" stroke-width="3.2" stroke-linecap="square"/></svg><span>GEO</span></span>`,
  },
  furuichi: {
    chainId: 'general_game',
    cls: 'plate-furuichi',
    html: `<span class="plate-main">古本市場</span>`,
  },
  otakarasouko: {
    chainId: 'general_game',
    cls: 'plate-otakarasouko',
    html: `<span class="plate-main">お宝創庫</span>`,
  },
  mandai: {
    chainId: 'general_game',
    cls: 'plate-mandai',
    html: `<span class="plate-main">万 代</span>`,
  },
  mangasouko: {
    chainId: 'general_game',
    cls: 'plate-mangasouko',
    html: `<span class="plate-main">マンガ倉庫</span>`,
  },
  kanteidan: {
    chainId: 'kanteidan',
    cls: 'plate-kanteidan',
    html: `<span class="plate-main">鑑 定 団</span>`,
  },
};

/**
 * 取扱商品カテゴリ（6分類）のマスター定義配列。
 */
export const CATEGORIES: readonly CategoryInfo[] = [
  {
    id: 'retro_game',
    name: 'レトロゲーム・TVゲーム',
    shortName: 'ゲーム',
    icon: '🕹️',
    color: '#2563eb',
  },
  {
    id: 'figure_hobby',
    name: 'フィギュア・プラモデル・ホビー',
    shortName: 'フィギュア・ホビー',
    icon: '🤖',
    color: '#dc2626',
  },
  {
    id: 'tcg',
    name: 'トレーディングカード（トレカ）',
    shortName: 'トレカ',
    icon: '🃏',
    color: '#d97706',
  },
  {
    id: 'pc_junk',
    name: 'PCパーツ・ジャンク品・家電',
    shortName: 'PC・ジャンク・家電',
    icon: '💻',
    color: '#0284c7',
  },
  {
    id: 'audio_inst',
    name: 'オーディオ・楽器',
    shortName: 'オーディオ・楽器',
    icon: '🎸',
    color: '#7c3aed',
  },
  {
    id: 'book_media',
    name: '古本・CD・DVD・アニメグッズ',
    shortName: '古本・CD・グッズ',
    icon: '💿',
    color: '#059669',
  },
];

/**
 * カテゴリIDから `CategoryInfo` をO(1)で高速参照するための辞書マップ。
 */
export const CATEGORY_MAP: Readonly<Record<CategoryId, CategoryInfo>> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
) as Record<CategoryId, CategoryInfo>;

/**
 * アクセス手段（5種類）のマスター定義配列。
 * 道路迂回係数・平均速度・初期固定時間を持ち、画面内全店舗のリアルタイム概算時間算出に使われます。
 */
export const TRAVEL_MODES: readonly TravelModeInfo[] = [
  {
    id: 'DRIVING_TOLL',
    name: '車（有料道路優先）',
    shortName: '車(高速)',
    icon: '🚗💨',
    googleMode: 'DRIVING',
    avoidHighways: false,
    avoidTolls: false,
    detourFactor: 1.28,
    baseSpeedKmh: 36,
    highwaySpeedKmh: 68,
    startupMinutes: 3,
  },
  {
    id: 'DRIVING_NO_TOLL',
    name: '車（一般道優先）',
    shortName: '車(一般道)',
    icon: '🚗',
    googleMode: 'DRIVING',
    avoidHighways: true,
    avoidTolls: true,
    detourFactor: 1.32,
    baseSpeedKmh: 28,
    highwaySpeedKmh: 34,
    startupMinutes: 3,
  },
  {
    id: 'TRANSIT',
    name: '公共交通機関（電車・バス）',
    shortName: '電車・バス',
    icon: '🚃',
    googleMode: 'TRANSIT',
    avoidHighways: false,
    avoidTolls: false,
    detourFactor: 1.25,
    baseSpeedKmh: 26,
    highwaySpeedKmh: 45,
    startupMinutes: 10,
  },
  {
    id: 'BICYCLING',
    name: '自転車',
    shortName: '自転車',
    icon: '🚲',
    googleMode: 'BICYCLING',
    avoidHighways: true,
    avoidTolls: true,
    detourFactor: 1.22,
    baseSpeedKmh: 15,
    highwaySpeedKmh: 15,
    startupMinutes: 1,
  },
  {
    id: 'WALKING',
    name: '徒歩',
    shortName: '徒歩',
    icon: '🚶',
    googleMode: 'WALKING',
    avoidHighways: true,
    avoidTolls: true,
    detourFactor: 1.2,
    baseSpeedKmh: 4.5,
    highwaySpeedKmh: 4.5,
    startupMinutes: 0,
  },
];

/**
 * アクセス手段IDから `TravelModeInfo` をO(1)で参照するための辞書マップ。
 */
export const TRAVEL_MODE_MAP: Readonly<Record<TravelModeId, TravelModeInfo>> = Object.fromEntries(
  TRAVEL_MODES.map((m) => [m.id, m])
) as Record<TravelModeId, TravelModeInfo>;

/**
 * 全国の主要ショップ密集エリアへワンクリックで移動するためのプリセット座標配列。
 */
export const AREA_PRESETS: readonly AreaPreset[] = [
  { name: '千葉・蘇我/おゆみ野/稲毛/四街道', lat: 35.605, lng: 140.135, zoom: 12 },
  { name: '東京・秋葉原', lat: 35.6984, lng: 139.7731, zoom: 14 },
  { name: '東京・中野/池袋/新宿', lat: 35.706, lng: 139.685, zoom: 12 },
  { name: '東京・八王子/多摩(ハードオフ聖地)', lat: 35.645, lng: 139.395, zoom: 12 },
  { name: '埼玉・大宮/越谷', lat: 35.9063, lng: 139.624, zoom: 11 },
  { name: '神奈川・横浜/町田/厚木', lat: 35.48, lng: 139.55, zoom: 11 },
  { name: '静岡(駿河屋本店エリア)', lat: 34.9756, lng: 138.3827, zoom: 12 },
  { name: '新潟(ハードオフ本社エリア)', lat: 37.9026, lng: 139.0232, zoom: 12 },
  { name: '愛知・名古屋(大須)', lat: 35.1595, lng: 136.905, zoom: 13 },
  { name: '大阪・日本橋', lat: 34.6595, lng: 135.506, zoom: 13 },
  { name: '京都・神戸', lat: 34.9858, lng: 135.7588, zoom: 11 },
  { name: '北海道・札幌', lat: 43.0618, lng: 141.3545, zoom: 11 },
  { name: '宮城・仙台', lat: 38.2682, lng: 140.8694, zoom: 11 },
  { name: '広島・岡山', lat: 34.3853, lng: 132.4553, zoom: 11 },
  { name: '福岡・天神/博多', lat: 33.5902, lng: 130.4017, zoom: 11 },
];

/**
 * 2つの緯度・経度座標間の直線距離（大圏距離）をハーバーサイン公式（Haversine formula）で計算します。
 *
 * 【なぜこの処理が必要か】
 * 地図上の全店舗に対する概算移動距離・所要時間を瞬時に算出する際の基礎距離として、
 * 地球の曲率を考慮した正確な2点間距離（km）を求める必要があるためです。
 *
 * @param lat1 - 出発地点の緯度（度）
 * @param lng1 - 出発地点の経度（度）
 * @param lat2 - 目的地点の緯度（度）
 * @param lng2 - 目的地点の経度（度）
 * @returns 2点間の直線距離（キロメートル）
 */
export function calcStraightDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  /** 地球の平均半径（km） */
  const earthRadiusKm = 6371;
  /** 緯度差（ラジアン） */
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  /** 経度差（ラジアン） */
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  // ハーバーサイン公式により球面上の中心角の正弦二乗項を計算
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  /** 球面上の中心角（ラジアン） */
  const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * centralAngle;
}

/**
 * 分単位の数値を人間が読みやすい日本語の所要時間文字列にフォーマットします。
 *
 * @param mins - 所要時間（分）
 * @returns 60分未満なら `"25分"`、60分以上なら `"1時間15分"` 形式の文字列
 */
export function formatDurationMinutes(mins: number): string {
  // 1時間未満の場合はそのまま「○分」として返す
  if (mins < 60) {
    return `${mins}分`;
  }
  /** 時間部分の整数値 */
  const hours = Math.floor(mins / 60);
  /** 残りの分部分の整数値 */
  const remMinutes = mins % 60;
  return remMinutes > 0 ? `${hours}時間${remMinutes}分` : `${hours}時間`;
}

/**
 * 出発地と目的地の座標および選択されたアクセス手段から、推定移動距離と所要時間を計算します。
 *
 * 【なぜこの処理が必要か】
 * 地図をドラッグ・ズームした際、画面内の全店舗（最大数百件）のバルーン上および右リストに
 * 待ち時間ゼロで「どのくらいで行けるか」を表示するため、移動手段別の2段階速度モデル
 * （市街地低速区間＋幹線・高速区間）で現実的な所要時間を見積もります。
 *
 * @param originLat - 出発地の緯度
 * @param originLng - 出発地の経度
 * @param destLat - 目的店舗の緯度
 * @param destLng - 目的店舗の経度
 * @param modeId - 選択されているアクセス手段ID
 * @returns 推定距離・推定時間・表示用フォーマット済み文字列を含む `TravelEstimate` オブジェクト
 */
export function estimateTravelInfo(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  modeId: TravelModeId
): TravelEstimate {
  /** 選択された移動モードの定義パラメータ */
  const mode = TRAVEL_MODE_MAP[modeId] || TRAVEL_MODES[0];
  /** 直線距離（km） */
  const straightKm = calcStraightDistanceKm(originLat, originLng, destLat, destLng);
  /** 道路の迂回率を掛け合わせた推定実走行距離（km） */
  const estRoadKm = straightKm * mode.detourFactor;

  /** 算出される推定所要時間（分） */
  let minutes = 0;

  // 移動手段ごとに近距離区間と長距離区間を分けた速度モデルを適用する
  if (modeId === 'DRIVING_TOLL') {
    // 有料道路優先：最初の8kmは一般道（ICまでのアクセス）、それ以降は高速道路速度で計算
    const localKm = Math.min(estRoadKm, 8);
    const highwayKm = Math.max(0, estRoadKm - 8);
    minutes =
      mode.startupMinutes +
      (localKm / mode.baseSpeedKmh) * 60 +
      (highwayKm / mode.highwaySpeedKmh) * 60;
  } else if (modeId === 'DRIVING_NO_TOLL') {
    // 一般道優先：最初の12kmは市街地速度、それ以降は郊外バイパス速度で計算
    const cityKm = Math.min(estRoadKm, 12);
    const suburbKm = Math.max(0, estRoadKm - 12);
    minutes =
      mode.startupMinutes +
      (cityKm / mode.baseSpeedKmh) * 60 +
      (suburbKm / mode.highwaySpeedKmh) * 60;
  } else if (modeId === 'TRANSIT') {
    // 公共交通機関：1.2km未満は徒歩の方が早いため徒歩速度で計算し、それ以上は駅待ち＋乗車時間で計算
    if (estRoadKm < 1.2) {
      minutes = (estRoadKm / 4.5) * 60;
    } else {
      const nearKm = Math.min(estRoadKm, 10);
      const farKm = Math.max(0, estRoadKm - 10);
      minutes =
        mode.startupMinutes +
        (nearKm / mode.baseSpeedKmh) * 60 +
        (farKm / mode.highwaySpeedKmh) * 60;
    }
  } else {
    // 自転車・徒歩：一定速度＋初期準備時間で計算
    minutes = mode.startupMinutes + (estRoadKm / mode.baseSpeedKmh) * 60;
  }

  /** 最小1分に丸めた整数所要時間（分） */
  const roundedMinutes = Math.max(1, Math.round(minutes));

  return {
    straightKm,
    estRoadKm,
    estMinutes: roundedMinutes,
    formattedTime: formatDurationMinutes(roundedMinutes),
    formattedDist: estRoadKm < 10 ? `${estRoadKm.toFixed(1)}km` : `${Math.round(estRoadKm)}km`,
    isExact: false,
  };
}

/**
 * 店舗名称からチェーン大分類、個別ブランドプレート配列、サブブランド名、取扱カテゴリを自動推論します。
 *
 * 【なぜこの処理が必要か】
 * 「ハードオフ・オフハウス・ホビーオフ・ブックオフ ◯◯店」のような複合店舗や、
 * 外部スキャン（Places API / Overpass API）やユーザー手動追加で登録された店舗でも、
 * 適切なブランド看板の縦積みバルーンと取扱カテゴリを自動設定できるようにするためです。
 *
 * @param name - 判定対象の店舗名称文字列
 * @returns 推論されたチェーン・ブランドプレート・取扱カテゴリ情報
 */
export function classifyShopByName(name: string): ShopClassification {
  /** 全角英数字や半角カナの表記揺れを吸収するためNFKC正規化した店名 */
  const normalizedName = (name || '').normalize('NFKC');
  /** 検出されたチェーン大分類IDのリスト */
  const matchedChains: ChainId[] = [];
  /** 検出された看板プレートIDのリスト */
  const brands: BrandPlateId[] = [];
  /** 代表サブブランド名 */
  let subBrand = '';
  /** 推論された取扱カテゴリIDの集合 */
  const categories = new Set<CategoryId>();

  // 1. ハードオフの判定
  if (/ハードオフ|HARD\s*OFF|HARD・OFF/i.test(normalizedName)) {
    matchedChains.push('hardoff');
    brands.push('hardoff');
    subBrand = subBrand || 'ハードオフ';
    (['pc_junk', 'audio_inst', 'retro_game'] as const).forEach((c) => categories.add(c));
  }

  // 2. ブックオフ（SUPER BAZAAR / PLUS / 通常店）の判定
  if (/ブックオフ|BOOK\s*OFF|BOOKOFF/i.test(normalizedName)) {
    matchedChains.push('bookoff');
    if (/SUPER\s*BAZAAR|スーパーバザー/i.test(normalizedName)) {
      brands.push('bookoff_sb');
      subBrand = 'BOOKOFF SUPER BAZAAR';
      (
        ['book_media', 'retro_game', 'tcg', 'figure_hobby', 'pc_junk', 'audio_inst'] as const
      ).forEach((c) => categories.add(c));
    } else if (/PLUS|プラス/i.test(normalizedName)) {
      brands.push('bookoff_plus');
      subBrand = 'BOOKOFF PLUS';
      (['book_media', 'retro_game', 'tcg', 'figure_hobby', 'pc_junk'] as const).forEach((c) =>
        categories.add(c)
      );
    } else {
      brands.push('bookoff');
      subBrand = subBrand || 'ブックオフ';
      (['book_media', 'retro_game', 'tcg', 'figure_hobby'] as const).forEach((c) =>
        categories.add(c)
      );
    }
  }

  // 3. オフハウス・モードオフ・ガレージオフ・リカーオフの判定
  if (
    /オフハウス|OFF\s*HOUSE|モードオフ|MODE\s*OFF|ガレージオフ|GARAGE\s*OFF|リカーオフ|LIQUOR\s*OFF/i.test(
      normalizedName
    )
  ) {
    matchedChains.push('offhouse');
    if (/モードオフ|MODE\s*OFF/i.test(normalizedName)) {
      brands.push('modeoff');
      subBrand = subBrand || 'モードオフ';
    } else if (/ガレージオフ|GARAGE\s*OFF/i.test(normalizedName)) {
      brands.push('garageoff');
      subBrand = subBrand || 'ガレージオフ';
    } else if (/リカーオフ|LIQUOR\s*OFF/i.test(normalizedName)) {
      brands.push('liquoroff');
      subBrand = subBrand || 'リカーオフ';
    } else {
      brands.push('offhouse');
      subBrand = subBrand || 'オフハウス';
    }
    (['pc_junk', 'figure_hobby'] as const).forEach((c) => categories.add(c));
  }

  // 4. ホビーオフの判定
  if (/ホビーオフ|HOBBY\s*OFF/i.test(normalizedName)) {
    matchedChains.push('hobbyoff');
    brands.push('hobbyoff');
    subBrand = subBrand || 'ホビーオフ';
    (['figure_hobby', 'tcg', 'retro_game'] as const).forEach((c) => categories.add(c));
  }

  // 5. 駿河屋の判定
  if (/駿河屋|SURUGAYA/i.test(normalizedName)) {
    matchedChains.push('surugaya');
    brands.push('surugaya');
    subBrand = '駿河屋';
    (['retro_game', 'figure_hobby', 'tcg', 'book_media', 'pc_junk'] as const).forEach((c) =>
      categories.add(c)
    );
  }

  // 6. アニメ・同人系（らしんばん・まんだらけ・メロンブックス・アニメイト）の判定
  if (/らしんばん|まんだらけ|MANDARAKE|メロンブックス|アニメイト|animate/i.test(normalizedName)) {
    matchedChains.push('anime_shop');
    if (/らしんばん/.test(normalizedName)) {
      brands.push('lashinbang');
      subBrand = 'らしんばん';
      (['figure_hobby', 'book_media', 'tcg', 'retro_game'] as const).forEach((c) =>
        categories.add(c)
      );
    }
    if (/まんだらけ|MANDARAKE/i.test(normalizedName)) {
      brands.push('mandarake');
      subBrand = 'まんだらけ';
      (['figure_hobby', 'book_media', 'retro_game', 'tcg'] as const).forEach((c) =>
        categories.add(c)
      );
    }
    if (/メロンブックス/.test(normalizedName)) {
      brands.push('melonbooks');
      subBrand = 'メロンブックス';
      categories.add('book_media');
    }
    if (/アニメイト|animate/i.test(normalizedName)) {
      brands.push('animate');
      subBrand = 'アニメイト';
      (['book_media', 'figure_hobby', 'tcg'] as const).forEach((c) => categories.add(c));
    }
  }

  // 7. 総合・ゲーム系（ゲオ・古本市場・お宝創庫・万代・マンガ倉庫）の判定
  if (/ゲオ|GEO|古本市場|ふるいち|お宝創庫|万代|マンガ倉庫/i.test(normalizedName)) {
    matchedChains.push('general_game');
    if (/古本市場|ふるいち/.test(normalizedName)) {
      brands.push('furuichi');
      subBrand = '古本市場・ふるいち';
      (['retro_game', 'tcg', 'book_media', 'figure_hobby'] as const).forEach((c) =>
        categories.add(c)
      );
    } else if (/お宝創庫/.test(normalizedName)) {
      brands.push('otakarasouko');
      subBrand = 'お宝創庫';
      (['retro_game', 'figure_hobby', 'tcg', 'pc_junk', 'audio_inst'] as const).forEach((c) =>
        categories.add(c)
      );
    } else if (/マンガ倉庫/.test(normalizedName)) {
      brands.push('mangasouko');
      subBrand = 'マンガ倉庫';
      (
        ['retro_game', 'figure_hobby', 'tcg', 'book_media', 'pc_junk', 'audio_inst'] as const
      ).forEach((c) => categories.add(c));
    } else if (/万代/.test(normalizedName)) {
      brands.push('mandai');
      subBrand = '万代';
      (
        ['retro_game', 'figure_hobby', 'tcg', 'book_media', 'pc_junk', 'audio_inst'] as const
      ).forEach((c) => categories.add(c));
    } else {
      brands.push('geo');
      subBrand = 'ゲオ (GEO)';
      (['retro_game', 'book_media', 'pc_junk'] as const).forEach((c) => categories.add(c));
    }
  }

  // 8. 鑑定団の判定（千葉鑑定団・茨城鑑定団・静岡鑑定団など地域冠名を保持）
  if (/鑑定団/.test(normalizedName)) {
    matchedChains.push('kanteidan');
    brands.push('kanteidan');
    const kanteiMatch = normalizedName.match(/([一-龠ぁ-んァ-ヶー]{1,6}鑑定団)/);
    subBrand = kanteiMatch ? kanteiMatch[1] : '鑑定団';
    (['retro_game', 'figure_hobby', 'tcg', 'book_media', 'pc_junk', 'audio_inst'] as const).forEach(
      (c) => categories.add(c)
    );
  }

  // どのキーワードにも一致しなかった場合のフォールバック（デフォルトでハードオフ扱い）
  if (matchedChains.length === 0) {
    matchedChains.push('hardoff');
    brands.push('hardoff');
    subBrand = 'ハードオフ';
    (['pc_junk', 'retro_game'] as const).forEach((c) => categories.add(c));
  }

  /** 複合店において代表チェーンを決定するための優先順位配列 */
  const priorityOrder: ChainId[] = [
    'hardoff',
    'hobbyoff',
    'offhouse',
    'bookoff',
    'surugaya',
    'kanteidan',
    'anime_shop',
    'general_game',
  ];

  /** 優先順位に基づき決定されたメインチェーンID */
  const primaryChain = priorityOrder.find((p) => matchedChains.includes(p)) || matchedChains[0];

  return {
    chain: primaryChain,
    chains: Array.from(new Set(matchedChains)),
    brands: Array.from(new Set(brands)),
    subBrand,
    categories: Array.from(categories),
  };
}

/**
 * 鑑定団グループ店舗の名称またはサブブランド名から、黒背景・白文字の看板プレートに表示する
 * 地域冠名付きタイトル（例：`千葉鑑定団`、`茨城鑑定団`、`静岡鑑定団` 等）を抽出します。
 *
 * 【なぜこの処理が必要か】
 * 鑑定団グループは「千葉鑑定団」「茨城鑑定団」「静岡鑑定団」「富士鑑定団」「浜松鑑定団」「ガラクタ鑑定団」のように
 * 先頭に県名や地域名が付くのが特徴であるため、バルーン看板上でもその地域冠名を正確に表示するためです。
 *
 * @param shop - 対象の店舗オブジェクト
 * @returns 看板プレートに表示する文字列（地域冠名がない場合は `'鑑 定 団'`）
 */
export function extractKanteidanPlateTitle(shop: Shop): string {
  const source = `${shop.subBrand || ''} ${shop.name || ''}`.normalize('NFKC');
  const match = source.match(/([一-龠ぁ-んァ-ヶー]{1,6}鑑定団)/);
  if (match && match[1] !== '鑑定団') {
    return match[1];
  }
  return '鑑 定 団';
}

/**
 * 店舗オブジェクトと現在ONになっているチェーン集合から、吹き出しバルーン内に縦積み表示する看板プレート配列を返します。
 *
 * 【なぜこの処理が必要か】
 * 複合店舗（例：ハードオフ＋オフハウス＋ホビーオフ併設店）において、ユーザーがオプション画面で
 * 「オフハウス」をOFFにした場合はオフハウスの看板プレートだけを非表示にし、
 * ONになっているブランドの看板プレートだけを動的に縦積み表示するためです。
 *
 * @param shop - 描画対象の店舗データ
 * @param enabledChainsSet - 現在フィルタでONになっているチェーンIDのSet
 * @returns バルーン内に描画すべき `BrandPlateSpec` の配列
 */
export function getShopActivePlates(
  shop: Shop,
  enabledChainsSet?: ReadonlySet<ChainId>
): BrandPlateSpec[] {
  /** 店舗が持つブランドプレートID配列（未定義の場合は店名から自動推論して補完） */
  let brands = shop.brands;
  if (!Array.isArray(brands) || brands.length === 0) {
    const info = classifyShopByName(shop.name);
    brands = info.brands;
  }

  /** 有効なチェーンに該当する看板プレート定義の格納配列 */
  const activePlates: BrandPlateSpec[] = [];
  for (const brandId of brands) {
    const spec = BRAND_PLATES[brandId];
    // 看板定義が存在し、かつそのチェーンが現在ONになっている場合のみ追加する
    if (spec && (!enabledChainsSet || enabledChainsSet.has(spec.chainId))) {
      if (brandId === 'kanteidan') {
        const kanteiTitle = extractKanteidanPlateTitle(shop);
        activePlates.push({
          ...spec,
          html: `<span class="plate-main">${escapeHtml(kanteiTitle)}</span>`,
        });
      } else {
        activePlates.push(spec);
      }
    }
  }

  // 万一すべてフィルタで除外された場合でも空バルーンにならないよう代表チェーンの看板を1枚入れる
  if (activePlates.length === 0) {
    const fallbackSpec =
      BRAND_PLATES[shop.chain as unknown as BrandPlateId] || BRAND_PLATES.hardoff;
    activePlates.push(fallbackSpec);
  }

  return activePlates;
}

/**
 * HTML文字列内に埋め込むテキストの特殊文字をエスケープします。
 *
 * 【なぜこの処理が必要か】
 * Leafletの `divIcon` や Google Maps のカスタム `OverlayView` では、パフォーマンスと地図APIの仕様上
 * HTML文字列としてマーカーDOMを構築するため、店舗名等に特殊文字が含まれていてもXSSや表示崩れを防ぐためです。
 *
 * @param str - エスケープ対象の文字列
 * @returns HTMLエスケープ済みの安全な文字列
 */
export function escapeHtml(str: string | undefined | null): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 地図上の店舗バルーンマーカー（ハードオフ公式アプリ風の縦積み看板プレート＋所要時間ピルバッジ）のHTMLを生成します。
 *
 * @param shop - 描画対象の店舗オブジェクト
 * @param isSelected - 現在選択中（ルート表示中）の店舗かどうか
 * @param enabledChains - 現在ONになっているチェーンIDのSet
 * @param travelMode - 現在のアクセス手段ID
 * @param showPinTime - ピン上に所要時間バッジを表示するかどうかのフラグ
 * @returns バルーンマーカーのHTML文字列
 */
export function buildShopBalloonHtml(
  shop: Shop,
  isSelected: boolean,
  enabledChains: ReadonlySet<ChainId>,
  travelMode: TravelModeId,
  showPinTime: boolean
): string {
  /** この店舗で現在有効な看板プレートの配列 */
  const plates = getShopActivePlates(shop, enabledChains);
  /** 現在の移動手段アイコン */
  const modeIcon = TRAVEL_MODE_MAP[travelMode]?.icon || '🚗';

  /** バルーン上部に表示する所要時間ピルバッジのHTML（非表示設定時は空文字） */
  const timePillHtml = showPinTime
    ? `<div class="balloon-time-pill ${shop._travel?.isExact ? 'exact' : ''}">
        <span>${modeIcon}</span>
        <span>${shop._travel?.isExact ? '✓' : '約'}${shop._travel?.formattedTime || '--分'}</span>
       </div>`
    : '';

  /** バルーン内部に縦積みする各ブランド看板プレートのHTML */
  const platesHtml = plates
    .map((p) => `<div class="brand-plate ${p.cls}">${p.html}</div>`)
    .join('');

  return `
    <div class="shop-balloon-wrapper ${isSelected ? 'selected' : ''}" title="${escapeHtml(shop.name)}">
      ${timePillHtml}
      <div class="shop-balloon-box">
        ${platesHtml}
      </div>
      <div class="shop-balloon-tail"></div>
    </div>
  `;
}
