/**
 * @file src/services/mapService.ts
 * @description Google Maps SDK の動的ロード、地名ジオコーディング（Google Geocoder / Nominatim）、
 * 実道路ルート検索（Google Directions / OSRM）、および表示エリア内の新規店舗スキャンを行うサービス層。
 *
 * 【なぜこのサービス層が必要か】
 * 外部API（Google Maps API / OpenStreetMap Nominatim / OSRM / Overpass API）との非同期通信処理を
 * UIコンポーネントから分離し、APIキー未設定時やレート制限時にも確実にフォールバック動作させるためです。
 */

import { classifyShopByName, estimateTravelInfo, calcStraightDistanceKm } from '../config/shopMaster';
import type { MapBounds, OriginLocation, Shop, TravelModeInfo } from '../types/shop';

/** StrictMode等から同時に要求されてもSDKを二重ロードしないためのPromise。 */
let googleSdkPromise: Promise<void> | null = null;
/** 現在ロードしているキー。キー変更時はページ再読込で切り替えます。 */
let googleSdkKey = '';
/** 認証失敗時に最新のアプリインスタンスへ通知するコールバック。 */
let notifyGoogleAuthFailure: () => void = () => {};

/**
 * Google Maps JavaScript API のスクリプトタグを動的に `<head>` へ挿入してロードします。
 *
 * 【なぜ動的ロードにするか】
 * ユーザーが画面上の「Google Maps API設定」モーダルから後からAPIキーを入力した場合でも、
 * ページを再読み込みすることなく即座に本家Googleマップエンジンへ切り替えられるようにするためです。
 *
 * @param apiKey - ユーザーが設定したGoogle Maps JavaScript APIキー
 * @returns スクリプトの読み込み完了時に解決されるPromise
 */
export function loadGoogleMapsSdk(apiKey: string, onAuthFailure: () => void = () => {}): Promise<void> {
  // 認証はscript.onload後に失敗することもあるため、Promiseとは独立してアプリへ通知する。
  notifyGoogleAuthFailure = onAuthFailure;
  if (googleSdkPromise && googleSdkKey === apiKey) return googleSdkPromise;
  googleSdkKey = apiKey;
  googleSdkPromise = new Promise((resolve, reject) => {
    /** 応答がないSDKのロードを打ち切るタイマー */
    const timer = setTimeout(() => reject(new Error('Google Maps SDK timeout')), 20000);
    window.gm_authFailure = () => {
      clearTimeout(timer);
      notifyGoogleAuthFailure();
      reject(new Error('Google Maps API Authentication Failure'));
    };
    if (window.google?.maps) { clearTimeout(timer); resolve(); return; }
    /** 既存のSDKタグ */
    const existing = document.getElementById('google-maps-sdk');
    existing?.remove();
    /** SDK読み込み用script */
    const script = document.createElement('script');
    script.id = 'google-maps-sdk';
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(apiKey) + '&libraries=places,geometry&language=ja&region=JP';
    script.async = true;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error('Google Maps SDK load failed')); };
    document.head.appendChild(script);
  });
  return googleSdkPromise;
}

/**
 * 駅名や住所などのテキストクエリから緯度・経度座標を検索（ジオコーディング）します。
 *
 * 【なぜ2段階の検索を行うか】
 * Google Maps モード稼働中は精度の高い `google.maps.Geocoder` を優先利用し、
 * APIキー未設定時やエラー時にはキー不要の OpenStreetMap Nominatim API へ自動フォールバックすることで、
 * どのモードでも出発地の駅名・地名検索が確実に機能するようにするためです。
 *
 * @param query - 検索する駅名・地名・住所（例: `"千葉駅"`, `"秋葉原"`）
 * @param useGoogleGeocoder - Google Geocoder を優先使用するかどうか
 * @returns 検索された座標と名称（見つからない場合は `null`）
 */
