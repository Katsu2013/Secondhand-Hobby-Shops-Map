/**
 * @file src/services/storageService.ts
 * @description 全国店舗データベース（`data/shops.json`）の取得および、ブラウザの `localStorage` を用いた
 * ユーザー設定・カスタム追加店舗・編集済み店舗・APIキーの永続化サービス。
 *
 * 【なぜこのサービス層が必要か】
 * UIコンポーネント（React）からストレージの読み書きやJSONマージ処理を分離することで、
 * データの整合性を保ち、将来バックエンドAPIやIndexedDBへ移行する際も変更箇所を局所化できるためです。
 */

import { CATEGORIES, CHAIN_GROUPS, TRAVEL_MODE_MAP } from '../config/shopMaster';
import type { CategoryId, ChainId, Shop, UserPreferences } from '../types/shop';

/**
 * `localStorage` で使用するキー文字列の定数オブジェクト。
 * 既存のプロトタイプ環境で保存されたデータとも完全な後方互換性を維持します。
 */
export const STORAGE_KEYS = {
  /** Google Maps JavaScript API キーの保存キー */
  API_KEY: 'REUSE_MAP_GOOGLE_API_KEY',
  /** ユーザーが追加またはエリアスキャンで発見した店舗配列の保存キー */
  CUSTOM_SHOPS: 'REUSE_MAP_CUSTOM_SHOPS_V1',
  /** 既存店舗に対するユーザー編集差分の保存キー */
  EDITED_SHOPS: 'REUSE_MAP_EDITED_SHOPS_V1',
  /** ユーザーが非表示（削除）にした店舗ID配列の保存キー */
  DELETED_IDS: 'REUSE_MAP_DELETED_IDS_V1',
  /** フィルタ・移動手段・出発地などのユーザー設定保存キー */
  USER_PREFS: 'REUSE_MAP_USER_PREFS_V1',
} as const;

/**
 * アプリケーション初回起動時（`localStorage` 未保存時）のデフォルトユーザー設定を生成します。
 *
 * @returns デフォルトの `UserPreferences` オブジェクト
 */
export function getDefaultUserPreferences(): UserPreferences {
  return {
    origin: {
      lat: 35.6984,
      lng: 139.7731,
      name: '東京・秋葉原駅周辺',
    },
    travelMode: 'DRIVING_TOLL',
    maxMinutes: 150,
    showPinTime: true,
    showTimeCircles: true,
    enabledChains: CHAIN_GROUPS.map((c) => c.id),
    enabledCategories: CATEGORIES.map((c) => c.id),
    categoryMatchMode: 'OR',
  };
}

/**
 * `localStorage` からユーザーのフィルタ・出発地・移動手段設定を読み込みます。
 *
 * 【なぜ例外処理とバリデーションを行うか】
 * ブラウザのプライベートモードや破損したJSONデータが保存されていた場合でも、
 * アプリがクラッシュせず安全にデフォルト設定で起動できるようにするためです。
 *
 * @returns 復元された `UserPreferences` オブジェクト
 */
