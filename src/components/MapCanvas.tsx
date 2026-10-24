/**
 * @file src/components/MapCanvas.tsx
 * @description 地図キャンバス（本家 Google Maps API と OpenStreetMap + Leaflet のハイブリッド描画）、
 * ハードオフアプリ風の縦積み看板バルーンマーカー、出発地からの15/30/60分到達目安サークル、
 * およびルート案内オーバーレイカードを描画・管理するコンポーネント。
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  buildShopBalloonHtml,
  escapeHtml,
  TRAVEL_MODE_MAP,
  TRAVEL_MODES,
} from '../config/shopMaster';
import type {
  ActiveRouteInfo,
  CameraTarget,
  ChainId,
  MapBounds,
  MapEngineType,
  OriginLocation,
  Shop,
  TravelModeId,
} from '../types/shop';

/**
 * Google Maps 上に HTML 吹き出しバルーン（縦積みブランド看板＋所要時間ピル）を描画するための
 * カスタムオーバーレイオブジェクトの操作インターフェース。
 */
export interface GoogleOverlayInstance {
  /** オーバーレイを地図から着脱するメソッド */
  setMap: (map: google.maps.Map | null) => void;
}

/**
 * Google Maps の `google.maps.OverlayView` を継承したカスタムHTMLバルーンオーバーレイを生成します。
 *
 * 【なぜ標準の `google.maps.Marker` ではなく `OverlayView` を使うのか】
 * 標準のピンアイコンでは、ハードオフ公式アプリのような「複数ブランドの横長看板を縦に積み重ねた吹き出しHTML」や
 * ホバー時のアニメーション・所要時間ピルバッジを自由にレイアウトできないため、DOM要素を直接座標投影できる
 * `OverlayView` を用いています。
 *
 * @param map - 描画先の `google.maps.Map` インスタンス
 * @param shop - 描画対象の店舗オブジェクト
 * @param html - バルーン内部のHTML文字列
 * @param isSelected - 現在選択中の店舗かどうか（重なり順 z-index の優先度決定に使用）
 * @param onClick - バルーンがクリックされた際のコールバック関数
 * @returns 生成されたオーバーレイインスタンス
 */
function createGoogleHtmlBalloonOverlay(
  map: google.maps.Map,
  shop: Shop,
  html: string,
  isSelected: boolean,
  onClick: () => void
): GoogleOverlayInstance {
  /**
   * Google Maps `OverlayView` の具象サブクラス。
   */
  class HtmlBalloonOverlay extends google.maps.OverlayView {
    /** 店舗の地理座標 */
    private position: google.maps.LatLng;
    /** 地図ペイン上に配置されるルートDOM要素 */
    private containerDiv: HTMLDivElement | null;

    /**
     * コンストラクタ：店舗の緯度・経度から `google.maps.LatLng` を初期化します。
     */
    constructor() {
      super();
      this.position = new google.maps.LatLng(shop.lat, shop.lng);
      this.containerDiv = null;
    }

    /**
     * オーバーレイが地図に追加された際に呼ばれるライフサイクルメソッド。
     * バルーンのDOM要素を生成し、`overlayMouseTarget` ペインに追加してクリックイベントを登録します。
     */
    override onAdd(): void {
      this.containerDiv = document.createElement('div');
      this.containerDiv.style.position = 'absolute';
      this.containerDiv.style.zIndex = isSelected ? '5000' : '200';
      this.containerDiv.innerHTML = html;
      this.containerDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      const panes = this.getPanes();
      panes?.overlayMouseTarget.appendChild(this.containerDiv);
    }

    /**
     * 地図のズームや移動に伴って再描画が必要になった際に呼ばれるライフサイクルメソッド。
     * 緯度・経度を画面上のピクセル座標へ変換し、DOM要素の `left` / `top` を更新します。
     */
    override draw(): void {
      if (!this.containerDiv) return;
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(this.position);
      if (point) {
        this.containerDiv.style.left = `${point.x}px`;
        this.containerDiv.style.top = `${point.y}px`;
      }
    }

    /**
     * オーバーレイが地図から削除される際に呼ばれるライフサイクルメソッド。
     * メモリリークを防ぐためDOM要素を親ノードから確実に除去します。
     */
    override onRemove(): void {
      if (this.containerDiv && this.containerDiv.parentNode) {
        this.containerDiv.parentNode.removeChild(this.containerDiv);
        this.containerDiv = null;
      }
    }
  }

  /** 生成したカスタムバルーンオーバーレイインスタンス */
  const overlay = new HtmlBalloonOverlay();
  overlay.setMap(map);
  return overlay;
}

