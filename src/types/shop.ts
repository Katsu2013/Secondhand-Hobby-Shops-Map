/**
 * @file src/types/shop.ts
 * @description 全国中古＆ホビーショップ巡りマップで使用するすべての型定義・インターフェース群。
 *
 * 【なぜこのファイルが必要か】
 * TypeScriptの厳格な型チェック（`strict: true`）を活用し、店舗データ・看板プレート設定・
 * 取扱カテゴリ・移動手段・ルート計算結果・ユーザー設定の構造をコンパイル時に保証するためです。
 * また、TypeDocによるAPI仕様書自動生成の基盤となります。
 */

/**
 * 店舗チェーン大分類の識別子型。
 * オプション画面の店舗ON/OFFフィルタで使用される8大グループを表します。
 */
export type ChainId =
  | 'hardoff'
  | 'hobbyoff'
  | 'offhouse'
  | 'bookoff'
  | 'surugaya'
  | 'anime_shop'
  | 'general_game'
  | 'kanteidan';

/**
 * バルーンマーカー内に表示する個別ブランド看板プレートの識別子型。
 * 1つのチェーン大分類（例: `offhouse` や `anime_shop`）の中に複数のブランド看板が存在するため、
 * `ChainId` とは別に詳細なプレート識別子を定義しています。
 */
export type BrandPlateId =
  | 'hardoff'
  | 'bookoff'
  | 'bookoff_plus'
  | 'bookoff_sb'
  | 'offhouse'
  | 'modeoff'
  | 'garageoff'
  | 'liquoroff'
  | 'hobbyoff'
  | 'surugaya'
  | 'lashinbang'
  | 'mandarake'
  | 'melonbooks'
  | 'animate'
  | 'geo'
  | 'furuichi'
  | 'otakarasouko'
  | 'mandai'
  | 'mangasouko'
  | 'kanteidan';

/**
 * 店舗が取り扱っている商品カテゴリの識別子型。
 * オプション画面のカテゴリON/OFFフィルタで使用されます。
 */
export type CategoryId =
  | 'retro_game'
  | 'figure_hobby'
  | 'tcg'
  | 'pc_junk'
  | 'audio_inst'
  | 'book_media';

/**
 * 出発地から店舗までのアクセス手段（移動モード）の識別子型。
 */
export type TravelModeId =
  | 'DRIVING_TOLL'
  | 'DRIVING_NO_TOLL'
  | 'TRANSIT'
  | 'BICYCLING'
  | 'WALKING';

/**
 * カテゴリフィルタの絞り込み条件モード型。
 * - `'OR'`: 選択したカテゴリのうち「どれか1つでも扱う」店舗を表示
 * - `'AND'`: 選択したカテゴリを「すべて扱う」大型店・複合店のみを表示
 */
export type CategoryMatchMode = 'OR' | 'AND';

/**
 * 右側リストパネルにおける店舗並び替え（ソート）順の識別子型。
 */
export type SortByMode = 'time_asc' | 'chain' | 'cat_count' | 'name';

/**
 * 地図描画エンジンの種類を表す型。
 * - `'google'`: 本家 Google Maps JavaScript API モード
 * - `'leaflet'`: APIキー不要で即座に動作する OpenStreetMap + Leaflet 内蔵モード
 */
export type MapEngineType = 'google' | 'leaflet';

/**
 * 店舗チェーン大分類のマスター定義インターフェース。
 * オプション画面の店舗ON/OFFチェックリストや店舗カードのバッジ配色に使用します。
 */
export interface ChainGroup {
  /** チェーン大分類の一意なID */
  id: ChainId;
  /** オプション画面に表示する正式名称 */
  name: string;
  /** 店舗カード等に表示する短縮名称 */
  shortName: string;
  /** ブランドを代表するメインカラー（16進数カラーコード） */
  color: string;
  /** バッジ背景等に使用する淡い背景色（16進数カラーコード） */
  bgLight: string;
  /** 視認性を高める絵文字アイコン */
  icon: string;
  /** バッジ用の1〜2文字テキスト */
  badgeText: string;
  /** このグループに含まれるサブブランド名称の配列 */
  subBrands: string[];
  /** このチェーンが標準で取り扱っているカテゴリの配列 */
  defaultCategories: CategoryId[];
  /** 店名から自動判定する際のキーワード配列 */
  keywords: string[];
}