export function loadUserPreferencesFromStorage(): UserPreferences {
  /** デフォルト設定をベースとして用意 */
  const defaults = getDefaultUserPreferences();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_PREFS);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw) as Partial<UserPreferences>;

    // 出発地座標の妥当性チェック
    if (
      parsed.origin &&
      typeof parsed.origin.lat === 'number' &&
      typeof parsed.origin.lng === 'number'
    ) {
      defaults.origin = {
        lat: parsed.origin.lat,
        lng: parsed.origin.lng,
        name: parsed.origin.name || '指定地点',
      };
    }

    // 移動手段の妥当性チェック
    if (parsed.travelMode && TRAVEL_MODE_MAP[parsed.travelMode]) {
      defaults.travelMode = parsed.travelMode;
    }

    // 所要時間上限の妥当性チェック
    if (typeof parsed.maxMinutes === 'number') {
      defaults.maxMinutes = parsed.maxMinutes;
    }

    // ピン上時間表示フラグの復元
    if (typeof parsed.showPinTime === 'boolean') {
      defaults.showPinTime = parsed.showPinTime;
    }

    // 到達圏サークル表示フラグの復元
    if (typeof parsed.showTimeCircles === 'boolean') {
      defaults.showTimeCircles = parsed.showTimeCircles;
    }

    // 有効チェーンリストの復元
    if (Array.isArray(parsed.enabledChains)) {
      defaults.enabledChains = parsed.enabledChains as ChainId[];
    }

    // 有効カテゴリリストの復元
    if (Array.isArray(parsed.enabledCategories)) {
      defaults.enabledCategories = parsed.enabledCategories as CategoryId[];
    }

    // カテゴリ一致モード（OR / AND）の復元
    if (parsed.categoryMatchMode === 'OR' || parsed.categoryMatchMode === 'AND') {
      defaults.categoryMatchMode = parsed.categoryMatchMode;
    }
  } catch (err) {
    console.warn('ユーザー設定の復元に失敗したため初期値を使用します:', err);
  }
  return defaults;
}

/**
 * ユーザーの現在の設定を `localStorage` に保存します。
 *
 * @param prefs - 保存する `UserPreferences` オブジェクト
 */
export function saveUserPreferencesToStorage(prefs: UserPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_PREFS, JSON.stringify(prefs));
  } catch (err) {
    console.warn('ユーザー設定の保存に失敗しました:', err);
  }
}

/**
 * URLクエリパラメータ（`?apiKey=...` または `?key=...`）、`localStorage`、
 * またはビルド時の環境変数（`VITE_GOOGLE_MAPS_API_KEY`）から Google Maps APIキーを取得します。
 *
 * 【なぜこの優先順位にするか】
 * 1. URLパラメータ指定があれば最優先で `localStorage` に記憶させることで、初回1回リンクを開くだけでキー設定を完了できるため。
 * 2. ソースコード（GitHubリポジトリ）上に生のAPIキーをハードコードせず、ローカルの `.env.local`（Git管理外）や
 *    ブラウザの `localStorage` から安全に読み込めるようにするため。
 *
 * @returns 取得されたAPIキー文字列（未設定時は空文字列 `""`）
 */
export function loadGoogleApiKey(): string {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const keyFromUrl = urlParams.get('apiKey') || urlParams.get('key');
    if (keyFromUrl && keyFromUrl.trim()) {
      const trimmed = keyFromUrl.trim();
      localStorage.setItem(STORAGE_KEYS.API_KEY, trimmed);
      return trimmed;
    }
    const storedKey = (localStorage.getItem(STORAGE_KEYS.API_KEY) || '').trim();
    if (storedKey) {
      return storedKey;
    }
    const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
    if (envKey) {
      return envKey;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Google Maps APIキーを `localStorage` に保存または削除します。
 *
 * @param apiKey - 保存するAPIキー（空文字列の場合は保存済みキーを削除）
 */
export function saveGoogleApiKey(apiKey: string): void {
  try {
    const trimmed = apiKey.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEYS.API_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEYS.API_KEY);
    }
  } catch (err) {
    console.warn('APIキーの保存に失敗しました:', err);
  }
}

/**
 * 全国店舗マスターJSON（`/data/shops.json`）を非同期で取得し、
 * `localStorage` に保存されているユーザー編集差分・追加店舗・削除IDをマージして返します。
 *
 * 【なぜマージ処理が必要か】
 * 静的配信される公式店舗マスターデータ（約2,043拠点）を汚さずに、ユーザー自身がブラウザ上で
 * 取扱カテゴリを微調整したり新規店舗を追加・削除した結果を永続的に反映させるためです。
 *
 * @returns マージ済みの全店舗データ配列のPromise
 */
