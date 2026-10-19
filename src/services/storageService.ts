/**
 * @file src/services/storageService.ts
 * @description 全国店舗データベース（`data/shops.json`）の取得および、ブラウザの `localStorage` を用いた
 * ユーザー設定・APIキーの永続化サービス。店舗情報は配布DBを唯一の永続データとします。
 *
 * 【なぜこのサービス層が必要か】
 * UIコンポーネント（React）からストレージの読み書きや店舗データの検証を分離することで、
 * データの整合性を保ち、将来バックエンドAPIやIndexedDBへ移行する際も変更箇所を局所化できるためです。
 */

import {
  CATEGORIES,
  CATEGORY_MAP,
  CHAIN_GROUPS,
  SUB_CATEGORIES,
  TRAVEL_MODE_MAP,
} from '../config/shopMaster';
import { normalizeShop } from './shopValidation';
import type { CategoryId, Shop, SubCategoryId, UserPreferences } from '../types/shop';

/**
 * `localStorage` で使用するキー文字列の定数オブジェクト。
 * 閲覧設定とAPIキーだけを保存し、店舗データの端末別上書きは行いません。
 */
export const STORAGE_KEYS = {
  /** Google Maps JavaScript API キーの保存キー */
  API_KEY: 'REUSE_MAP_GOOGLE_API_KEY',
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
    enabledSubCategories: SUB_CATEGORIES.map((s) => s.id),
    categoryMatchMode: 'OR',
    hideClosedOnArrival: false,
    departureTimeMode: 'now',
    customDepartureTime: '',
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
      typeof parsed.origin.lng === 'number' && Number.isFinite(parsed.origin.lat) && Number.isFinite(parsed.origin.lng) && Math.abs(parsed.origin.lat) <= 90 && Math.abs(parsed.origin.lng) <= 180
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
      /** 保存時のチェーン集合。旧設定は従来の8グループとして引き継ぎます。 */
      const known = new Set(parsed.knownChains ?? CHAIN_GROUPS.filter((chain) => !['iosys', 'janpara', 'pc_koubou', 'inverse'].includes(chain.id)).map((chain) => chain.id));
      defaults.enabledChains = CHAIN_GROUPS.filter((chain) => parsed.enabledChains!.includes(chain.id) || !known.has(chain.id)).map((chain) => chain.id);
    }

    // 有効カテゴリ・詳細サブジャンルリストの復元（旧バージョン設定からの自動マイグレーション対応）
    if (Array.isArray(parsed.enabledSubCategories)) {
      defaults.enabledSubCategories = parsed.enabledSubCategories as SubCategoryId[];
      if (Array.isArray(parsed.enabledCategories)) {
        defaults.enabledCategories = parsed.enabledCategories as CategoryId[];
      }
    } else if (Array.isArray(parsed.enabledCategories)) {
      const legacyCats = new Set<CategoryId>(parsed.enabledCategories as CategoryId[]);
      // 旧6分類時代に全ONだった場合は新しく追加された apparel_life も含めて全ONにマイグレーションする
      if (legacyCats.size >= 6) {
        legacyCats.add('apparel_life');
      }
      defaults.enabledCategories = Array.from(legacyCats);
      const migratedSubs = new Set<SubCategoryId>();
      for (const cid of legacyCats) {
        const catInfo = CATEGORY_MAP[cid];
        if (catInfo) {
          catInfo.subCategories.forEach((s) => migratedSubs.add(s));
        }
      }
      defaults.enabledSubCategories = Array.from(migratedSubs);
    }

    // カテゴリ一致モード（OR / AND）の復元
    if (parsed.categoryMatchMode === 'OR' || parsed.categoryMatchMode === 'AND') {
      defaults.categoryMatchMode = parsed.categoryMatchMode;
    }

    // 出発時刻も永続化し、再起動時にユーザー指定を失わない。
    if (parsed.departureTimeMode === 'now' || parsed.departureTimeMode === 'custom') defaults.departureTimeMode = parsed.departureTimeMode;
    if (typeof parsed.customDepartureTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.customDepartureTime)) defaults.customDepartureTime = parsed.customDepartureTime;
    // 閉店に間に合わない店舗の非表示フラグの復元
    if (typeof parsed.hideClosedOnArrival === 'boolean') {
      defaults.hideClosedOnArrival = parsed.hideClosedOnArrival;
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
    localStorage.setItem(STORAGE_KEYS.USER_PREFS, JSON.stringify({ ...prefs, knownChains: CHAIN_GROUPS.map((chain) => chain.id) }));
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
 * 自動更新された全国店舗マスターJSONを取得し、検証済みの店舗だけを返します。
 * 旧版の端末別編集・追加・削除は読み込まず、全利用者で同じ配布情報を基準にします。
 * 旧保存キーの値は移行時に消去せず、参照しないことで最新情報の上書きを防ぎます。
 *
 * @returns 検証とID重複除去を行った配布店舗配列のPromise
 */
export async function fetchShopsDatabase(): Promise<Shop[]> {
  try {
    /** 更新後の配布DBを取得し、古いキャッシュの固定を避けます。 */
    const response = await fetch(`data/shops.json?v=${Date.now()}`);
    if (!response.ok) return [];
    /** 外部入力として扱い、不正なレコードは画面へ渡しません。 */
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    /** 同じIDの複数表示を避けるため、最初の有効なレコードだけ採用します。 */
    const seenIds = new Set<string>();
    return data.map(normalizeShop).filter((shop): shop is Shop => {
      if (!shop || seenIds.has(shop.id)) return false;
      seenIds.add(shop.id);
      return true;
    });
  } catch (err) {
    console.warn('data/shops.json の読み込みに失敗しました:', err);
    return [];
  }
}