/**
 * 地図上の吹き出しバルーン内に描画する各社公式ロゴ風看板プレートの仕様インターフェース。
 * ユーザー指定の配色（背景色・文字色・中点色・特定文字色など）を忠実に再現するために使用します。
 */
export interface BrandPlateSpec {
  /** この看板プレートが属するチェーン大分類ID（フィルタ連動用） */
  chainId: ChainId;
  /** CSSファイル（`style.css`）で定義されたプレート専用クラス名 */
  cls: string;
  /** 看板内部に描画するHTML文字列（アーチ文字や中点、SVGロゴ等を含む） */
  html: string;
}

/**
 * 取扱商品カテゴリのマスター定義インターフェース。
 */
export interface CategoryInfo {
  /** カテゴリの一意なID */
  id: CategoryId;
  /** オプション画面に表示するカテゴリ正式名称 */
  name: string;
  /** 店舗カード内のタグに表示する短縮名称 */
  shortName: string;
  /** カテゴリの絵文字アイコン */
  icon: string;
  /** カテゴリのテーマカラー（16進数カラーコード） */
  color: string;
}

/**
 * Google Maps Directions API に渡す移動手段文字列型。
 */
export type GoogleTravelModeString = 'DRIVING' | 'TRANSIT' | 'BICYCLING' | 'WALKING';

/**
 * アクセス手段（移動モード）のマスター定義および所要時間推計パラメータのインターフェース。
 *
 * 【なぜ推計パラメータが必要か】
 * 地図画面内に表示される数百件の店舗すべてに対して毎回ルート検索APIを呼び出すと、
 * API課金枠の枯渇やレート制限エラーが発生します。そのため、画面内の全店舗に対しては
 * 直線距離×迂回係数と平均速度モデルによるリアルタイム概算時間を常時表示し、
 * 店舗をクリックした際に実ルート検索APIで確定値に更新するハイブリッド設計としています。
 */
export interface TravelModeInfo {
  /** アクセス手段の一意なID */
  id: TravelModeId;
  /** オプション画面やルートカードに表示する名称 */
  name: string;
  /** ヘッダーのクイック切替ボタンに表示する短縮名称 */
  shortName: string;
  /** 移動手段の絵文字アイコン */
  icon: string;
  /** Google Maps Directions API に対応する移動モード名 */
  googleMode: GoogleTravelModeString;
  /** 高速道路を回避するかどうか（一般道優先モード時に `true`） */
  avoidHighways: boolean;
  /** 有料道路を回避するかどうか（一般道優先モード時に `true`） */
  avoidTolls: boolean;
  /** 直線距離から実道路距離を推計するための迂回係数（例: 1.28） */
  detourFactor: number;
  /** 近距離・一般道区間における平均移動速度（km/h） */
  baseSpeedKmh: number;
  /** 中長距離・高速道路または快速区間における平均移動速度（km/h） */
  highwaySpeedKmh: number;
  /** 乗車準備・駐車場入出庫・駅待ち等にかかる初期固定時間（分） */
  startupMinutes: number;
}

/**
 * 主要エリアへワンクリックでジャンプするためのプリセット座標定義インターフェース。
 */
export interface AreaPreset {
  /** エリアの表示名（例: 「千葉・蘇我/おゆみ野/稲毛/四街道」） */
  name: string;
  /** 中心の緯度（北緯） */
  lat: number;
  /** 中心の経度（東経） */
  lng: number;
  /** ジャンプ時の推奨ズームレベル */
  zoom: number;
}