/**
 * `MapCanvas` コンポーネントのPropsインターフェース。
 */
export interface MapCanvasProps {
  /** 現在のマップエンジン（`'google'` または `'leaflet'`） */
  mapEngine: MapEngineType;
  /**
   * 地図の中心座標と推奨ズームレベル、および同一座標への再移動を検知する更新シーケンス番号。
   * エリアプリセット選択時、店舗カードクリック時、出発地ジャンプ時などに親コンポーネントから渡されます。
   */
  cameraTarget: CameraTarget;
  /** 出発地の座標と名称 */
  origin: OriginLocation;
  /** 地図クリックで出発地を指定するモードかどうか */
  isPickingOrigin: boolean;
  /** 出発地指定モードをキャンセルするコールバック */
  onCancelPickOrigin: () => void;
  /** 地図上がクリックされて新しい出発地が指定された際のコールバック */
  onPickOriginOnMap: (lat: number, lng: number) => void;
  /** 地図の移動またはズームが完了し、表示領域（Bounds）と中心座標が変化した際のコールバック */
  onViewportChanged: (center: { lat: number; lng: number }, zoom: number, bounds: MapBounds) => void;
  /** 現在の画面内にあり描画対象となる店舗リスト */
  viewportShops: readonly Shop[];
  /** 全フィルタを通過した全国の店舗総数（上部ステータスピル表示用） */
  totalFilteredCount: number;
  /** 現在選択中の店舗ID */
  selectedShopId: string | null;
  /** 現在ONになっているチェーンIDのSet */
  enabledChains: ReadonlySet<ChainId>;
  /** 現在のアクセス手段ID */
  travelMode: TravelModeId;
  /** ピン上の所要時間バッジを表示するかどうか */
  showPinTime: boolean;
  /** 出発地からの15/30/60分到達目安サークルを表示するかどうか */
  showTimeCircles: boolean;
  /** 店舗バルーンをクリックした際のコールバック */
  onSelectShop: (shop: Shop) => void;
  /** 「このエリアの店舗をさらに探索」フローティングボタンのコールバック */
  onScanArea: () => void;
  /** アクティブなルート案内カード情報（非表示時は `null`） */
  activeRouteInfo: ActiveRouteInfo | null;
  /** ルート案内カードを閉じるコールバック */
  onCloseRouteCard: () => void;
  /** OSRMまたは直線フォールバックで描画するポリライン座標配列（Google Directions描画時は `null`） */
  customRoutePath: { path: Array<[number, number]>; isDashed: boolean } | null;
  /** Google Maps インスタンスが準備完了した際に親へ参照を渡すコールバック */
  onGoogleMapReady: (
    map: google.maps.Map,
    directionsService: google.maps.DirectionsService,
    directionsRenderer: google.maps.DirectionsRenderer
  ) => void;
  /** レイアウト変更時（左パネル開閉時など）に地図サイズ再計算をトリガーするカウンタ */
  resizeTrigger: number;
}

/**
 * 地図キャンバス本体とフローティングUI（統計ピル・探索ボタン・ルート案内カード）を描画するReact関数コンポーネント。
 *
 * @param props - `MapCanvasProps` オブジェクト
 * @returns 地図セクションのJSX要素
 */
