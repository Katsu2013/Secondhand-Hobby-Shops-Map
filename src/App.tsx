/**
 * @file src/App.tsx
 * @description 全国中古＆ホビーショップ巡りマップのルートアプリケーションコンポーネント。
 *
 * 【なぜこのコンポーネントに状態を集約するか】
 * 左側のオプションパネル（チェーンON/OFF・カテゴリON/OFF・移動手段・出発地設定）、
 * 中央の地図キャンバス（バルーンマーカー・到達圏サークル・ルートポリライン）、
 * 右側の画面内店舗リストパネルの3つのビューが常に同期してリアルタイム更新されるよう、
 * 単一のデータフロー（Single Source of Truth）として状態を統合管理するためです。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORIES,
  CHAIN_GROUPS,
  CHAIN_MAP,
  classifyShopByName,
  estimateTravelInfo,
  evaluateClosingFeasibility,
  formatClockTimeFromMinutes,
  formatDurationMinutes,
  TRAVEL_MODE_MAP,
  TRAVEL_MODES,
} from './config/shopMaster';
import {
  fetchOsrmOrFallbackRouteData,
  geocodeLocationQuery,
  loadGoogleMapsSdk,
  optimizeTourOrder,
  scanAreaForNewShops,
} from './services/mapService';
import {
  fetchAndMergeShopsDatabase,
  loadGoogleApiKey,
  loadUserPreferencesFromStorage,
  persistCustomShops,
  persistDeletedShopId,
  persistEditedShopPatch,
  saveGoogleApiKey,
  saveUserPreferencesToStorage,
} from './services/storageService';
import { HeaderBar } from './components/HeaderBar';
import { OptionsPanel } from './components/OptionsPanel';
import { MapCanvas } from './components/MapCanvas';
import { ShopListPanel } from './components/ShopListPanel';
import { ApiKeyModal, ShopEditModal, type ShopFormSubmitData } from './components/Modals';
import type {
  ActiveRouteInfo,
  AreaPreset,
  CategoryId,
  CategoryMatchMode,
  ChainId,
  MapBounds,
  MapEngineType,
  OriginLocation,
  Shop,
  SortByMode,
  TravelModeId,
} from './types/shop';

/**
 * トースト通知メッセージ1件を表すインターフェース。
 */
interface ToastItem {
  /** トーストの一意なID */
  id: number;
  /** 表示するメッセージ文字列 */
  message: string;
}

/**
 * スマートフォン表示時の下部タブ識別子型。
 */
type MobileTabType = 'options' | 'map' | 'list';

/**
 * メインアプリケーションコンポーネント。
 *
 * @returns アプリケーション全体のJSX要素
 */