/**
 * 店舗の閉店時間に対する「間に合う・間に合わない」判定ステータス型。
 * - `'open_ok'`: 閉店まで30分以上の余裕をもって到着でき「間に合う」状態
 * - `'closing_soon'`: 閉店前には到着できるが、閉店まで残り30分未満で「ギリギリ（閉店間際）」の状態
 * - `'closed_on_arrival'`: 到着予定時刻にはすでに営業終了しており「間に合わない（到着時閉店）」状態
 * - `'open_24h'`: 24時間営業のため常時「間に合う」状態
 * - `'before_open'`: 到着予定時刻が開店時刻より前（開店前到着）の状態
 * - `'unknown'`: 営業時間情報から時刻を抽出できず判定対象外の状態
 */
export type ClosingStatusType =
  | 'open_ok'
  | 'closing_soon'
  | 'closed_on_arrival'
  | 'open_24h'
  | 'before_open'
  | 'unknown';

/**
 * 出発時刻と移動所要時間から算出した、対象店舗の閉店時間に間に合うかどうかの判定結果インターフェース。
 *
 * 【なぜこの判定情報が必要か】
 * 中古＆ホビーショップは20:00閉店（ハードオフ等）から24:00閉店（お宝創庫・鑑定団等）まで店舗ごとに閉店時間が大きく異なります。
 * 移動所要時間だけでなく「今から（または指定時刻に）出発して閉店までに到着・買い物できるか」を
 * 地図ピンや店舗リスト上で即座に判別できるようにするためです。
 */
export interface ClosingStatusInfo {
  /** 閉店時間に対する到着判定ステータス */
  status: ClosingStatusType;
  /** 閉店までに到着可能かどうか（`closed_on_arrival` のみ `false`） */
  canMakeIt: boolean;
  /** 到着予定時刻の表示文字列（例: `"18:42着"`） */
  arrivalTimeText: string;
  /** 閉店時刻の表示文字列（例: `"20:00閉店"`, `"24:00閉店"`, `"24時間営業"`） */
  closingTimeText: string;
  /** 到着予定時刻から閉店時刻までの残り分数（24時間営業や不明時は `null`、閉店後到着時は負数） */
  remainingMinutes: number | null;
  /** 店舗リストやルートカードに表示する詳細判定ラベル（例: `"🟢 間に合う (18:42着 / 20:00閉店・残1時間18分)"`） */
  badgeLabel: string;
  /** 地図バルーン上のピルに表示する短縮判定ラベル（例: `"🟢間に合う"`, `"🟠残18分"`, `"🔴閉店後"`） */
  shortPinLabel: string;
}

/**
 * 出発地から各店舗への移動所要時間・距離・閉店判定の計算結果インターフェース。
 */
export interface TravelEstimate {
  /** 出発地からの直線距離（km） */
  straightKm?: number;
  /** 推定または実測の道路移動距離（km） */
  estRoadKm: number;
  /** 推定または実測の移動所要時間（分） */
  estMinutes: number;
  /** 画面表示用にフォーマットされた所要時間文字列（例: `"25分"`, `"1時間15分"`） */
  formattedTime: string;
  /** 画面表示用にフォーマットされた距離文字列（例: `"4.2km"`, `"18km"`） */
  formattedDist: string;
  /** ルート検索API（Google Directions / OSRM）による実測値かどうか */
  isExact: boolean;
  /** 出発時刻と所要時間から算出した閉店時間に対する間に合う・間に合わない判定情報 */
  closingInfo?: ClosingStatusInfo;
}

/**
 * 店舗データのインターフェース。
 * `public/data/shops.json` から読み込まれる全国店舗データおよびユーザー追加店舗の構造を表します。
 */