export async function geocodeLocationQuery(
  query: string,
  useGoogleGeocoder: boolean
): Promise<OriginLocation | null> {
  /** 前後の空白を除去した検索クエリ */
  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) return null;

  // 1. Google Geocoder が利用可能な場合は優先して問い合わせる
  if (useGoogleGeocoder && window.google && window.google.maps) {
    const googleResult = await new Promise<OriginLocation | null>((resolve) => {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: trimmedQuery, region: 'JP' }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          const loc = results[0].geometry.location;
          resolve({
            lat: loc.lat(),
            lng: loc.lng(),
            name: trimmedQuery,
          });
        } else {
          resolve(null);
        }
      });
    });
    if (googleResult) {
      return googleResult;
    }
  }

  // 2. OpenStreetMap Nominatim API によるフォールバック検索
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=jp&limit=1&q=${encodeURIComponent(
      trimmedQuery
    )}`;
    const response = await fetch(url, { headers: { 'Accept-Language': 'ja' } });
    const data = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (Array.isArray(data) && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        name: trimmedQuery,
      };
    }
  } catch (err) {
    console.warn('Nominatim ジオコーディングエラー:', err);
  }

  return null;
}

/**
 * OSRM（Open Source Routing Machine）による道路ルート計算結果のインターフェース。
 */
export interface OsrmRouteResult {
  /** 算出された所要時間（分） */
  minutes: number;
  /** 算出された総走行距離（km） */
  distanceKm: number;
  /** 地図上にポリラインを描画するための `[lat, lng]` 座標配列 */
  latLngPath: Array<[number, number]>;
  /** 実道路ルート計算に成功したか（失敗時は直線フォールバック） */
  isRoadRoute: boolean;
  /** 交通予測・道路回避への対応状況を示す説明 */
  description: string;
}

/**
 * OSRM API を使用して出発地から1つ以上の目的地（巡回対応）への実道路ルートと所要時間を計算します。
 *
 * 【なぜこの処理が必要か】
 * Google Maps APIキー未設定時や、日本の公共交通機関モード（Google Directions APIがルートを返さないケース）でも、
 * 道路網に沿ったリアルなルート形状（ポリライン）と距離・所要時間を算出してユーザーに提示するためです。
 *
 * @param origin - 出発地点の座標情報
 * @param shopsList - 目的地となる店舗の配列（単一店舗または巡回順の複数店舗）
 * @param mode - 選択されているアクセス手段の定義オブジェクト
 * @returns 所要時間・距離・ポリライン座標配列を含む `OsrmRouteResult`
 */
/** 公開OSRMサービスへの検索開始時刻。過剰な連続リクエストを避けます。 */
let nextOsrmRequestAt = 0;
/** 中止済みの検索が待ち行列の時間枠を占有しないための開始待ち列 */
let osrmQueue: Promise<void> = Promise.resolve();

/**
 * 公開経路サービスの開始間隔を守り、中止時は待機を解除します。
 * @param signal - 通信と共通の中止シグナル
 * @returns 開始可能になったとき解決するPromise
 */
function waitForOsrmSlot(signal: AbortSignal): Promise<void> {
  /** 直前の開始待ちが完了してから次の枠を確認します。 */
  const slot = osrmQueue.then(async () => {
    if (signal.aborted) throw new DOMException('中止', 'AbortError');
    /** 次の開始までに必要な待機時間 */
    const delay = Math.max(0, nextOsrmRequestAt - Date.now());
    if (delay > 0) await new Promise<void>((resolve, reject) => {
      /** 待機中の中止処理 */
      const abort = (): void => { clearTimeout(timer); reject(new DOMException('中止', 'AbortError')); };
      /** 待機完了時はイベントを除去します。 */
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, delay);
      signal.addEventListener('abort', abort, { once: true });
    });
    if (signal.aborted) throw new DOMException('中止', 'AbortError');
    nextOsrmRequestAt = Date.now() + 1100;
  });
  osrmQueue = slot.catch(() => {});
  return slot;
}

export async function fetchOsrmOrFallbackRouteData(
  origin: OriginLocation, shopsList: readonly Shop[], mode: TravelModeInfo, signal?: AbortSignal
): Promise<OsrmRouteResult> {
  // 公共交通や道路回避を非対応のサービスへ送って、別の移動手段の経路と誤表示しない。
  if (mode.id !== 'TRANSIT' && mode.id !== 'DRIVING_NO_TOLL' && shopsList.length > 0) {
    /** 選択手段に対応する経路サーバー */
    const endpoint = mode.id === 'WALKING' ? 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'
      : mode.id === 'BICYCLING' ? 'https://routing.openstreetmap.de/routed-bike/route/v1/bike'
      : 'https://router.project-osrm.org/route/v1/driving';
    /** APIに指定する経度・緯度列 */
    const coords = [origin, ...shopsList].map(p => p.lng + ',' + p.lat).join(';');
    /** 実通信の中止とタイムアウトをまとめる制御 */
    const controller = new AbortController();
    /** 呼出し側の中止を通信にも伝える処理 */
    const abort = (): void => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    /** 開始待ちも含めた応答待ちの上限 */
    const timer = setTimeout(abort, 15000);
    try {
      if (signal?.aborted) throw new DOMException('中止', 'AbortError');
      await waitForOsrmSlot(controller.signal);
      /** APIの道路距離・推計所要時間・形状 */
      const response = await fetch(endpoint + '/' + coords + '?overview=full&geometries=geojson', { signal: controller.signal });
      if (!response.ok) throw new Error('OSRM HTTP ' + response.status);
      /** 経路レスポンス。交通情報は含みません。 */
      const data = await response.json() as { code?: string; routes?: Array<{ duration: number; distance: number; geometry: { coordinates: Array<[number, number]> } }> };
      /** 最初の推奨経路 */
      const route = data.routes?.[0];
      if (data.code === 'Ok' && route && Number.isFinite(route.duration) && Number.isFinite(route.distance) && route.geometry.coordinates.length > 0) {
        return { minutes: Math.max(1, Math.ceil(route.duration / 60)), distanceKm: route.distance / 1000,
          latLngPath: route.geometry.coordinates.map(p => [p[1], p[0]]), isRoadRoute: true,
          description: mode.googleMode === 'DRIVING' ? 'OSRM道路ルートの概算・渋滞未考慮' : 'OSRM経路に基づく概算' };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn('OSRMを取得できないため距離から概算します:', error);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  /** 区間ごとに積算する概算時間 */
  let minutes = 0;
  /** 区間ごとに積算する概算距離 */
  let distanceKm = 0;
  /** 次の区間の始点 */
  let previous = origin;
  for (const shop of shopsList) {
    /** 出発地と各区間の移動手段から求め直した推計 */
    const estimate = estimateTravelInfo(previous.lat, previous.lng, shop.lat, shop.lng, mode.id);
    minutes += estimate.estMinutes;
    distanceKm += estimate.estRoadKm;
    previous = { lat: shop.lat, lng: shop.lng, name: shop.name };
  }
  return { minutes: Math.max(1, minutes), distanceKm,
    latLngPath: [[origin.lat, origin.lng], ...shopsList.map((s): [number, number] => [s.lat, s.lng])], isRoadRoute: false,
    description: mode.id === 'TRANSIT' ? '距離からの概算・乗換や時刻表は未取得' : mode.id === 'DRIVING_NO_TOLL' ? '一般道の速度モデルによる概算・経路と渋滞は未確認' : '距離からの概算・経路未取得・渋滞未考慮' };
}

/**
 * 出発地から近い順（最近傍法：Nearest Neighbor）で複数店舗の巡回（ハシゴ）順序を自動最適化します。
 *
 * 【なぜこの処理が必要か】
 * ユーザーが複数の店舗を「+巡回ハシゴ」に追加した際、追加した順番のままだとジグザグの非効率な移動になるため、
 * 出発地から最も近い店舗へ順番に立ち寄る効率的な巡回ルートへ自動整列させるためです。
 *
 * @param origin - 出発地点の座標
 * @param shops - 巡回対象の店舗リスト
 * @returns 巡回順序が最適化された店舗配列
 */
export function optimizeTourOrder(origin: OriginLocation, shops: readonly Shop[]): Shop[] {
  /** 整列後の店舗リスト */
  const ordered: Shop[] = [];
  /** 未訪問の残り店舗リスト */
  const remaining: Shop[] = [...shops];
  /** 現在位置の緯度（初期値は出発地） */
  let curLat = origin.lat;
  /** 現在位置の経度（初期値は出発地） */
  let curLng = origin.lng;

  while (remaining.length > 0) {
    // 現在地からユークリッド距離が最も近い店舗を先頭にする
    remaining.sort((a, b) => {
      const distA = Math.hypot(a.lat - curLat, a.lng - curLng);
      const distB = Math.hypot(b.lat - curLat, b.lng - curLng);
      return distA - distB;
    });
    const nextShop = remaining.shift()!;
    ordered.push(nextShop);
    curLat = nextShop.lat;
    curLng = nextShop.lng;
  }

  return ordered;
}

/**
 * 現在表示中の地図矩形（バウンディングボックス）内にある中古ショップを
 * Google Places API および OpenStreetMap Overpass API でリアルタイムスキャンして新規店舗を抽出します。
 *
 * @param bounds - 現在の地図表示領域の北南東西座標
 * @param existingShops - すでに登録されている全店舗配列（重複排除用）
 * @param googleMap - Google Maps インスタンス（Googleモード時のみ）
 * @returns 新たに発見された店舗オブジェクトの配列
 */
export async function scanAreaForNewShops(
  bounds: MapBounds,
  existingShops: readonly Shop[],
  googleMap: google.maps.Map | null
): Promise<Shop[]> {
  /** 新規に発見された店舗を格納する配列 */
  const discoveredShops: Shop[] = [];
  /** 重複チェック用に既存店舗と発見済み店舗を合わせたリスト */
  const allKnown: Shop[] = [...existingShops];

  /**
   * 候補店舗が既存店舗と重複していないか（約80m以内に同名店がないか）判定し、新規なら追加する内部関数。
   *
   * @param name - 発見された店舗名
   * @param lat - 緯度
   * @param lng - 経度
   * @param address - 住所文字列
   * @param idPrefix - 一意なIDプレフィックス
   */
  const tryAddCandidate = (
    name: string,
    lat: number,
    lng: number,
    address: string,
    idPrefix: string
  ): void => {
    const isDuplicate = allKnown.some(
      (s) => calcStraightDistanceKm(s.lat, s.lng, lat, lng) < 0.12
    );
    if (isDuplicate) return;

    const info = classifyShopByName(name);
    const newShop: Shop = {
      id: idPrefix || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      chain: info.chain,
      chains: info.chains,
      brands: info.brands,
      subBrand: info.subBrand,
      categories: info.categories,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      address: address || '',
      hours: '',
      isCustom: true,
      assortmentStatus: 'unverified',
      assortmentSources: [],
    };

    allKnown.push(newShop);
    discoveredShops.push(newShop);
  };

  // 1. Google Maps Places API が有効な場合は Places textSearch でスキャン
  if (googleMap && window.google && window.google.maps && window.google.maps.places) {
    const placesService = new google.maps.places.PlacesService(googleMap);
    const keywords = [
      'ハードオフ',
      'ホビーオフ',
      'オフハウス',
      '駿河屋',
      'ブックオフ',
      'らしんばん',
      'まんだらけ',
      '古本市場',
      'お宝創庫',
      '鑑定団',
    ];
    const gBounds = googleMap.getBounds();

    for (const kw of keywords) {
      const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
        placesService.textSearch({ query: kw, bounds: gBounds || undefined }, (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res) {
            resolve(res);
          } else {
            resolve([]);
          }
        });
      });

      for (const r of results) {
        if (!r.geometry || !r.geometry.location || !r.name) continue;
        tryAddCandidate(
          r.name,
          r.geometry.location.lat(),
          r.geometry.location.lng(),
          r.formatted_address || '',
          `gplace_${r.place_id || Date.now()}`
        );
      }
    }
  }

  // 2. OpenStreetMap Overpass API でも現在の表示矩形をスキャンして補完
  try {
    const bbox = `${bounds.south.toFixed(4)},${bounds.west.toFixed(4)},${bounds.north.toFixed(4)},${bounds.east.toFixed(4)}`;
    const query = `[out:json][timeout:15];(nwr["name"~"ハードオフ|オフハウス|ホビーオフ|モードオフ|ガレージオフ|ブックオフ|BOOKOFF|駿河屋|らしんばん|まんだらけ|メロンブックス|アニメイト|ゲオ|GEO|古本市場|ふるいち|お宝創庫|万代|マンガ倉庫|鑑定団"](${bbox}););out center tags;`;
    const response = await fetch('https://maps.mail.ru/osm/tools/overpass/api/interpreter', {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        elements?: Array<{
          id: number;
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
          tags?: Record<string, string>;
        }>;
      };

      for (const el of data.elements || []) {
        const tags = el.tags || {};
        const name = tags['name:ja'] || tags.name || '';
        // 店名キーワードだけでバス停・橋・閉店施設を新規店舗にしない。
        if (!tags.shop || ['no', 'vacant', 'supermarket', 'convenience'].includes(tags.shop) ||
          tags['disused:shop'] || tags['abandoned:shop'] || tags.closed || tags.highway ||
          /閉店|万代橋|万代シティ|万代島|万代町|アニメイトカフェ/.test(name)) continue;
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (name && typeof lat === 'number' && typeof lng === 'number') {
          const addr =
            tags['addr:full'] || `${tags['addr:city'] || ''}${tags['addr:suburb'] || ''}`;
          tryAddCandidate(name, lat, lng, addr, `osm_scan_${el.id}`);
        }
      }
    }
  } catch (err) {
    console.warn('Overpass エリアスキャン補完エラー:', err);
  }

  return discoveredShops;
}
