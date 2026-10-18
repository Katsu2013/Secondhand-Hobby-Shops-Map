/**
 * @file src/services/mapService.ts
 * @description Google Maps SDK の動的ロード、地名ジオコーディング（Google Geocoder / Nominatim）、
 * 実道路ルート検索（Google Directions / OSRM）、および表示エリア内の新規店舗スキャンを行うサービス層。
 *
 * 【なぜこのサービス層が必要か】
 * 外部API（Google Maps API / OpenStreetMap Nominatim / OSRM / Overpass API）との非同期通信処理を
 * UIコンポーネントから分離し、APIキー未設定時やレート制限時にも確実にフォールバック動作させるためです。
 */

import { classifyShopByName } from '../config/shopMaster';
import type { MapBounds, OriginLocation, Shop, TravelModeInfo } from '../types/shop';

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
export function loadGoogleMapsSdk(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // すでに読み込み済みの場合は即座に完了とする
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    // Google Maps APIキー認証エラー時のグローバルコールバックをフックして検知する
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      reject(new Error('Google Maps API Authentication Failure'));
    };

    // 既存のscriptタグがあれば一度除去してから再挿入する
    const existing = document.getElementById('google-maps-sdk');
    if (existing) {
      existing.remove();
    }

    /** 動的に生成する `<script>` 要素 */
    const script = document.createElement('script');
    script.id = 'google-maps-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places,geometry&language=ja&region=JP`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
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
export async function fetchOsrmOrFallbackRouteData(
  origin: OriginLocation,
  shopsList: readonly Shop[],
  mode: TravelModeInfo
): Promise<OsrmRouteResult> {
  /** OSRM API に指定するプロファイル名（徒歩・自転車・自動車） */
  const osrmProfile =
    mode.googleMode === 'WALKING'
      ? 'foot'
      : mode.googleMode === 'BICYCLING'
        ? 'bike'
        : 'driving';

  /** OSRM API 形式の経度・緯度連結文字列（`lng,lat;lng,lat`） */
  const coordsStr = [
    `${origin.lng},${origin.lat}`,
    ...shopsList.map((s) => `${s.lng},${s.lat}`),
  ].join(';');

  try {
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${coordsStr}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = (await response.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        geometry: { coordinates: Array<[number, number]> };
      }>;
    };

    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      const route = data.routes[0];
      /** 実測された道路距離（km） */
      const distKm = route.distance / 1000;

      /** 移動手段の速度特性に合わせて補正した所要時間（分） */
      let mins = 0;
      if (mode.id === 'DRIVING_TOLL') {
        const localKm = Math.min(distKm, 8);
        const hwKm = Math.max(0, distKm - 8);
        mins = Math.round(
          mode.startupMinutes +
            (localKm / mode.baseSpeedKmh) * 60 +
            (hwKm / mode.highwaySpeedKmh) * 60
        );
      } else if (mode.id === 'DRIVING_NO_TOLL') {
        mins = Math.round(mode.startupMinutes + (distKm / mode.baseSpeedKmh) * 60);
      } else if (mode.id === 'TRANSIT') {
        mins = Math.round(mode.startupMinutes + (distKm / mode.baseSpeedKmh) * 60);
      } else if (mode.id === 'BICYCLING') {
        mins = Math.round(1 + (distKm / 15) * 60);
      } else {
        mins = Math.round((distKm / 4.5) * 60);
      }
      mins = Math.max(1, mins);

      /** GeoJSONの `[lng, lat]` 配列を地図描画用の `[lat, lng]` 配列へ変換 */
      const latLngPath: Array<[number, number]> = route.geometry.coordinates.map((c) => [
        c[1],
        c[0],
      ]);

      return {
        minutes: mins,
        distanceKm: distKm,
        latLngPath,
        isRoadRoute: true,
      };
    }
  } catch (err) {
    console.warn('OSRM ルート検索に失敗したため直線フォールバックを使用します:', err);
  }

  // OSRMが応答しない場合のフォールバック（出発地と各店舗を直線で結ぶ）
  const fallbackPath: Array<[number, number]> = [
    [origin.lat, origin.lng],
    ...shopsList.map((s): [number, number] => [s.lat, s.lng]),
  ];
  const firstShop = shopsList[0];
  return {
    minutes: firstShop?._travel?.estMinutes || 15,
    distanceKm: firstShop?._travel?.estRoadKm || 5,
    latLngPath: fallbackPath,
    isRoadRoute: false,
  };
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
      (s) => Math.abs(s.lat - lat) < 0.0008 && Math.abs(s.lng - lng) < 0.0008 && s.name === name
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