export interface Shop {
  /** 店舗の一意なID（例: `"official_surugaya_15"`, `"hardoff_10201"`） */
  id: string;
  /** 店舗名（複合店の場合は「ハードオフ・ホビーオフ・ブックオフ…」のように連結された名称） */
  name: string;
  /** 代表チェーンID */
  chain: ChainId;
  /** 併設されている全チェーンIDの配列（複合店フィルタリング用） */
  chains?: ChainId[];
  /** バルーン内に縦積み表示するブランド看板プレートIDの配列 */
  brands?: BrandPlateId[];
  /** サブブランド表示名（例: `"BOOKOFF SUPER BAZAAR"`, `"駿河屋"`） */
  subBrand?: string;
  /** 取り扱っている商品カテゴリIDの配列 */
  categories: CategoryId[];
  /** 店舗の緯度（国土地理院API等でジオコーディング済みの正確な北緯） */
  lat: number;
  /** 店舗の経度（国土地理院API等でジオコーディング済みの正確な東経） */
  lng: number;
  /** 店舗の所在地住所 */
  address?: string;
  /** 営業時間文字列 */
  hours?: string;
  /** ユーザーがブラウザ上で追加したカスタム店舗かどうか */
  isCustom?: boolean;
  /** 現在の出発地・移動手段に対する所要時間計算結果（実行時に動的に付与） */
  _travel?: TravelEstimate;
}

/**
 * 店名からの自動分類結果を表すインターフェース。
 */
export interface ShopClassification {
  /** 最優先されるメインチェーンID */
  chain: ChainId;
  /** 検出されたすべてのチェーンID配列 */
  chains: ChainId[];
  /** 検出されたすべての看板プレートID配列 */
  brands: BrandPlateId[];
  /** 検出されたサブブランド名 */
  subBrand: string;
  /** 推定される取扱カテゴリID配列 */
  categories: CategoryId[];
}

/**
 * 出発地点（現在地・駅・指定座標）の情報を保持するインターフェース。
 */
export interface OriginLocation {
  /** 出発地の緯度 */
  lat: number;
  /** 出発地の経度 */
  lng: number;
  /** 出発地の表示ラベル（例: `"東京・秋葉原駅周辺"`, `"現在地 (GPS)"`） */
  name: string;
}

/**
 * 地図の現在表示領域（バウンディングボックス）を表すインターフェース。
 */
export interface MapBounds {
  /** 北端の緯度 */
  north: number;
  /** 南端の緯度 */
  south: number;
  /** 東端の経度 */
  east: number;
  /** 西端の経度 */
  west: number;
}

/**
 * ルート案内カードに表示するアクティブな経路情報のインターフェース。
 */
export interface ActiveRouteInfo {
  /** ルートカード上部のバッジ文字列（例: `"🚗💨 車（有料道路優先）"`） */
  modeBadge: string;
  /** ルートタイトル（例: `"秋葉原駅 ➔ 駿河屋 千葉駅前店"`） */
  title: string;
  /** 所要時間表示テキスト */
  durationText: string;
  /** 距離表示テキスト */
  distanceText: string;
  /** ルート計算エンジンの状態表示（例: `"Google Directions 実測"`, `"実道路ルート計算済"`） */
  engineText: string;
  /** 本家Googleマップのナビ画面を別タブで開くためのURL */
  googleMapsNavUrl: string;
  /** 巡回（ハシゴ）ルート時の経由店舗リスト */
  waypoints: Shop[];
}

/**
 * ブラウザの `localStorage` に永続化するユーザー設定のインターフェース。
 */
export interface UserPreferences {
  /** 保存された出発地情報 */
  origin: OriginLocation;
  /** 選択中のアクセス手段ID */
  travelMode: TravelModeId;
  /** 所要時間上限フィルタ（分、150は無制限） */
  maxMinutes: number;
  /** 地図ピン上に所要時間バッジを常時表示するかどうか */
  showPinTime: boolean;
  /** 地図上に出発地からの15分/30分/60分到達目安サークルを表示するかどうか */
  showTimeCircles: boolean;
  /** ONになっているチェーンIDの配列 */
  enabledChains: ChainId[];
  /** ONになっている取扱カテゴリIDの配列 */
  enabledCategories: CategoryId[];
  /** カテゴリ絞り込みのOR/ANDモード */
  categoryMatchMode: CategoryMatchMode;
  /** 到着時に閉店している（間に合わない）店舗を地図・リストから除外するかどうか */
  hideClosedOnArrival?: boolean;
}