export async function fetchAndMergeShopsDatabase(): Promise<Shop[]> {
  /** マスターJSONから読み込まれた基本店舗配列 */
  let baseShops: Shop[] = [];
  try {
    const response = await fetch(`data/shops.json?v=${Date.now()}`);
    if (response.ok) {
      baseShops = (await response.json()) as Shop[];
    }
  } catch (err) {
    console.warn('data/shops.json の読み込みに失敗しました:', err);
  }

  /** 削除済み店舗IDのSet */
  let deletedIds = new Set<string>();
  /** 編集された店舗の差分マップ */
  let editedMap: Record<string, Partial<Shop>> = {};
  /** カスタム追加された店舗の配列 */
  let customShops: Shop[] = [];

  try {
    deletedIds = new Set<string>(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.DELETED_IDS) || '[]') as string[]
    );
    editedMap = JSON.parse(localStorage.getItem(STORAGE_KEYS.EDITED_SHOPS) || '{}') as Record<
      string,
      Partial<Shop>
    >;
    customShops = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_SHOPS) || '[]') as Shop[];
  } catch (err) {
    console.warn('カスタム店舗データのパースに失敗しました:', err);
  }

  /** マージ後の店舗リスト */
  const merged: Shop[] = [];
  /** 重複登録を防ぐための登録済みID集合 */
  const seenIds = new Set<string>();

  // 1. 公式マスター店舗の取り込みと編集差分の上書き
  for (const shop of baseShops) {
    if (deletedIds.has(shop.id)) continue;
    const finalShop: Shop = editedMap[shop.id] ? { ...shop, ...editedMap[shop.id] } : { ...shop };
    if (!Array.isArray(finalShop.chains) || finalShop.chains.length === 0) {
      finalShop.chains = [finalShop.chain];
    }
    merged.push(finalShop);
    seenIds.add(finalShop.id);
  }

  // 2. ユーザーが追加・スキャン発見したカスタム店舗の取り込み
  for (const custom of customShops) {
    if (deletedIds.has(custom.id) || seenIds.has(custom.id)) continue;
    const finalShop: Shop = editedMap[custom.id]
      ? { ...custom, ...editedMap[custom.id] }
      : { ...custom };
    if (!Array.isArray(finalShop.chains) || finalShop.chains.length === 0) {
      finalShop.chains = [finalShop.chain];
    }
    merged.push(finalShop);
    seenIds.add(finalShop.id);
  }

  return merged;
}

/**
 * カスタム追加された店舗（`isCustom === true`）を抽出して `localStorage` に保存します。
 *
 * @param allShops - 全店舗配列
 */
export function persistCustomShops(allShops: readonly Shop[]): void {
  try {
    const customList = allShops.filter((s) => s.isCustom);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_SHOPS, JSON.stringify(customList));
  } catch (err) {
    console.warn('カスタム店舗の保存に失敗しました:', err);
  }
}

/**
 * 既存店舗に対する編集差分を `localStorage` に記録します。
 *
 * @param shopId - 編集対象の店舗ID
 * @param patch - 上書き保存するプロパティ差分
 */
export function persistEditedShopPatch(shopId: string, patch: Partial<Shop>): void {
  try {
    const editedMap = JSON.parse(localStorage.getItem(STORAGE_KEYS.EDITED_SHOPS) || '{}') as Record<
      string,
      Partial<Shop>
    >;
    editedMap[shopId] = patch;
    localStorage.setItem(STORAGE_KEYS.EDITED_SHOPS, JSON.stringify(editedMap));
  } catch (err) {
    console.warn('店舗編集差分の保存に失敗しました:', err);
  }
}

/**
 * 削除された店舗IDを `localStorage` の削除済みリストに追加します。
 *
 * @param shopId - 削除対象の店舗ID
 */
export function persistDeletedShopId(shopId: string): void {
  try {
    const deletedIds = new Set<string>(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.DELETED_IDS) || '[]') as string[]
    );
    deletedIds.add(shopId);
    localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(Array.from(deletedIds)));
  } catch (err) {
    console.warn('削除店舗IDの保存に失敗しました:', err);
  }
}