export const App: React.FC = () => {
  /** 初期ユーザー設定（`localStorage` から同期復元） */
  const initialPrefs = useMemo(() => loadUserPreferencesFromStorage(), []);

  /** マップエンジン種別（`'leaflet'` または `'google'`） */
  const [mapEngine, setMapEngine] = useState<MapEngineType>('leaflet');
  /** Google Maps API キー文字列 */
  const [googleApiKey, setGoogleApiKey] = useState<string>(() => loadGoogleApiKey());
  /** Google Maps インスタンスの参照 */
  const googleMapRef = useRef<google.maps.Map | null>(null);
  /** Google Directions Service の参照 */
  const googleDirServiceRef = useRef<google.maps.DirectionsService | null>(null);
  /** Google Directions Renderer の参照 */
  const googleDirRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  /** 現在の地図中心座標 */
  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: initialPrefs.origin.lat,
    lng: initialPrefs.origin.lng,
  });
  /** 地図カメラをプログラムから移動させるための命令オブジェクト */
  const [cameraTarget, setCameraTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    seq: number;
  }>({
    lat: initialPrefs.origin.lat,
    lng: initialPrefs.origin.lng,
    zoom: 12,
    seq: 0,
  });
  /** 現在の地図表示領域（バウンディングボックス） */
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

  /** 出発地情報 */
  const [origin, setOrigin] = useState<OriginLocation>(initialPrefs.origin);
  /** 地図クリックによる出発地指定モードかどうか */
  const [isPickingOrigin, setIsPickingOrigin] = useState<boolean>(false);

  /** 選択中のアクセス手段ID */
  const [travelMode, setTravelMode] = useState<TravelModeId>(initialPrefs.travelMode);
  /** 所要時間上限フィルタ（分、150は無制限） */
  const [maxMinutes, setMaxMinutes] = useState<number>(initialPrefs.maxMinutes);
  /** 地図ピン上に所要時間バッジを表示するかどうか */
  const [showPinTime, setShowPinTime] = useState<boolean>(initialPrefs.showPinTime);
  /** 出発地からの到達目安サークルを表示するかどうか */
  const [showTimeCircles, setShowTimeCircles] = useState<boolean>(initialPrefs.showTimeCircles);
  /** 閉店に間に合わない店舗（到着時営業終了）を非表示にするかどうか */
  const [hideClosedOnArrival, setHideClosedOnArrival] = useState<boolean>(
    Boolean(initialPrefs.hideClosedOnArrival)
  );
  /** 出発時刻の基準モード（`'now'`: 現在時刻でリアルタイム判定 / `'custom'`: 任意時刻指定） */
  const [departureTimeMode, setDepartureTimeMode] = useState<'now' | 'custom'>('now');
  /** 任意指定の出発時刻文字列（`"HH:MM"` 形式） */
  const [customDepartureTime, setCustomDepartureTime] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  /** 現在時刻の0:00からの経過分数（1分ごとに自動更新） */
  const [nowMinutesOfDay, setNowMinutesOfDay] = useState<number>(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  /** ONになっているチェーンIDのSet */
  const [enabledChains, setEnabledChains] = useState<Set<ChainId>>(
    () => new Set(initialPrefs.enabledChains)
  );
  /** ONになっているカテゴリIDのSet */
  const [enabledCategories, setEnabledCategories] = useState<Set<CategoryId>>(
    () => new Set(initialPrefs.enabledCategories)
  );
  /** カテゴリ一致モード（`'OR'` または `'AND'`） */
  const [categoryMatchMode, setCategoryMatchMode] = useState<CategoryMatchMode>(
    initialPrefs.categoryMatchMode
  );

  /** 右リスト内の検索キーワード */
  const [listSearchText, setListSearchText] = useState<string>('');
  /** 右リストの並び替え順 */
  const [sortBy, setSortBy] = useState<SortByMode>('time_asc');

  /** 全国店舗データベースの全店舗リスト */
  const [allShops, setAllShops] = useState<Shop[]>([]);
  /** 実ルート検索結果のキャッシュ（キー: `${originLat},${originLng}->${shopId}:${mode}`） */
  const [exactRouteCache, setExactRouteCache] = useState<
    Map<string, { minutes: number; distanceKm: number }>
  >(() => new Map());

  /** 現在選択中の店舗ID */
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  /** 巡回（ハシゴ）ルートに追加された店舗ID配列 */
  const [tourShopIds, setTourShopIds] = useState<string[]>([]);
  /** ルート案内カードに表示する情報 */
  const [activeRouteInfo, setActiveRouteInfo] = useState<ActiveRouteInfo | null>(null);
  /** 地図上に描画するカスタムルートポリライン座標（OSRM/直線用） */
  const [customRoutePath, setCustomRoutePath] = useState<{
    path: Array<[number, number]>;
    isDashed: boolean;
  } | null>(null);

  /** 左オプションパネルの折りたたみ状態（デスクトップ用） */
  const [isOptionsCollapsed, setIsOptionsCollapsed] = useState<boolean>(false);
  /** モバイル表示時のアクティブタブ */
  const [mobileTab, setMobileTab] = useState<MobileTabType>('map');
  /** パネル開閉時に地図のリサイズを促すトリガーカウンタ */
  const [resizeTrigger, setResizeTrigger] = useState<number>(0);

  /** APIキー設定モーダルの開閉状態 */
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  /** 店舗編集モーダルの開閉状態 */
  const [isShopModalOpen, setIsShopModalOpen] = useState<boolean>(false);
  /** 店舗編集モーダルで編集中の対象店舗（新規作成時は `null`） */
  const [editingShop, setEditingShop] = useState<Shop | null>(null);

  /** トースト通知の配列状態 */
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // 現在時刻の分数（nowMinutesOfDay）を30秒ごとに自動更新し、リアルタイム閉店判定を最新に保つ
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setNowMinutesOfDay(d.getHours() * 60 + d.getMinutes());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  /**
   * 閉店判定の基準となる出発時刻（0:00からの経過分数）。
   */
  const effectiveDepartureMinutes = useMemo<number>(() => {
    if (departureTimeMode === 'custom') {
      const m = customDepartureTime.match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      }
    }
    return nowMinutesOfDay;
  }, [departureTimeMode, customDepartureTime, nowMinutesOfDay]);

  /**
   * 画面右下にトースト通知を3.4秒間表示します。
   *
   * @param message - 表示する通知メッセージ
   */
  const showToast = useCallback((message: string): void => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  // ユーザー設定が変更されるたびに localStorage へ自動保存する
  useEffect(() => {
    saveUserPreferencesToStorage({
      origin,
      travelMode,
      maxMinutes,
      showPinTime,
      showTimeCircles,
      enabledChains: Array.from(enabledChains),
      enabledCategories: Array.from(enabledCategories),
      categoryMatchMode,
      hideClosedOnArrival,
    });
  }, [
    origin,
    travelMode,
    maxMinutes,
    showPinTime,
    showTimeCircles,
    enabledChains,
    enabledCategories,
    categoryMatchMode,
    hideClosedOnArrival,
  ]);

  /**
   * Google Maps APIキーを使って本家Googleマップエンジンを起動します。
   * 認証失敗時は安全に内蔵マップ（Leaflet）へフォールバックします。
   *
   * @param apiKey - Google Maps APIキー
   */
  const activateGoogleMapsEngine = useCallback(
    async (apiKey: string): Promise<void> => {
      try {
        await loadGoogleMapsSdk(apiKey);
        setMapEngine('google');
        showToast('本家 Google Maps API モードで起動しました！');
      } catch (err) {
        console.error('Google Maps API 初期化エラー（内蔵マップへフォールバック）:', err);
        showToast('Google Maps APIキーの認証に失敗したため、内蔵マップで表示します');
        setMapEngine('leaflet');
      }
    },
    [showToast]
  );

  // 初回マウント時に全国店舗データベース（data/shops.json）を読み込み、APIキーがあればGoogle Mapsを起動する。
  // あわせて初回オープン時に現在地（GPS）の取得を自動的に試み、許可されれば現在地を出発地・地図中心に設定し、
  // 拒否・非対応・タイムアウトの場合は現在の初期位置（東京・秋葉原駅周辺など）をそのまま維持する。
  useEffect(() => {
    let isMounted = true;
    fetchAndMergeShopsDatabase().then((shops) => {
      if (isMounted) {
        setAllShops(shops);
      }
    });
    if (googleApiKey) {
      activateGoogleMapsEngine(googleApiKey);
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isMounted) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setOrigin({ lat, lng, name: '現在地 (GPS)' });
          setCenter({ lat, lng });
          setCameraTarget((prev) => ({
            lat,
            lng,
            zoom: 12,
            seq: prev.seq + 1,
          }));
          showToast('現在地(GPS)を出発地に設定しました！');
        },
        () => {
          // 位置情報が拒否または取得不可の場合は現在の初期位置をそのまま利用する
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * チェーンフィルタ・カテゴリフィルタ・所要時間計算・閉店時間（間に合うか）判定・所要時間上限フィルタを適用した全国の該当店舗リスト。
   *
   * 【なぜここで所要時間と閉店判定を付与するか】
   * 出発地やアクセス手段・出発時刻が変更された瞬間に、全国すべての対象店舗の `_travel` プロパティ
   * （推定または実測の所要時間＋閉店時間に間に合うかの判定情報）を一括更新し、地図ピンと右リストの双方に即座に反映させるためです。
   */
  const filteredShops = useMemo<Shop[]>(() => {
    const { lat: oLat, lng: oLng } = origin;

    return allShops.reduce<Shop[]>((acc, shop) => {
      // 1. チェーンフィルタ（複合店は併設チェーンのどれか1つでもONなら表示）
      const shopChains = shop.chains && shop.chains.length > 0 ? shop.chains : [shop.chain];
      const hasChain = shopChains.some((cid) => enabledChains.has(cid));
      if (!hasChain) return acc;

      // 2. 取扱カテゴリフィルタ
      const shopCats = shop.categories || [];
      if (enabledCategories.size === 0) return acc;
      if (categoryMatchMode === 'AND') {
        for (const reqCat of enabledCategories) {
          if (!shopCats.includes(reqCat)) return acc;
        }
      } else {
        const hasCat = shopCats.some((cid) => enabledCategories.has(cid));
        if (!hasCat) return acc;
      }

      // 3. 所要時間と距離の算出（実ルートキャッシュがあれば優先利用、なければ速度モデル推計）
      const cacheKey = `${oLat.toFixed(4)},${oLng.toFixed(4)}->${shop.id}:${travelMode}`;
      const exact = exactRouteCache.get(cacheKey);
      const est = estimateTravelInfo(oLat, oLng, shop.lat, shop.lng, travelMode);

      const baseTravel = exact
        ? {
            estMinutes: exact.minutes,
            estRoadKm: exact.distanceKm,
            formattedTime: formatDurationMinutes(exact.minutes),
            formattedDist:
              exact.distanceKm < 10
                ? `${exact.distanceKm.toFixed(1)}km`
                : `${Math.round(exact.distanceKm)}km`,
            isExact: true,
          }
        : est;

      // 4. 所要時間上限フィルタ（150未満のとき）
      if (maxMinutes < 150 && baseTravel.estMinutes > maxMinutes) {
        return acc;
      }

      // 5. 閉店時間に対する間に合う・間に合わない判定
      const closingInfo = evaluateClosingFeasibility(
        shop.hours,
        baseTravel.estMinutes,
        effectiveDepartureMinutes
      );

      // 「閉店に間に合わない店舗を非表示にする」がONの場合は到着時閉店店舗を除外
      if (hideClosedOnArrival && !closingInfo.canMakeIt) {
        return acc;
      }

      acc.push({
        ...shop,
        _travel: {
          ...baseTravel,
          closingInfo,
        },
      });
      return acc;
    }, []);
  }, [
    allShops,
    origin,
    travelMode,
    maxMinutes,
    enabledChains,
    enabledCategories,
    categoryMatchMode,
    exactRouteCache,
    effectiveDepartureMinutes,
    hideClosedOnArrival,
  ]);

  /**
   * 現在の地図表示領域（`mapBounds`）およびリスト内テキスト検索で絞り込み、指定ソート順で並べ替えた画面内店舗リスト。
   */
  const viewportShops = useMemo<Shop[]>(() => {
    const query = listSearchText.trim().toLowerCase();

    const visible = filteredShops.filter((shop) => {
      if (mapBounds) {
        if (
          shop.lat > mapBounds.north ||
          shop.lat < mapBounds.south ||
          shop.lng > mapBounds.east ||
          shop.lng < mapBounds.west
        ) {
          return false;
        }
      }
      if (query) {
        const haystack = `${shop.name} ${shop.address || ''} ${shop.subBrand || ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    // 指定されたソートモードで並び替え
    visible.sort((a, b) => {
      if (sortBy === 'time_asc') {
        return (a._travel?.estMinutes ?? 9999) - (b._travel?.estMinutes ?? 9999);
      }
      if (sortBy === 'chain') {
        return (
          a.chain.localeCompare(b.chain) ||
          (a._travel?.estMinutes ?? 0) - (b._travel?.estMinutes ?? 0)
        );
      }
      if (sortBy === 'cat_count') {
        return (b.categories?.length ?? 0) - (a.categories?.length ?? 0);
      }
      return a.name.localeCompare(b.name, 'ja');
    });

    return visible;
  }, [filteredShops, mapBounds, listSearchText, sortBy]);

  /**
   * 地図上に表示中のルートラインとルート案内カードを消去します。
   */
  const clearActiveRoute = useCallback((): void => {
    setActiveRouteInfo(null);
    setCustomRoutePath(null);
    if (googleDirRendererRef.current) {
      googleDirRendererRef.current.set('directions', null);
    }
  }, []);

  /**
   * 単一店舗への実道路ルートを計算して地図およびルート案内カードに表示します。
   *
   * @param shop - 目的地となる店舗オブジェクト
   * @param currentOrigin - 出発地情報
   * @param currentModeId - アクセス手段ID
   */
  const calculateAndDisplaySingleRoute = useCallback(
    async (
      shop: Shop,
      currentOrigin: OriginLocation,
      currentModeId: TravelModeId
    ): Promise<void> => {
      const mode = TRAVEL_MODE_MAP[currentModeId] || TRAVEL_MODES[0];
      const gmapsMode = mode.googleMode.toLowerCase();
      const dirFlg = mode.id === 'DRIVING_NO_TOLL' ? '&dirflg=t' : '';
      const navUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentOrigin.lat},${currentOrigin.lng}&destination=${shop.lat},${shop.lng}&travelmode=${gmapsMode}${dirFlg}`;

      // まずは概算値でルート案内カードを即座に開く
      const initClosing = evaluateClosingFeasibility(
        shop.hours,
        shop._travel?.estMinutes ?? 20,
        effectiveDepartureMinutes
      );
      setActiveRouteInfo({
        modeBadge: `${mode.icon} ${mode.name}`,
        title: `${currentOrigin.name} ➔ ${shop.name}`,
        durationText: `約${shop._travel?.formattedTime || '--'}`,
        distanceText: shop._travel?.formattedDist || '--',
        engineText: `${initClosing.badgeLabel} (ルート検索中...)`,
        googleMapsNavUrl: navUrl,
        waypoints: [],
      });

      const cacheKey = `${currentOrigin.lat.toFixed(4)},${currentOrigin.lng.toFixed(4)}->${shop.id}:${currentModeId}`;

      // 1. Google Maps Directions API が利用可能な場合
      if (mapEngine === 'google' && googleDirServiceRef.current && window.google?.maps) {
        const req: google.maps.DirectionsRequest = {
          origin: { lat: currentOrigin.lat, lng: currentOrigin.lng },
          destination: { lat: shop.lat, lng: shop.lng },
          travelMode: google.maps.TravelMode[mode.googleMode],
          avoidHighways: Boolean(mode.avoidHighways),
          avoidTolls: Boolean(mode.avoidTolls),
        };

        googleDirServiceRef.current.route(req, async (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result?.routes?.[0]?.legs?.[0]) {
            setCustomRoutePath(null);
            googleDirRendererRef.current?.setDirections(result);
            const leg = result.routes[0].legs[0];
            const mins = Math.max(1, Math.round((leg.duration?.value || 60) / 60));
            const distKm = (leg.distance?.value || 1000) / 1000;

            setExactRouteCache((prev) => {
              const next = new Map(prev);
              next.set(cacheKey, { minutes: mins, distanceKm: distKm });
              return next;
            });

            const exactClosing = evaluateClosingFeasibility(
              shop.hours,
              mins,
              effectiveDepartureMinutes
            );
            setActiveRouteInfo({
              modeBadge: `${mode.icon} ${mode.name}`,
              title: `${currentOrigin.name} ➔ ${shop.name}`,
              durationText: formatDurationMinutes(mins),
              distanceText: `${distKm.toFixed(1)}km`,
              engineText: `${exactClosing.badgeLabel}`,
              googleMapsNavUrl: navUrl,
              waypoints: [],
            });
          } else {
            // 日本のTRANSIT等でGoogle Directionsがルートを返さない場合はOSRMへフォールバック
            const osrmRes = await fetchOsrmOrFallbackRouteData(currentOrigin, [shop], mode);
            setCustomRoutePath({ path: osrmRes.latLngPath, isDashed: !osrmRes.isRoadRoute });
            if (osrmRes.isRoadRoute) {
              setExactRouteCache((prev) => {
                const next = new Map(prev);
                next.set(cacheKey, { minutes: osrmRes.minutes, distanceKm: osrmRes.distanceKm });
                return next;
              });
            }
            const osrmClosing = evaluateClosingFeasibility(
              shop.hours,
              osrmRes.minutes,
              effectiveDepartureMinutes
            );
            setActiveRouteInfo({
              modeBadge: `${mode.icon} ${mode.name}`,
              title: `${currentOrigin.name} ➔ ${shop.name}`,
              durationText: formatDurationMinutes(osrmRes.minutes),
              distanceText: `${osrmRes.distanceKm.toFixed(1)}km`,
              engineText: `${osrmClosing.badgeLabel}`,
              googleMapsNavUrl: navUrl,
              waypoints: [],
            });
          }
        });
        return;
      }

      // 2. Leaflet + OSRM ルート計算
      const osrmRes = await fetchOsrmOrFallbackRouteData(currentOrigin, [shop], mode);
      setCustomRoutePath({ path: osrmRes.latLngPath, isDashed: !osrmRes.isRoadRoute });
      if (osrmRes.isRoadRoute) {
        setExactRouteCache((prev) => {
          const next = new Map(prev);
          next.set(cacheKey, { minutes: osrmRes.minutes, distanceKm: osrmRes.distanceKm });
          return next;
        });
      }
      const osrmClosing = evaluateClosingFeasibility(
        shop.hours,
        osrmRes.minutes,
        effectiveDepartureMinutes
      );
      setActiveRouteInfo({
        modeBadge: `${mode.icon} ${mode.name}`,
        title: `${currentOrigin.name} ➔ ${shop.name}`,
        durationText: formatDurationMinutes(osrmRes.minutes),
        distanceText: `${osrmRes.distanceKm.toFixed(1)}km`,
        engineText: `${osrmClosing.badgeLabel}`,
        googleMapsNavUrl: navUrl,
        waypoints: [],
      });
    },
    [mapEngine, effectiveDepartureMinutes]
  );

  /**
   * 巡回（ハシゴ）リストに登録された複数店舗を最適順序に並べ替え、一括ルートを計算・描画します。
   *
   * @param targetIds - 巡回対象の店舗ID配列
   * @param currentOrigin - 出発地情報
   * @param currentModeId - アクセス手段ID
   */
  const calculateAndDisplayTourRoute = useCallback(
    async (
      targetIds: readonly string[],
      currentOrigin: OriginLocation,
      currentModeId: TravelModeId
    ): Promise<void> => {
      const shops = targetIds
        .map((id) => allShops.find((s) => s.id === id))
        .filter((s): s is Shop => Boolean(s));
      if (shops.length === 0) return;

      const ordered = optimizeTourOrder(currentOrigin, shops);
      const mode = TRAVEL_MODE_MAP[currentModeId] || TRAVEL_MODES[0];
      const dest = ordered[ordered.length - 1];
      const waypointsParam =
        ordered.length > 1
          ? '&waypoints=' +
            ordered
              .slice(0, -1)
              .map((w) => `${w.lat},${w.lng}`)
              .join('|')
          : '';
      const gmapsMode = mode.googleMode.toLowerCase();
      const navUrl = `https://www.google.com/maps/dir/?api=1&origin=${currentOrigin.lat},${currentOrigin.lng}&destination=${dest.lat},${dest.lng}${waypointsParam}&travelmode=${gmapsMode}`;

      setActiveRouteInfo({
        modeBadge: `${mode.icon} ${ordered.length}店舗ハシゴ巡回ルート`,
        title: `${currentOrigin.name} 発 ➔ ${ordered.length}店舗巡回`,
        durationText: '計算中...',
        distanceText: '--',
        engineText: '巡回ルート計算中...',
        googleMapsNavUrl: navUrl,
        waypoints: ordered,
      });

      const osrmRes = await fetchOsrmOrFallbackRouteData(currentOrigin, ordered, mode);
      if (googleDirRendererRef.current) {
        googleDirRendererRef.current.set('directions', null);
      }
      setCustomRoutePath({ path: osrmRes.latLngPath, isDashed: !osrmRes.isRoadRoute });
      setActiveRouteInfo({
        modeBadge: `${mode.icon} ${ordered.length}店舗ハシゴ巡回ルート`,
        title: `${currentOrigin.name} 発 ➔ ${ordered.length}店舗巡回`,
        durationText: formatDurationMinutes(osrmRes.minutes),
        distanceText: `${osrmRes.distanceKm.toFixed(1)}km`,
        engineText: osrmRes.isRoadRoute ? '実道路ルート計算済' : '概算ルート',
        googleMapsNavUrl: navUrl,
        waypoints: ordered,
      });
    },
    [allShops]
  );

  /**
   * 出発地を新しい座標・名称に更新し、必要に応じて地図カメラを移動させます。
   *
   * @param lat - 新しい出発地の緯度
   * @param lng - 新しい出発地の経度
   * @param name - 出発地の表示名
   * @param panMap - 地図の中心を出発地へ移動させるかどうか
   * @param targetZoom - 移動後のズームレベル（省略時は現在のズームを維持）
   */
  const updateOriginLocation = useCallback(
    (
      lat: number,
      lng: number,
      name: string,
      panMap = true,
      targetZoom?: number
    ): void => {
      setOrigin({ lat, lng, name });
      if (panMap) {
        setCenter({ lat, lng });
        setCameraTarget((prev) => ({
          lat,
          lng,
          zoom: targetZoom,
          seq: prev.seq + 1,
        }));
      }
    },
    []
  );

  /**
   * 店舗ピンまたは店舗カードがクリックされた際のハンドラ。
   * 対象店舗を選択状態にして地図をフォーカスし、出発地からのルートを計算します。
   *
   * @param shop - 選択された店舗オブジェクト
   */
  const handleSelectShop = useCallback(
    (shop: Shop): void => {
      setSelectedShopId(shop.id);
      setCameraTarget((prev) => ({
        lat: shop.lat,
        lng: shop.lng,
        seq: prev.seq + 1,
      }));
      calculateAndDisplaySingleRoute(shop, origin, travelMode);
    },
    [calculateAndDisplaySingleRoute, origin, travelMode]
  );

  /**
   * アクセス手段が変更された際のハンドラ。
   * ルート表示中の場合は新しい移動手段でルートを再計算します。
   *
   * @param modeId - 新しく選択されたアクセス手段ID
   */
  const handleSelectTravelMode = useCallback(
    (modeId: TravelModeId): void => {
      if (!TRAVEL_MODE_MAP[modeId]) return;
      setTravelMode(modeId);

      if (tourShopIds.length > 0) {
        calculateAndDisplayTourRoute(tourShopIds, origin, modeId);
      } else if (selectedShopId) {
        const shop = filteredShops.find((s) => s.id === selectedShopId);
        if (shop) {
          calculateAndDisplaySingleRoute(shop, origin, modeId);
        }
      }
    },
    [
      tourShopIds,
      selectedShopId,
      filteredShops,
      origin,
      calculateAndDisplayTourRoute,
      calculateAndDisplaySingleRoute,
    ]
  );

  /**
   * 巡回（ハシゴ）リストへの店舗追加・解除をトグルするハンドラ。
   *
   * @param shopId - トグル対象の店舗ID
   */
  const handleToggleTourShop = useCallback(
    (shopId: string): void => {
      setTourShopIds((prev) => {
        const idx = prev.indexOf(shopId);
        let next: string[];
        if (idx >= 0) {
          next = prev.filter((id) => id !== shopId);
        } else {
          if (prev.length >= 8) {
            showToast('一度に巡回ルートに入れられるのは最大8店舗までです');
            return prev;
          }
          next = [...prev, shopId];
        }

        if (next.length > 0) {
          calculateAndDisplayTourRoute(next, origin, travelMode);
        } else {
          clearActiveRoute();
        }
        return next;
      });
    },
    [showToast, calculateAndDisplayTourRoute, origin, travelMode, clearActiveRoute]
  );

  /**
   * GPSで現在地を取得して出発地に設定するハンドラ。
   */
  const handleUseGpsOrigin = useCallback((): void => {
    if (!navigator.geolocation) {
      showToast('お使いのブラウザは現在地取得に対応していません');
      return;
    }
    showToast('現在地(GPS)を取得しています...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateOriginLocation(pos.coords.latitude, pos.coords.longitude, '現在地 (GPS)', true, 13);
        showToast('現在地を出発地に設定しました！');
      },
      (err) => {
        console.warn('Geolocation error:', err);
        showToast('現在地の取得に失敗しました。地図クリックまたは駅名検索をご利用ください。');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [showToast, updateOriginLocation]);

  /**
   * 駅名や住所で出発地を検索して設定するハンドラ。
   *
   * @param query - 検索キーワード
   */
  const handleSearchOrigin = useCallback(
    async (query: string): Promise<void> => {
      showToast(`「${query}」を検索しています...`);
      const loc = await geocodeLocationQuery(query, mapEngine === 'google');
      if (loc) {
        updateOriginLocation(loc.lat, loc.lng, loc.name, true, 13);
        showToast(`出発地を「${loc.name}」に設定しました`);
      } else {
        showToast(`「${query}」の場所が見つかりませんでした`);
      }
    },
    [mapEngine, showToast, updateOriginLocation]
  );

  /**
   * 現在表示中の地図エリア内にある未登録ショップをリアルタイムスキャンするハンドラ。
   */
  const handleScanCurrentArea = useCallback(async (): Promise<void> => {
    if (!mapBounds) return;
    if (Math.abs(mapBounds.north - mapBounds.south) > 1.5) {
      showToast('範囲が広すぎるため、もう少し地図を拡大してから探索してください');
      return;
    }
    showToast('🔍 表示中エリアの中古ショップをリアルタイム探索中...');
    const newlyFound = await scanAreaForNewShops(mapBounds, allShops, googleMapRef.current);
    if (newlyFound.length > 0) {
      setAllShops((prev) => {
        const updated = [...prev, ...newlyFound];
        persistCustomShops(updated);
        return updated;
      });
      showToast(`✨ 新たに ${newlyFound.length} 店舗を発見してマップに追加しました！`);
    } else {
      showToast('このエリアの該当店舗はすでにすべて表示されています！');
    }
  }, [mapBounds, allShops, showToast]);

  /**
   * 店舗追加・編集モーダルからの保存処理ハンドラ。
   *
   * @param formData - 入力された店舗フォームデータ
   */
  const handleSaveShopModal = useCallback(
    (formData: ShopFormSubmitData): void => {
      if (!formData.name || Number.isNaN(formData.lat) || Number.isNaN(formData.lng)) {
        showToast('店舗名と緯度・経度を正しく入力してください');
        return;
      }

      const inferred = classifyShopByName(formData.name);
      const chains = Array.from(new Set<ChainId>([formData.chain, ...inferred.chains]));

      if (formData.id) {
        // 既存店舗の更新
        const patch: Partial<Shop> = {
          name: formData.name,
          chain: formData.chain,
          chains,
          brands: inferred.brands,
          categories: formData.categories,
          lat: formData.lat,
          lng: formData.lng,
          address: formData.address,
          hours: formData.hours,
        };
        persistEditedShopPatch(formData.id, patch);
        setAllShops((prev) =>
          prev.map((s) => (s.id === formData.id ? { ...s, ...patch } : s))
        );
        showToast(`「${formData.name}」の情報を更新しました`);
      } else {
        // 新規店舗の追加
        const newShop: Shop = {
          id: `user_${Date.now()}`,
          name: formData.name,
          chain: formData.chain,
          chains,
          brands: inferred.brands,
          subBrand: CHAIN_MAP[formData.chain]?.shortName || '',
          categories: formData.categories,
          lat: formData.lat,
          lng: formData.lng,
          address: formData.address,
          hours: formData.hours,
          isCustom: true,
        };
        setAllShops((prev) => {
          const updated = [...prev, newShop];
          persistCustomShops(updated);
          return updated;
        });
        showToast(`「${formData.name}」を追加しました！`);
      }

      setIsShopModalOpen(false);
    },
    [showToast]
  );

  /**
   * 店舗編集モーダルからの削除処理ハンドラ。
   *
   * @param shopId - 削除する店舗ID
   */
  const handleDeleteShopModal = useCallback(
    (shopId: string): void => {
      persistDeletedShopId(shopId);
      setAllShops((prev) => {
        const updated = prev.filter((s) => s.id !== shopId);
        persistCustomShops(updated);
        return updated;
      });
      setIsShopModalOpen(false);
      showToast('店舗データを削除しました');
    },
    [showToast]
  );

  /**
   * 現在の全店舗データをJSONファイルとしてダウンロード書き出しするハンドラ。
   */
  const handleExportJson = useCallback((): void => {
    const cleanData = allShops.map(({ _travel, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(cleanData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reuse_shops_japan_${cleanData.length}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`全国 ${cleanData.length} 店舗のデータをJSON書き出ししました`);
  }, [allShops, showToast]);

  /**
   * JSONファイルから店舗データをインポートするハンドラ。
   *
   * @param file - ユーザーが選択したJSONファイル
   */
  const handleImportJsonFile = useCallback(
    async (file: File): Promise<void> => {
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Shop[];
        if (!Array.isArray(imported)) {
          throw new Error('Invalid JSON array');
        }
        let addedCount = 0;
        setAllShops((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          const next = [...prev];
          for (const item of imported) {
            if (item.name && typeof item.lat === 'number' && typeof item.lng === 'number') {
              if (!existingIds.has(item.id)) {
                next.push({ ...item, isCustom: true });
                existingIds.add(item.id);
                addedCount += 1;
              }
            }
          }
          persistCustomShops(next);
          return next;
        });
        showToast(`${addedCount} 件の店舗データをインポートしました！`);
      } catch {
        showToast('JSONファイルの形式が正しくありません');
      }
    },
    [showToast]
  );

  return (
    <>
      {/* 1. 上部ヘッダーバー */}
      <HeaderBar
        mapEngine={mapEngine}
        isGoogleConnected={mapEngine === 'google'}
        totalDbCount={allShops.length}
        travelMode={travelMode}
        onSelectTravelMode={handleSelectTravelMode}
        onSelectAreaPreset={(preset: AreaPreset) => {
          updateOriginLocation(preset.lat, preset.lng, preset.name, true, preset.zoom);
        }}
        onScanArea={handleScanCurrentArea}
        onToggleOptionsPanel={() => {
          setIsOptionsCollapsed((prev) => !prev);
          setMobileTab('options');
          setTimeout(() => setResizeTrigger((c) => c + 1), 280);
        }}
        onOpenApiModal={() => setIsApiModalOpen(true)}
      />

      {/* 2. メインワークスペース（3カラム：左オプション / 中央マップ / 右リスト） */}
      <main className="app-workspace">
        <OptionsPanel
          isCollapsed={isOptionsCollapsed}
          isMobileVisible={mobileTab === 'options'}
          onClosePanel={() => {
            setIsOptionsCollapsed(true);
            setMobileTab('map');
            setTimeout(() => setResizeTrigger((c) => c + 1), 280);
          }}
          origin={origin}
          isPickingOrigin={isPickingOrigin}
          onUseGpsOrigin={handleUseGpsOrigin}
          onTogglePickOriginMap={() => setIsPickingOrigin((prev) => !prev)}
          onSearchOrigin={handleSearchOrigin}
          travelMode={travelMode}
          onSelectTravelMode={handleSelectTravelMode}
          maxMinutes={maxMinutes}
          onChangeMaxMinutes={setMaxMinutes}
          showPinTime={showPinTime}
          onChangeShowPinTime={setShowPinTime}
          showTimeCircles={showTimeCircles}
          onChangeShowTimeCircles={setShowTimeCircles}
          departureTimeMode={departureTimeMode}
          onChangeDepartureTimeMode={setDepartureTimeMode}
          customDepartureTime={customDepartureTime}
          onChangeCustomDepartureTime={setCustomDepartureTime}
          currentClockText={formatClockTimeFromMinutes(nowMinutesOfDay)}
          hideClosedOnArrival={hideClosedOnArrival}
          onChangeHideClosedOnArrival={setHideClosedOnArrival}
          enabledChains={enabledChains}
          onToggleChain={(chainId, enabled) => {
            setEnabledChains((prev) => {
              const next = new Set(prev);
              if (enabled) next.add(chainId);
              else next.delete(chainId);
              return next;
            });
          }}
          onSetAllChains={(enableAll) => {
            setEnabledChains(enableAll ? new Set(CHAIN_GROUPS.map((c) => c.id)) : new Set());
          }}
          enabledCategories={enabledCategories}
          onToggleCategory={(catId, enabled) => {
            setEnabledCategories((prev) => {
              const next = new Set(prev);
              if (enabled) next.add(catId);
              else next.delete(catId);
              return next;
            });
          }}
          onSetAllCategories={(enableAll) => {
            setEnabledCategories(enableAll ? new Set(CATEGORIES.map((c) => c.id)) : new Set());
          }}
          categoryMatchMode={categoryMatchMode}
          onChangeCategoryMatchMode={setCategoryMatchMode}
          allShops={allShops}
          onOpenAddShopModal={() => {
            setEditingShop(null);
            setIsShopModalOpen(true);
          }}
          onExportJson={handleExportJson}
          onImportJsonFile={handleImportJsonFile}
        />

        <MapCanvas
          mapEngine={mapEngine}
          cameraTarget={cameraTarget}
          origin={origin}
          isPickingOrigin={isPickingOrigin}
          onCancelPickOrigin={() => setIsPickingOrigin(false)}
          onPickOriginOnMap={(lat, lng) => {
            updateOriginLocation(
              lat,
              lng,
              `指定地点 (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
              false
            );
            setIsPickingOrigin(false);
            showToast('クリックした地点を出発地に設定しました！');
          }}
          onViewportChanged={(newCenter, _newZoom, newBounds) => {
            setCenter(newCenter);
            setMapBounds(newBounds);
          }}
          viewportShops={viewportShops}
          totalFilteredCount={filteredShops.length}
          selectedShopId={selectedShopId}
          enabledChains={enabledChains}
          travelMode={travelMode}
          showPinTime={showPinTime}
          showTimeCircles={showTimeCircles}
          onSelectShop={handleSelectShop}
          onScanArea={handleScanCurrentArea}
          activeRouteInfo={activeRouteInfo}
          onCloseRouteCard={clearActiveRoute}
          customRoutePath={customRoutePath}
          onGoogleMapReady={(gMap, dirService, dirRenderer) => {
            googleMapRef.current = gMap;
            googleDirServiceRef.current = dirService;
            googleDirRendererRef.current = dirRenderer;
          }}
          resizeTrigger={resizeTrigger}
        />

        <ShopListPanel
          isMobileVisible={mobileTab === 'list'}
          onBackToMapMobile={() => {
            setMobileTab('map');
            setResizeTrigger((c) => c + 1);
          }}
          viewportShops={viewportShops}
          selectedShopId={selectedShopId}
          tourShopIds={tourShopIds}
          travelMode={travelMode}
          listSearchText={listSearchText}
          onChangeListSearchText={setListSearchText}
          sortBy={sortBy}
          onChangeSortBy={setSortBy}
          onSelectShop={handleSelectShop}
          onToggleTourShop={handleToggleTourShop}
          onClearTour={() => {
            setTourShopIds([]);
            clearActiveRoute();
          }}
          onCalculateTourRoute={() => calculateAndDisplayTourRoute(tourShopIds, origin, travelMode)}
          onOpenEditShopModal={(shop) => {
            setEditingShop(shop);
            setIsShopModalOpen(true);
          }}
        />
      </main>

      {/* 3. モバイル用ボトムナビゲーションバー */}
      <nav className="mobile-bottom-nav" aria-label="モバイル画面切替">
        <button
          type="button"
          id="mob-btn-options"
          className={`mob-nav-btn ${mobileTab === 'options' ? 'active' : ''}`}
          onClick={() => {
            setIsOptionsCollapsed(false);
            setMobileTab('options');
          }}
        >
          <span>⚙️</span>
          <span>オプション</span>
        </button>
        <button
          type="button"
          id="mob-btn-map"
          className={`mob-nav-btn ${mobileTab === 'map' ? 'active' : ''}`}
          onClick={() => {
            setMobileTab('map');
            setResizeTrigger((c) => c + 1);
          }}
        >
          <span>🗺️</span>
          <span>マップ</span>
        </button>
        <button
          type="button"
          id="mob-btn-list"
          className={`mob-nav-btn ${mobileTab === 'list' ? 'active' : ''}`}
          onClick={() => setMobileTab('list')}
        >
          <span>📋</span>
          <span>
            店舗一覧 (<b id="mob-shop-count">{viewportShops.length.toLocaleString()}</b>)
          </span>
        </button>
      </nav>

      {/* 4. Google Maps APIキー設定モーダル */}
      <ApiKeyModal
        isOpen={isApiModalOpen}
        currentApiKey={googleApiKey}
        onClose={() => setIsApiModalOpen(false)}
        onSaveApiKey={async (key) => {
          if (!key) {
            showToast('APIキーを入力してください');
            return;
          }
          setGoogleApiKey(key);
          saveGoogleApiKey(key);
          setIsApiModalOpen(false);
          await activateGoogleMapsEngine(key);
        }}
        onClearApiKey={() => {
          setGoogleApiKey('');
          saveGoogleApiKey('');
          setIsApiModalOpen(false);
          window.location.reload();
        }}
      />

      {/* 5. 店舗情報の追加・編集モーダル */}
      <ShopEditModal
        isOpen={isShopModalOpen}
        editingShop={editingShop}
        defaultCenter={center}
        onClose={() => setIsShopModalOpen(false)}
        onSaveShop={handleSaveShopModal}
        onDeleteShop={handleDeleteShopModal}
      />

      {/* 6. トースト通知コンテナ */}
      <div id="toast-container" className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast-msg">
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
};