export const MapCanvas: React.FC<MapCanvasProps> = ({
  mapEngine,
  cameraTarget,
  origin,
  isPickingOrigin,
  onCancelPickOrigin,
  onPickOriginOnMap,
  onViewportChanged,
  viewportShops,
  totalFilteredCount,
  selectedShopId,
  enabledChains,
  travelMode,
  showPinTime,
  showTimeCircles,
  onSelectShop,
  onScanArea,
  activeRouteInfo,
  onCloseRouteCard,
  customRoutePath,
  onGoogleMapReady,
  resizeTrigger,
}) => {
  /** Google Maps 描画用コンテナDIVの参照 */
  const googleContainerRef = useRef<HTMLDivElement | null>(null);
  /** Leaflet 描画用コンテナDIVの参照 */
  const leafletContainerRef = useRef<HTMLDivElement | null>(null);

  /** Google Maps インスタンスの参照 */
  const googleMapRef = useRef<google.maps.Map | null>(null);
  /** Google Maps 上の店舗バルーンオーバーレイ配列の参照 */
  const googleMarkersRef = useRef<GoogleOverlayInstance[]>([]);
  /** Google Maps 上の出発地マーカーの参照 */
  const googleOriginMarkerRef = useRef<google.maps.Marker | null>(null);
  /** Google Maps 上の到達時間目安サークル配列の参照 */
  const googleCirclesRef = useRef<google.maps.Circle[]>([]);
  /** Google Maps 上のカスタムルートポリラインの参照 */
  const googlePolylineRef = useRef<google.maps.Polyline | null>(null);

  /** Leaflet マップインスタンスの参照 */
  const leafletMapRef = useRef<L.Map | null>(null);
  /** Leaflet 店舗マーカーレイヤーグループの参照 */
  const leafletMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  /** Leaflet 出発地マーカーの参照 */
  const leafletOriginMarkerRef = useRef<L.Marker | null>(null);
  /** Leaflet 到達時間目安サークルレイヤーグループの参照 */
  const leafletCirclesLayerRef = useRef<L.LayerGroup | null>(null);
  /** Leaflet ルートポリラインレイヤーグループの参照 */
  const leafletRouteLayerRef = useRef<L.LayerGroup | null>(null);

  /**
   * イベントリスナー内から最新の `isPickingOrigin` とコールバックを参照するためのRef。
   * なぜ必要か：地図の `click` / `moveend` リスナーを毎回登録し直さずに最新の状態を参照するためです。
   */
  const isPickingOriginRef = useRef<boolean>(isPickingOrigin);
  isPickingOriginRef.current = isPickingOrigin;

  /** 出発地クリック指定ハンドラの最新参照を保持するRef（クロージャの陳腐化を防止） */
  const onPickOriginRef = useRef(onPickOriginOnMap);
  onPickOriginRef.current = onPickOriginOnMap;

  /** 表示領域変更通知ハンドラの最新参照を保持するRef（地図イベントから安全に呼び出す） */
  const onViewportChangedRef = useRef(onViewportChanged);
  onViewportChangedRef.current = onViewportChanged;

  /** 非表示エンジンの遅延イベントで表示範囲を上書きしないための現在マップエンジン値のRef */
  const mapEngineRef = useRef(mapEngine);
  mapEngineRef.current = mapEngine;

  /** 店舗選択ハンドラの最新参照を保持するRef（マーカークリックイベントから最新のコールバックを呼び出す） */
  const onSelectShopRef = useRef(onSelectShop);
  onSelectShopRef.current = onSelectShop;

  // 1. Leaflet マップの初期化（初回マウント時）
  useEffect(() => {
    if (!leafletContainerRef.current || leafletMapRef.current) return;

    /** Leaflet マップインスタンスの初期化 */
    const lMap = L.map(leafletContainerRef.current, {
      center: [cameraTarget.lat, cameraTarget.lng],
      zoom: cameraTarget.zoom || 12,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(lMap);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(lMap);

    leafletCirclesLayerRef.current = L.layerGroup().addTo(lMap);
    leafletRouteLayerRef.current = L.layerGroup().addTo(lMap);
    leafletMarkersLayerRef.current = L.layerGroup().addTo(lMap);
    leafletMapRef.current = lMap;

    /**
     * Leafletの表示領域を取得して親コンポーネントへ通知する内部関数。
     */
    const notifyLeafletViewport = (): void => {
      if (mapEngineRef.current !== 'leaflet' || !leafletContainerRef.current?.clientWidth || !leafletContainerRef.current?.clientHeight) return;
      /** 地図の現在中心座標 */
      const c = lMap.getCenter();
      /** 地図の現在表示境界領域 */
      const b = lMap.getBounds();
      onViewportChangedRef.current(
        { lat: c.lat, lng: c.lng },
        lMap.getZoom(),
        {
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        }
      );
    };

    lMap.on('moveend', notifyLeafletViewport);
    lMap.on('click', (e: L.LeafletMouseEvent) => {
      if (isPickingOriginRef.current && e.latlng) {
        onPickOriginRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    // 初回描画直後にサイズを確定させてから表示領域（Bounds）を通知する
    /** DOM構築完了後に正しいキャンバス寸法で表示領域を通知するための遅延タイマー */
    const initialSizeTimer = setTimeout(() => {
      lMap.invalidateSize();
      notifyLeafletViewport();
    }, 60);

    return () => {
      clearTimeout(initialSizeTimer);
      lMap.remove();
      leafletMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Google Maps モードへの切り替え時の初期化
  useEffect(() => {
    if (mapEngine !== 'google' || !googleContainerRef.current) return;
    if (!window.google || !window.google.maps) return;

    if (!googleMapRef.current) {
      /** Google Maps マップインスタンスの初期化 */
      const gMap = new google.maps.Map(googleContainerRef.current, {
        center: { lat: cameraTarget.lat, lng: cameraTarget.lng },
        zoom: cameraTarget.zoom || 12,
        mapTypeControl: true,
        mapTypeControlOptions: {
          position: google.maps.ControlPosition.BOTTOM_RIGHT,
        },
        streetViewControl: true,
        fullscreenControl: false,
        gestureHandling: 'greedy',
        clickableIcons: false,
      });

      /** Google Maps ルート探索サービスクライアント */
      const dirService = new google.maps.DirectionsService();
      /** Google Maps ルート描画レンダラー */
      const dirRenderer = new google.maps.DirectionsRenderer({
        map: gMap,
        suppressMarkers: true,
        preserveViewport: false,
        polylineOptions: {
          strokeColor: '#2563eb',
          strokeOpacity: 0.88,
          strokeWeight: 6,
        },
      });

      gMap.addListener('idle', () => {
        if (mapEngineRef.current !== 'google') return;
        /** Google Maps の現在中心座標 */
        const c = gMap.getCenter();
        /** Google Maps の現在表示境界領域 */
        const b = gMap.getBounds();
        if (c && b) {
          /** 北東端の緯度経度 */
          const ne = b.getNorthEast();
          /** 南西端の緯度経度 */
          const sw = b.getSouthWest();
          onViewportChangedRef.current(
            { lat: c.lat(), lng: c.lng() },
            gMap.getZoom() || 12,
            {
              north: ne.lat(),
              south: sw.lat(),
              east: ne.lng(),
              west: sw.lng(),
            }
          );
        }
      });

      gMap.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (isPickingOriginRef.current && e.latLng) {
          onPickOriginRef.current(e.latLng.lat(), e.latLng.lng());
        }
      });

      googleMapRef.current = gMap;
      onGoogleMapReady(gMap, dirService, dirRenderer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEngine]);


  // 3. カメラ移動命令（エリアジャンプ・出発地移動・店舗フォーカス）の反映
  useEffect(() => {
    if (cameraTarget.seq === 0) return;
    if (mapEngine === 'google' && googleMapRef.current) {
      googleMapRef.current.panTo({ lat: cameraTarget.lat, lng: cameraTarget.lng });
      if (cameraTarget.zoom) {
        googleMapRef.current.setZoom(cameraTarget.zoom);
      }
    } else if (leafletMapRef.current) {
      leafletMapRef.current.setView(
        [cameraTarget.lat, cameraTarget.lng],
        cameraTarget.zoom || leafletMapRef.current.getZoom()
      );
    }
  }, [cameraTarget, mapEngine]);

  /** 分割表示・回転・パネル開閉による実際の領域変化を監視する地図の外枠 */
  const mapStageRef = useRef<HTMLElement | null>(null);

  // 初期表示から分割表示へ切り替えても、両エンジンのタイル・中心・範囲を更新する。
  useEffect(() => {
    if (!mapStageRef.current) return;
    /** 同じフレーム内の複数サイズ通知をまとめる描画予約 */
    let frame = 0;
    /** 画面回転や分割レイアウトの確定後に地図の寸法を合わせる監視 */
    const observer = new ResizeObserver(entries => {
      if (!entries.some(entry => entry.contentRect.width > 0 && entry.contentRect.height > 0)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (mapEngine === 'leaflet') leafletMapRef.current?.invalidateSize();
        else if (googleMapRef.current && window.google?.maps) google.maps.event.trigger(googleMapRef.current, 'resize');
      });
    });
    observer.observe(mapStageRef.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [mapEngine]);

  // 4. パネル開閉時の地図サイズ再計算
  useEffect(() => {
    if (mapEngine === 'leaflet' && leafletMapRef.current) {
      leafletMapRef.current.invalidateSize();
    } else if (mapEngine === 'google' && googleMapRef.current && window.google?.maps) {
      google.maps.event.trigger(googleMapRef.current, 'resize');
    }
  }, [resizeTrigger, mapEngine]);

  // 5. 出発地ピン ＆ 15分/30分/60分到達目安サークルの描画更新
  useEffect(() => {
    /** 出発地の緯度・経度・名称の分割代入 */
    const { lat, lng, name } = origin;
    /** 現在選択されている移動手段の定義オブジェクト（未定義時は車輪・一般道） */
    const mode = TRAVEL_MODE_MAP[travelMode] || TRAVEL_MODES[0];

    /**
     * 15分、30分、60分で到達できるおおよその直線半径（メートル）を移動手段の速度モデルから算出。
     * 準備時間（駐車出庫・駅待ち）を減算し、迂回係数を考慮して直線距離へ換算します。
     */
    const circleSpecs = [15, 30, 60].map((mins) => {
      /** 初期準備時間を差し引いた実効走行/歩行時間（最低2分確保） */
      const effMinutes = Math.max(2, mins - mode.startupMinutes);
      /** 25分を超える中長距離区間では高速道路等の巡航速度を加味した平均移動速度 */
      const speed = mins > 25 ? (mode.baseSpeedKmh + mode.highwaySpeedKmh) / 2 : mode.baseSpeedKmh;
      /** 推定実道路走行距離（km） */
      const roadKm = (effMinutes / 60) * speed;
      /** 迂回係数で割戻した直線到達半径（メートル） */
      const straightMeters = Math.round((roadKm / mode.detourFactor) * 1000);
      return { mins, radius: straightMeters };
    });

    /** 15分圏（緑）、30分圏（青）、60分圏（黄・アンバー）のカラーパレット配列 */
    const colors = ['#10b981', '#3b82f6', '#f59e0b'];

    if (mapEngine === 'google' && googleMapRef.current && window.google?.maps) {
      if (googleOriginMarkerRef.current) {
        googleOriginMarkerRef.current.setMap(null);
      }
      googleCirclesRef.current.forEach((c) => c.setMap(null));
      googleCirclesRef.current = [];

      googleOriginMarkerRef.current = new google.maps.Marker({
        position: { lat, lng },
        map: googleMapRef.current,
        title: `出発地: ${name}`,
        zIndex: 9999,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#0f172a',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        label: {
          text: '出',
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 'bold',
        },
      });

      if (showTimeCircles) {
        circleSpecs.forEach((spec, idx) => {
          /** Google Maps 到達目安サークルオーバーレイ */
          const circle = new google.maps.Circle({
            map: googleMapRef.current,
            center: { lat, lng },
            radius: spec.radius,
            strokeColor: colors[idx],
            strokeOpacity: 0.45,
            strokeWeight: 1.5,
            fillColor: colors[idx],
            fillOpacity: 0.04,
            clickable: false,
          });
          googleCirclesRef.current.push(circle);
        });
      }
    } else if (leafletMapRef.current && leafletCirclesLayerRef.current) {
      if (leafletOriginMarkerRef.current) {
        leafletMapRef.current.removeLayer(leafletOriginMarkerRef.current);
      }
      leafletCirclesLayerRef.current.clearLayers();

      /** Leaflet用のHTMLリッチ出発地マーカーアイコン */
      const originIcon = L.divIcon({
        className: 'origin-custom-div',
        html: `
          <div class="origin-pin-marker">
            <div class="origin-pin-bubble">🚩 出発地: ${escapeHtml(name)}</div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      leafletOriginMarkerRef.current = L.marker([lat, lng], {
        icon: originIcon,
        zIndexOffset: 9000,
      }).addTo(leafletMapRef.current);

      if (showTimeCircles) {
        circleSpecs.forEach((spec, idx) => {
          L.circle([lat, lng], {
            radius: spec.radius,
            color: colors[idx],
            weight: 1.5,
            opacity: 0.5,
            fillColor: colors[idx],
            fillOpacity: 0.04,
            dashArray: '5, 5',
            interactive: false,
          })
            .bindTooltip(`${mode.icon} 約${spec.mins}分圏`, { permanent: false })
            .addTo(leafletCirclesLayerRef.current!);
        });
      }
    }
  }, [origin, travelMode, showTimeCircles, mapEngine]);

  // 6. 画面内の店舗バルーンマーカー（最大200件）の描画更新
  useEffect(() => {
    /** 描画負荷を抑えるためソート上位200件に制限した店舗リスト */
    const shopsToRender = viewportShops.slice(0, 200);

    if (mapEngine === 'google' && googleMapRef.current && window.google?.maps) {
      googleMarkersRef.current.forEach((m) => m.setMap(null));
      googleMarkersRef.current = [];

      shopsToRender.forEach((shop) => {
        /** 店舗が現在選択中かどうか */
        const isSelected = shop.id === selectedShopId;
        /** 看板プレート・バッジ・所要時間ピルを含むバルーンHTML文字列 */
        const html = buildShopBalloonHtml(
          shop,
          isSelected,
          enabledChains,
          travelMode,
          showPinTime
        );
        /** Google Maps OverlayView カスタムマーカー */
        const overlay = createGoogleHtmlBalloonOverlay(
          googleMapRef.current!,
          shop,
          html,
          isSelected,
          () => onSelectShopRef.current(shop)
        );
        googleMarkersRef.current.push(overlay);
      });
    } else if (leafletMapRef.current && leafletMarkersLayerRef.current) {
      leafletMarkersLayerRef.current.clearLayers();

      shopsToRender.forEach((shop) => {
        /** 店舗が現在選択中かどうか */
        const isSelected = shop.id === selectedShopId;
        /** 看板プレート・バッジ・所要時間ピルを含むバルーンHTML文字列 */
        const html = buildShopBalloonHtml(
          shop,
          isSelected,
          enabledChains,
          travelMode,
          showPinTime
        );

        /** Leaflet 用の HTML DivIcon マーカー */
        const icon = L.divIcon({
          className: 'shop-custom-pin',
          html,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        /** Leaflet マーカーインスタンス */
        const marker = L.marker([shop.lat, shop.lng], {
          icon,
          zIndexOffset: isSelected ? 4000 : 100,
        });

        marker.on('click', () => {
          onSelectShopRef.current(shop);
        });

        marker.addTo(leafletMarkersLayerRef.current!);
      });
    }
  }, [viewportShops, selectedShopId, enabledChains, travelMode, showPinTime, mapEngine]);

  // 7. OSRMまたはフォールバック直線のルートポリライン描画更新
  useEffect(() => {
    if (leafletRouteLayerRef.current) {
      leafletRouteLayerRef.current.clearLayers();
    }
    if (googlePolylineRef.current) {
      googlePolylineRef.current.setMap(null);
      googlePolylineRef.current = null;
    }

    if (!customRoutePath) return;

    if (mapEngine === 'google' && googleMapRef.current && window.google?.maps) {
      googlePolylineRef.current = new google.maps.Polyline({
        path: customRoutePath.path.map((p) => ({ lat: p[0], lng: p[1] })),
        geodesic: true,
        strokeColor: '#2563eb',
        strokeOpacity: 0.88,
        strokeWeight: 5,
        map: googleMapRef.current,
      });
    } else if (leafletMapRef.current && leafletRouteLayerRef.current) {
      L.polyline(customRoutePath.path, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.85,
        dashArray: customRoutePath.isDashed ? '8, 8' : undefined,
      }).addTo(leafletRouteLayerRef.current);
    }
  }, [customRoutePath, mapEngine]);

  /** 現在の移動手段オブジェクト（ステータスバー表示用） */
  const currentModeInfo = TRAVEL_MODE_MAP[travelMode] || TRAVEL_MODES[0];

  return (
    <section ref={mapStageRef} className="map-stage" aria-label="ショップマップ">
      {/* 地図上部フローティング情報バー */}
      <div className="map-floating-top">
        <div className="map-stat-pill">
          <span>
            表示中エリア内: <strong id="stat-visible-count">{viewportShops.length.toLocaleString()}</strong> 店舗{viewportShops.length > 200 ? '（ピンは上位200件）' : ''}
          </span>
          <span className="stat-sep">|</span>
          <span>
            全国該当: <strong id="stat-total-filtered">{totalFilteredCount.toLocaleString()}</strong> 店舗
          </span>
          <span className="stat-sep">|</span>
          <span id="stat-current-mode">
            {currentModeInfo.icon} {currentModeInfo.shortName}
          </span>
        </div>

        <button
          id="btn-scan-here-floating"
          type="button"
          className="floating-scan-pill"
          onClick={onScanArea}
        >
          🔍 このエリアの店舗をさらに探索
        </button>
      </div>

      {/* 出発地クリック指定モード中の案内バナー */}
      <div
        id="origin-pick-banner"
        className={`origin-pick-banner ${isPickingOrigin ? '' : 'hidden'}`}
      >
        <span>👆 地図上の好きな場所をクリックすると、そこを「出発地点」に設定します</span>
        <button id="btn-cancel-pick-origin" type="button" onClick={onCancelPickOrigin}>
          キャンセル
        </button>
      </div>

      {/* 地図キャンバス（Google Maps / Leaflet ハイブリッドコンテナ） */}
      <div id="map-container" className="map-canvas-wrap">
        <div
          id="google-map-canvas"
          ref={googleContainerRef}
          className="map-canvas"
          style={{ display: mapEngine === 'google' ? 'block' : 'none' }}
        />
        <div
          id="leaflet-map-canvas"
          ref={leafletContainerRef}
          className="map-canvas"
          style={{ display: mapEngine === 'leaflet' ? 'block' : 'none' }}
        />
      </div>

      {/* ルート案内・店舗詳細オーバーレイカード（下部中央） */}
      <div
        id="route-info-card"
        className={`route-info-card ${activeRouteInfo ? '' : 'hidden'}`}
      >
        {activeRouteInfo && (
          <>
            <div className="route-card-header">
              <div className="route-card-title-wrap">
                <span id="route-card-mode-badge" className="route-mode-badge">
                  {activeRouteInfo.modeBadge}
                </span>
                <h4 id="route-card-title">{activeRouteInfo.title}</h4>
              </div>
              <button
                id="btn-close-route-card"
                type="button"
                className="route-card-close"
                title="ルート表示を消去"
                onClick={onCloseRouteCard}
              >
                ✕
              </button>
            </div>

            <div className="route-card-Body">
              <div className="route-metrics">
                <div className="metric-box">
                  <span className="metric-label">所要時間</span>
                  <strong id="route-card-duration" className="metric-value primary">
                    {activeRouteInfo.durationText}
                  </strong>
                </div>
                <div className="metric-box">
                  <span className="metric-label">移動距離</span>
                  <strong id="route-card-distance" className="metric-value">
                    {activeRouteInfo.distanceText}
                  </strong>
                </div>
                <div className="metric-box">
                  <span className="metric-label">計算方式</span>
                  <span id="route-card-engine" className="metric-sub">
                    {activeRouteInfo.engineText}
                  </span>
                </div>
              </div>

              <div id="route-waypoints-list" className="route-waypoints-list">
                {activeRouteInfo.waypoints.map((wp, idx) => (
                  <div key={wp.id} className="waypoint-step">
                    <strong>{idx + 1}.</strong>
                    <span>{wp.name}</span>
                  </div>
                ))}
              </div>

              <p className="section-desc" id="route-arrival-prediction">{activeRouteInfo.arrivalText}</p>
              <div className="route-card-actions">
                <a
                  id="link-open-gmaps-nav"
                  href={activeRouteInfo.googleMapsNavUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gmaps-ext-btn nav-btn-gmaps"
                  title="Googleマップでナビを開始"
                >
                  <span>🗺️</span> Googleマップ
                </a>
                {activeRouteInfo.yahooNavUrl && (
                  <a
                    id="link-open-yahoo-nav"
                    href={activeRouteInfo.yahooNavUrl}
                    className="gmaps-ext-btn nav-btn-yahoo"
                    title="Yahoo!カーナビアプリを起動して渋滞回避ナビを開始"
                  >
                    <span>🚗</span> Yahoo!カーナビ
                  </a>
                )}
                {activeRouteInfo.appleMapsNavUrl && (
                  <a
                    id="link-open-apple-nav"
                    href={activeRouteInfo.appleMapsNavUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gmaps-ext-btn nav-btn-apple"
                    title="Appleマップでナビを開始"
                  >
                    <span>🍏</span> Appleマップ
                  </a>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
