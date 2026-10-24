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
  CATEGORY_MAP,
  CHAIN_GROUPS,
  deriveParentCategoriesFromSubCategories,
  estimateTravelInfo,
  evaluateClosingFeasibility,
  formatClockTimeFromMinutes,
  formatDurationMinutes,
  matchesShopCategories,
  scopeShopAssortment,
  SUB_CATEGORIES,
  SUB_CATEGORY_MAP,
  TRAVEL_MODE_MAP,
} from './config/shopMaster';
import {
  geocodeLocationQuery,
  loadGoogleMapsSdk,
  optimizeTourOrder,
  scanAreaForNewShops,
} from './services/mapService';
import {
  fetchShopsDatabase,
  loadGoogleApiKey,
  loadUserPreferencesFromStorage,
  saveGoogleApiKey,
  saveUserPreferencesToStorage,
} from './services/storageService';
import { calculateRoute, getDepartureDate } from './services/routeService';
import { HeaderBar } from './components/HeaderBar';
import { OptionsPanel } from './components/OptionsPanel';
import { MapCanvas } from './components/MapCanvas';
import { ShopListPanel } from './components/ShopListPanel';
import { ApiKeyModal } from './components/Modals';
import type {
  ActiveRouteInfo,
  AreaPreset,
  CameraTarget,
  CategoryId,
  CategoryMatchMode,
  ChainId,
  MapBounds,
  MapEngineType,
  OriginLocation,
  Shop,
  SortByMode,
  SubCategoryId,
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
type MobileTabType = 'options' | 'split' | 'map' | 'list';

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

  /**
   * 地図カメラをプログラムから移動（パン・ズーム）させるための命令オブジェクト。
   * 店舗カード選択、エリアプリセット選択、GPS現在地取得などの操作に応じて更新されます。
   *
   * @param lat - 移動先中心の緯度（10進法表記の北緯度数、例: 35.698）
   * @param lng - 移動先中心の経度（10進法表記の東経度数、例: 139.773）
   * @param zoom - 変更後の推奨ズームレベル（1〜20、省略時は現在のズームを維持）
   * @param seq - 同一座標への再要求時にも確実にReactのuseEffectを発火させるための更新シーケンス番号
   */
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>({
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
  const [departureTimeMode, setDepartureTimeMode] = useState<'now' | 'custom'>(initialPrefs.departureTimeMode || 'now');
  /** 任意指定の出発時刻文字列（`"HH:MM"` 形式） */
  const [customDepartureTime, setCustomDepartureTime] = useState<string>(() => {
    if (initialPrefs.customDepartureTime) return initialPrefs.customDepartureTime;
    /** 現在時刻を取得して初期出発時刻（HH:mm）を生成 */
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  /** 現在時刻の0:00からの経過分数（1分ごとに自動更新） */
  const [nowMinutesOfDay, setNowMinutesOfDay] = useState<number>(() => {
    /** 現在時刻から当日の0:00起点経過分数を計算 */
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  /** ONになっているチェーンIDのSet */
  const [enabledChains, setEnabledChains] = useState<Set<ChainId>>(
    () => new Set(initialPrefs.enabledChains)
  );
  /** ONになっている詳細サブジャンルIDのSet（27区分） */
  const [enabledSubCategories, setEnabledSubCategories] = useState<Set<SubCategoryId>>(
    () => new Set(initialPrefs.enabledSubCategories || SUB_CATEGORIES.map((s) => s.id))
  );
  /** ONになっている親カテゴリIDのSet（有効な詳細サブジャンルから自動導出） */
  const enabledCategories = useMemo<Set<CategoryId>>(
    () => new Set(deriveParentCategoriesFromSubCategories(Array.from(enabledSubCategories))),
    [enabledSubCategories]
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
  const [routeCache, setRouteCache] = useState<
    Map<string, { minutes: number; distanceKm: number; trafficConsidered: boolean; calculatedAt: number }>
  >(() => new Map());

  /** 現在選択中の店舗ID */
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  /** 巡回（ハシゴ）ルートに追加された店舗ID配列 */
  const [tourShopIds, setTourShopIds] = useState<string[]>([]);
  /** ルート案内カードに表示する情報 */
  const [rawActiveRouteInfo, setActiveRouteInfo] = useState<ActiveRouteInfo | null>(null);
  /** 地図上に描画するカスタムルートポリライン座標（OSRM/直線用） */
  const [customRoutePath, setCustomRoutePath] = useState<{
    path: Array<[number, number]>;
    isDashed: boolean;
  } | null>(null);

  /** 左オプションパネルの折りたたみ状態（デスクトップ用） */
  const [isOptionsCollapsed, setIsOptionsCollapsed] = useState<boolean>(false);
  /** モバイル表示時のアクティブタブ */
  const [mobileTab, setMobileTab] = useState<MobileTabType>('split');
  /** オプションを閉じた際に、直前の閲覧レイアウトへ戻すための記録 */
  const lastMobileBrowseTab = useRef<Exclude<MobileTabType, 'options'>>('split');
  if (mobileTab !== 'options') lastMobileBrowseTab.current = mobileTab;
  /** パネル開閉時に地図のリサイズを促すトリガーカウンタ */
  const [resizeTrigger, setResizeTrigger] = useState<number>(0);

  /** APIキー設定モーダルの開閉状態 */
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  /** トースト通知の配列状態 */
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  /** 現在検索する店舗ID。effectのcleanupにより古い検索の表示更新を中止します。 */
  const [routeRequest, setRouteRequest] = useState<{ ids: string[]; isTour: boolean } | null>(null);

  // 現在時刻の分数（nowMinutesOfDay）を30秒ごとに自動更新し、リアルタイム閉店判定を最新に保つ
  useEffect(() => {
    /** 30秒ごとに時計を更新し閉店判定をリアルタイムに追従させるインターバルタイマー */
    const timer = setInterval(() => {
      /** 現在の日時オブジェクト */
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
      /** 指定時刻文字列の「時:分」正規表現マッチング結果 */
      const m = customDepartureTime.match(/^(\d{1,2}):(\d{2})$/);
      if (m) {
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      }
    }
    return nowMinutesOfDay;
  }, [departureTimeMode, customDepartureTime, nowMinutesOfDay]);

  /** 到着予測は現在の出発時刻と取得済み時間から導出し、一覧との不一致を避けます。 */
  const activeRouteInfo = useMemo<ActiveRouteInfo | null>(() => {
    if (!rawActiveRouteInfo) return null;
    return { ...rawActiveRouteInfo, arrivalText: rawActiveRouteInfo.minutes !== undefined && rawActiveRouteInfo.destination
      ? evaluateClosingFeasibility(rawActiveRouteInfo.destination.hours, rawActiveRouteInfo.minutes, effectiveDepartureMinutes).badgeLabel
      : '到着予測を計算中...' };
  }, [rawActiveRouteInfo, effectiveDepartureMinutes]);

  /**
   * 画面右下にトースト通知を3.4秒間表示します。
   *
   * @param message - 表示する通知メッセージ
   */
  const showToast = useCallback((message: string): void => {
    /** 一意なトーストID（タイムスタンプ＋乱数） */
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
      enabledSubCategories: Array.from(enabledSubCategories),
      categoryMatchMode,
      hideClosedOnArrival,
      departureTimeMode, customDepartureTime,
    });
  }, [
    origin,
    travelMode,
    maxMinutes,
    showPinTime,
    showTimeCircles,
    enabledChains,
    enabledCategories,
    enabledSubCategories,
    categoryMatchMode,
    hideClosedOnArrival, departureTimeMode, customDepartureTime,
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
        await loadGoogleMapsSdk(apiKey, () => {
          setMapEngine('leaflet');
          showToast('Google Mapsの認証に失敗したため内蔵マップへ切り替えました');
        });
        setMapEngine('google');
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
    /** アンマウント時の状態更新を防止するフラグ */
    let isMounted = true;
    fetchShopsDatabase().then((shops) => {
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
          /** GPSから取得した現在地北緯 */
          const lat = pos.coords.latitude;
          /** GPSから取得した現在地東経 */
          const lng = pos.coords.longitude;
          setOrigin({ lat, lng, name: '現在地 (GPS)' });
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
   * チェーンフィルタ・詳細サブジャンルフィルタ・所要時間計算・閉店時間（間に合うか）判定・所要時間上限フィルタを適用した全国の該当店舗リスト。
   *
   * 【なぜここで所要時間と閉店判定を付与するか】
   * 出発地やアクセス手段・出発時刻が変更された瞬間に、全国すべての対象店舗の `_travel` プロパティ
   * （推定または実測の所要時間＋閉店時間に間に合うかの判定情報）を一括更新し、地図ピンと右リストの双方に即座に反映させるためです。
   */
  const filteredShops = useMemo<Shop[]>(() => {
    /** 出発地点の座標 */
    const { lat: oLat, lng: oLng } = origin;

    return allShops.reduce<Shop[]>((acc, shop) => {
      // 1. チェーンフィルタ（複合店は併設チェーンのどれか1つでもONなら表示）
      /** 店舗に属するすべてのチェーンIDの配列 */
      const shopChains = shop.chains && shop.chains.length > 0 ? shop.chains : [shop.chain];
      /** 有効チェーンの中に含まれているかどうかの真偽値 */
      const hasChain = shopChains.some((cid) => enabledChains.has(cid));
      if (!hasChain) return acc;

      shop = scopeShopAssortment(shop, enabledChains);

      // 2. 詳細サブジャンル（27区分）フィルタ
      if (!matchesShopCategories(shop, enabledSubCategories, categoryMatchMode)) return acc;

      // 3. 所要時間と距離の算出（実ルートキャッシュがあれば優先利用、なければ速度モデル推計）
      /** ルートキャッシュの一意識別キー文字列 */
      const cacheKey = `${oLat},${oLng}->${shop.id}:${shop.lat},${shop.lng}:${travelMode}:${mapEngine}:${departureTimeMode}:${customDepartureTime}`;
      /** 交通情報の古い値を使い続けないためキャッシュを5分で失効させます。 */
      const cached = routeCache.get(cacheKey);
      /** 5分以内に計算された有効期限内の正確なルート計算結果 */
      const exact = cached && Date.now() - cached.calculatedAt < 300000 ? cached : undefined;
      /** 速度モデルと迂回係数によるリアルタイム概算移動情報 */
      const est = estimateTravelInfo(oLat, oLng, shop.lat, shop.lng, travelMode);

      /** 実ルートキャッシュまたは推計モデルから算出した移動時間・距離の基本情報 */
      const baseTravel = exact
        ? {
            estMinutes: exact.minutes,
            estRoadKm: exact.distanceKm,
            formattedTime: formatDurationMinutes(exact.minutes),
            formattedDist:
              exact.distanceKm < 10
                ? `${exact.distanceKm.toFixed(1)}km`
                : `${Math.round(exact.distanceKm)}km`,
            trafficConsidered: exact.trafficConsidered,
          }
        : est;

      // 4. 所要時間上限フィルタ（150未満のとき）
      if (maxMinutes < 150 && baseTravel.estMinutes > maxMinutes) {
        return acc;
      }

      // 5. 閉店時間に対する間に合う・間に合わない判定
      /** 対象店舗の営業時間・所要時間・出発時刻から算出した閉店到着可否情報 */
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
    enabledSubCategories,
    categoryMatchMode,
    routeCache, mapEngine, departureTimeMode, customDepartureTime,
    effectiveDepartureMinutes,
    hideClosedOnArrival,
  ]);

  /**
   * 現在の地図表示領域（`mapBounds`）およびリスト内テキスト検索で絞り込み、指定ソート順で並べ替えた画面内店舗リスト。
   */
  const viewportShops = useMemo<Shop[]>(() => {
    /** 検索ボックスの入力文字列（小文字化・前後空白除去） */
    const query = listSearchText.trim().toLowerCase();

    /** 地図の現在表示境界および検索キーワードに合致する店舗一覧 */
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
        /** 店名・住所・サブブランドを結合した検索対象文字列 */
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
    setRouteRequest(null);
    setSelectedShopId(null);
    setActiveRouteInfo(null);
    setCustomRoutePath(null);
    if (googleDirRendererRef.current) {
      googleDirRendererRef.current.set('directions', null);
    }
  }, []);

  /**
   * 単一店舗への検索要求を更新します。
   * @param shop - 選択された店舗
   */
  const calculateAndDisplaySingleRoute = useCallback((shop: Shop): void => {
    setRouteRequest({ ids: [shop.id], isTour: false });
  }, []);

  /**
   * 最近傍順で巡回ルートを計算する要求を登録します。
   * @param ids - 巡回対象の店舗ID
   */
  const calculateAndDisplayTourRoute = useCallback((ids: readonly string[]): void => {
    setRouteRequest({ ids: [...ids], isTour: true });
  }, []);

  // 条件変更時にも再検索し、cleanupで前の応答を破棄する。時計更新だけでは課金APIを再呼出ししない。
  useEffect(() => {
    if (!routeRequest) return;
    /** 古い応答の反映と通信を中止する制御 */
    const controller = new AbortController();
    /** 最新DBから取得した訪問対象 */
    const targets = routeRequest.ids.map(id => allShops.find(shop => shop.id === id)).filter((shop): shop is Shop => Boolean(shop));
    if (!targets.length) { setActiveRouteInfo(null); setCustomRoutePath(null); return; }
    /** 訪問順。単一店舗選択では余計な最適化を行いません。 */
    const ordered = routeRequest.isTour ? optimizeTourOrder(origin, targets) : targets;
    /** 最終到着店舗 */
    const destination = ordered[ordered.length - 1];
    /** 選択した移動手段 */
    const mode = TRAVEL_MODE_MAP[travelMode];
    /** URLの経由地はパラメータとして正しくエンコードします。 */
    const params = new URLSearchParams({ api: '1', origin: origin.lat + ',' + origin.lng,
      destination: destination.lat + ',' + destination.lng, travelmode: mode.googleMode.toLowerCase() });
    if (ordered.length > 1) params.set('waypoints', ordered.slice(0, -1).map(shop => shop.lat + ',' + shop.lng).join('|'));
    if (mode.avoidTolls) params.set('avoid', 'tolls,highways');
    /** Yahoo!カーナビ専用のURLスキーム（経由地対応） */
    let yahooNavUrl: string;
    if (ordered.length > 1) {
      const pts = ['point=' + origin.lat + ',' + origin.lng];
      for (const wp of ordered.slice(0, -1).slice(0, 3)) {
        pts.push('point=' + wp.lat + ',' + wp.lng);
      }
      pts.push('point=' + destination.lat + ',' + destination.lng);
      yahooNavUrl = 'yjcarnavi://navi/select?' + pts.join('&') + '&name=' + encodeURIComponent(destination.name);
    } else {
      yahooNavUrl = 'yjcarnavi://navi/select?lat=' + destination.lat + '&lon=' + destination.lng + '&name=' + encodeURIComponent(destination.name);
    }
    /** Appleマップ経路案内URL（iOS端末でマップアプリが直接起動） */
    const appleModeFlag = mode.googleMode === 'TRANSIT' ? 'r' : mode.googleMode === 'WALKING' ? 'w' : 'd';
    const appleMapsNavUrl = 'https://maps.apple.com/?saddr=' + origin.lat + ',' + origin.lng + '&daddr=' + destination.lat + ',' + destination.lng + '&dirflg=' + appleModeFlag + '&q=' + encodeURIComponent(destination.name);

    /** 検索中・結果で共有するカード情報 */
    const card = { modeBadge: mode.icon + ' ' + mode.name, title: origin.name + ' ➔ ' + (ordered.length > 1 ? ordered.length + '店舗巡回' : destination.name),
      googleMapsNavUrl: 'https://www.google.com/maps/dir/?' + params.toString(), yahooNavUrl, appleMapsNavUrl, waypoints: routeRequest.isTour ? ordered : [], destination };
    setCustomRoutePath(null);
    googleDirRendererRef.current?.set('directions', null);
    setActiveRouteInfo({ ...card, durationText: '計算中...', distanceText: '--', engineText: 'ルート検索中...' });
    /** APIの出発日時。過去の指定時刻は翌日に補正します。 */
    const departure = getDepartureDate(departureTimeMode, customDepartureTime);
    calculateRoute(origin, ordered, travelMode, departure, mapEngine === 'google' ? googleDirServiceRef.current : null, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setCustomRoutePath({ path: result.path, isDashed: !result.isRoadRoute });
        setActiveRouteInfo({ ...card, minutes: result.minutes, durationText: '約' + formatDurationMinutes(result.minutes),
          distanceText: result.distanceKm.toFixed(1) + 'km', engineText: result.description + '（' +
            new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + '取得）' + (ordered.length > 1 ? '・店内滞在時間は含みません' : '') });
        if (!routeRequest.isTour) {
          /** 出発条件と目的地座標を含め、別条件の推計値を流用しません。 */
          const key = origin.lat + ',' + origin.lng + '->' + destination.id + ':' + destination.lat + ',' + destination.lng + ':' + travelMode + ':' + mapEngine + ':' + departureTimeMode + ':' + customDepartureTime;
          setRouteCache(previous => new Map(previous).set(key, { minutes: result.minutes, distanceKm: result.distanceKm,
            trafficConsidered: result.trafficConsidered, calculatedAt: Date.now() }));
        }
      }).catch(error => {
        if (!controller.signal.aborted) { console.error(error); showToast('ルート検索に失敗しました。再度店舗を選択してください。'); setActiveRouteInfo(null); }
      });
    return () => controller.abort();
  }, [routeRequest, origin, travelMode, mapEngine, departureTimeMode, customDepartureTime, allShops, showToast]);

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
      // 一覧だけを見ている場合も、選択した経路がその場で見える同時表示へ戻す。
      setMobileTab(current => current === 'list' ? 'split' : current);
      setSelectedShopId(shop.id);
      setCameraTarget((prev) => ({
        lat: shop.lat,
        lng: shop.lng,
        seq: prev.seq + 1,
      }));
      calculateAndDisplaySingleRoute(shop);
    },
    [calculateAndDisplaySingleRoute, origin, travelMode]
  );

  /**
   * アクセス手段が変更された際のハンドラ。
   * ルート表示中の場合は新しい移動手段でルートを再計算します。
   *
   * @param modeId - 新しく選択されたアクセス手段ID
   */
  const handleSelectTravelMode = useCallback((modeId: TravelModeId): void => {
    if (TRAVEL_MODE_MAP[modeId]) setTravelMode(modeId);
  }, []);

  /**
   * 巡回（ハシゴ）リストへの店舗追加・解除をトグルするハンドラ。
   *
   * @param shopId - トグル対象の店舗ID
   */
  const handleToggleTourShop = useCallback(
    (shopId: string): void => {
      clearActiveRoute();
      setTourShopIds((prev) => {
        /** 既に追加済みかどうかのインデックス（未追加時は -1） */
        const idx = prev.indexOf(shopId);
        /** 更新後の店舗ID配列 */
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

        return next;
      });
    },
    [showToast, clearActiveRoute]
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
      (pos: GeolocationPosition) => {
        updateOriginLocation(pos.coords.latitude, pos.coords.longitude, '現在地 (GPS)', true, 13);
        showToast('現在地を出発地に設定しました！');
      },
      (err: GeolocationPositionError) => {
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
      /** 国土地理院またはGoogleジオコーディングによる検索結果 */
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
      // 探索結果は閲覧中だけ補完し、次回起動時は自動更新された配布DBを基準にします。
      setAllShops((prev) => [...prev, ...newlyFound]);
      showToast(`✨ 新たに ${newlyFound.length} 店舗を一時表示しました（再読み込みで解除）`);
    } else {
      showToast('このエリアの該当店舗はすでにすべて表示されています！');
    }
  }, [mapBounds, allShops, showToast]);

  return (
    <>
      {/* 1. 上部ヘッダーバー */}
      <HeaderBar
        totalDbCount={allShops.length}
        travelMode={travelMode}
        onSelectTravelMode={handleSelectTravelMode}
        onSelectAreaPreset={(preset: AreaPreset) => {
          updateOriginLocation(preset.lat, preset.lng, preset.name, true, preset.zoom);
        }}
        onScanArea={handleScanCurrentArea}
        onToggleOptionsPanel={() => {
          setIsOptionsCollapsed((prev) => !prev);
          setMobileTab(mobileTab === 'options' ? lastMobileBrowseTab.current : 'options');
          setTimeout(() => setResizeTrigger((c) => c + 1), 280);
        }}
        onOpenApiModal={() => setIsApiModalOpen(true)}
      />

      {/* 2. メインワークスペース（3カラム：左オプション / 中央マップ / 右リスト） */}
      <main className={`app-workspace mobile-view-${mobileTab}`}>
        <OptionsPanel
          isCollapsed={isOptionsCollapsed}
          isMobileVisible={mobileTab === 'options'}
          onClosePanel={() => {
            setIsOptionsCollapsed(true);
            setMobileTab(lastMobileBrowseTab.current);
            setTimeout(() => setResizeTrigger((c) => c + 1), 280);
          }}
          origin={origin}
          isPickingOrigin={isPickingOrigin}
          onUseGpsOrigin={handleUseGpsOrigin}
          onTogglePickOriginMap={() => {
            setIsPickingOrigin((prev) => !prev);
            setMobileTab('map');
          }}
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
          enabledSubCategories={enabledSubCategories}
          onToggleCategory={(catId, enabled) => {
            const parentInfo = CATEGORY_MAP[catId];
            if (!parentInfo) return;
            setEnabledSubCategories((prev) => {
              const next = new Set(prev);
              for (const subId of parentInfo.subCategories) {
                if (enabled) next.add(subId);
                else next.delete(subId);
              }
              return next;
            });
          }}
          onToggleSubCategory={(subCatId, enabled) => {
            setEnabledSubCategories((prev) => {
              const next = new Set(prev);
              if (enabled) next.add(subCatId);
              else next.delete(subCatId);
              return next;
            });
          }}
          onSelectOnlyCategory={(catId) => {
            const parentInfo = CATEGORY_MAP[catId];
            if (!parentInfo) return;
            setEnabledSubCategories(new Set(parentInfo.subCategories));
            showToast(`「${parentInfo.name}」のみに絞り込みました`);
          }}
          onSelectOnlySubCategory={(subCatId) => {
            const subInfo = SUB_CATEGORY_MAP[subCatId];
            setEnabledSubCategories(new Set([subCatId]));
            if (subInfo) {
              showToast(`詳細ジャンル「${subInfo.name}」のみに絞り込みました`);
            }
          }}
          onSetAllCategories={(enableAll) => {
            setEnabledSubCategories(
              enableAll ? new Set(SUB_CATEGORIES.map((s) => s.id)) : new Set()
            );
          }}
          categoryMatchMode={categoryMatchMode}
          onChangeCategoryMatchMode={setCategoryMatchMode}
          allShops={allShops}

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
          onViewportChanged={(_newCenter, _newZoom, newBounds) => {
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
          isMobileVisible={mobileTab === 'list' || mobileTab === 'split'}
          onBackToMapMobile={() => {
            setMobileTab('map');
            setResizeTrigger((c) => c + 1);
          }}
          viewportShops={viewportShops}
          selectedShopId={selectedShopId}
          tourShopIds={tourShopIds}
          travelMode={travelMode}
          enabledSubCategories={enabledSubCategories}
          enabledChains={enabledChains}
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
          onCalculateTourRoute={() => {
            setMobileTab(current => current === 'list' ? 'split' : current);
            calculateAndDisplayTourRoute(tourShopIds);
          }}

        />
      </main>

      {/* 3. モバイル用ボトムナビゲーションバー */}
      <nav className="mobile-bottom-nav" aria-label="モバイル画面切替">
        <button
          type="button"
          id="mob-btn-options"
          className={`mob-nav-btn ${mobileTab === 'options' ? 'active' : ''}`}
          aria-pressed={mobileTab === 'options'}
          onClick={() => {
            setIsOptionsCollapsed(false);
            setMobileTab('options');
          }}
        >
          <span>⚙️</span>
          <span>オプション</span>
        </button>
        <button type="button" id="mob-btn-split"
          className={`mob-nav-btn ${mobileTab === 'split' ? 'active' : ''}`}
          aria-pressed={mobileTab === 'split'} onClick={() => setMobileTab('split')}>
          <span>▤</span><span>地図＋一覧</span>
        </button>
        <button
          type="button"
          id="mob-btn-map"
          className={`mob-nav-btn ${mobileTab === 'map' ? 'active' : ''}`}
          aria-pressed={mobileTab === 'map'}
          onClick={() => {
            setMobileTab('map');
            setResizeTrigger((c) => c + 1);
          }}
        >
          <span>🗺️</span>
          <span>地図のみ</span>
        </button>
        <button
          type="button"
          id="mob-btn-list"
          className={`mob-nav-btn ${mobileTab === 'list' ? 'active' : ''}`}
          aria-pressed={mobileTab === 'list'}
          onClick={() => setMobileTab('list')}
        >
          <span>📋</span>
          <span>
            一覧 (<b id="mob-shop-count">{viewportShops.length.toLocaleString()}</b>)
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
          if (window.google?.maps) window.location.reload();
          else await activateGoogleMapsEngine(key);
        }}
        onClearApiKey={() => {
          setGoogleApiKey('');
          saveGoogleApiKey('');
          setIsApiModalOpen(false);
          window.location.reload();
        }}
      />

      {/* 5. トースト通知コンテナ */}
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
