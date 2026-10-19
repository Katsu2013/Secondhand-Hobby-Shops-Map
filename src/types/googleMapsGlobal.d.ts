/**
 * @file src/types/googleMapsGlobal.d.ts
 * @description ブラウザの `window` オブジェクト上に動的にロードされる Google Maps JavaScript API (`google.maps`) のグローバル型宣言。
 *
 * 【なぜこの定義が必要か】
 * 本アプリケーションでは Google Maps JavaScript API をスクリプトタグで動的にロードするため、
 * グローバルスコープの `google.maps` 名前空間および `window.google` を TypeScript の厳格型チェック（`strict: true`）下で
 * 安全に参照できるように宣言しています。
 */

declare namespace google.maps {
  /** 現行Routesライブラリの動的ロード。 */
  function importLibrary(name: 'routes'): Promise<{ Route: typeof routes.Route }>;
  namespace routes {
    /** 現行Routes APIへ送る条件。必要な取得項目だけを指定します。 */
    interface ComputeRoutesRequest {
      /** 出発地 */
      origin: DirectionsRequest['origin'];
      /** 目的地 */
      destination: DirectionsRequest['destination'];
      /** 移動手段 */
      travelMode: string;
      /** 取得する項目 */
      fields: string[];
      /** 出発日時 */
      departureTime?: Date;
      /** 自動車での交通予測 */
      routingPreference?: 'TRAFFIC_AWARE_OPTIMAL';
      /** 道路回避設定 */
      routeModifiers?: { avoidHighways: boolean; avoidTolls: boolean };
    }
    /** 現行Routes APIの取得結果。 */
    class Route {
      /** 移動時間（交通予測を指定した場合は交通状況込み、ミリ秒） */
      durationMillis?: number;
      /** 距離（m） */
      distanceMeters?: number;
      /** 経路形状 */
      path?: Array<LatLng | { lat: number; lng: number }>;
      /** 予測条件を指定して経路を取得します。 */
      static computeRoutes(request: ComputeRoutesRequest): Promise<{ routes?: Route[]; fallbackInfo?: unknown }>;
    }
  }
  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  class LatLngBounds {
    getNorthEast(): LatLng;
    getSouthWest(): LatLng;
  }

  enum ControlPosition {
    BOTTOM_RIGHT = 6,
  }

  interface MapTypeControlOptions {
    position?: ControlPosition;
  }

  interface MapOptions {
    center?: { lat: number; lng: number } | LatLng;
    zoom?: number;
    mapTypeControl?: boolean;
    mapTypeControlOptions?: MapTypeControlOptions;
    streetViewControl?: boolean;
    fullscreenControl?: boolean;
    gestureHandling?: string;
    clickableIcons?: boolean;
  }

  interface MapMouseEvent {
    latLng?: LatLng | null;
  }

  class Map {
    constructor(mapDiv: HTMLElement, opts?: MapOptions);
    getCenter(): LatLng | undefined;
    getZoom(): number | undefined;
    getBounds(): LatLngBounds | undefined;
    panTo(latLng: { lat: number; lng: number } | LatLng): void;
    setZoom(zoom: number): void;
    addListener(eventName: 'idle', handler: () => void): void;
    addListener(eventName: 'click', handler: (e: MapMouseEvent) => void): void;
  }

  namespace event {
    function trigger(instance: object, eventName: string): void;
  }

  enum SymbolPath {
    CIRCLE = 0,
  }

  interface Symbol {
    path: SymbolPath | string;
    scale?: number;
    fillColor?: string;
    fillOpacity?: number;
    strokeColor?: string;
    strokeWeight?: number;
  }

  interface MarkerLabel {
    text: string;
    color?: string;
    fontSize?: string;
    fontWeight?: string;
  }

  interface MarkerOptions {
    position?: { lat: number; lng: number } | LatLng;
    map?: Map | null;
    title?: string;
    zIndex?: number;
    icon?: Symbol | string;
    label?: MarkerLabel | string;
  }

  class Marker {
    constructor(opts?: MarkerOptions);
    setMap(map: Map | null): void;
  }

  interface CircleOptions {
    map?: Map | null;
    center?: { lat: number; lng: number } | LatLng;
    radius?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    fillColor?: string;
    fillOpacity?: number;
    clickable?: boolean;
  }

  class Circle {
    constructor(opts?: CircleOptions);
    setMap(map: Map | null): void;
  }

  interface PolylineOptions {
    path?: Array<{ lat: number; lng: number } | LatLng>;
    geodesic?: boolean;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
    map?: Map | null;
  }

  class Polyline {
    constructor(opts?: PolylineOptions);
    setMap(map: Map | null): void;
  }

  interface MapPanes {
    overlayMouseTarget: HTMLElement;
  }

  interface MapCanvasProjection {
    fromLatLngToDivPixel(latLng: LatLng): { x: number; y: number } | null;
  }

  class OverlayView {
    onAdd(): void;
    draw(): void;
    onRemove(): void;
    setMap(map: Map | null): void;
    getPanes(): MapPanes | null;
    getProjection(): MapCanvasProjection;
  }

  enum TravelMode {
    DRIVING = 'DRIVING',
    TRANSIT = 'TRANSIT',
    BICYCLING = 'BICYCLING',
    WALKING = 'WALKING',
  }

  enum DirectionsStatus {
    OK = 'OK',
  }

  interface DirectionsRequest {
    origin: { lat: number; lng: number } | LatLng | string;
    destination: { lat: number; lng: number } | LatLng | string;
    travelMode: TravelMode;
    avoidHighways?: boolean;
    avoidTolls?: boolean;
    /** 現在または未来の出発時刻と交通予測方式 */
    drivingOptions?: { departureTime: Date; trafficModel: 'bestguess' };
    /** 公共交通の出発時刻 */
    transitOptions?: { departureTime: Date };
  }

  interface DirectionsLeg {
    duration?: { text: string; value: number };
    distance?: { text: string; value: number };
    /** 交通状況を考慮した予測所要時間（取得可能な自動車区間のみ） */
    duration_in_traffic?: { text: string; value: number };
  }

  interface DirectionsRoute {
    legs: DirectionsLeg[];
    /** 全体の経路形状 */
    overview_path?: LatLng[];
  }

  interface DirectionsResult {
    routes: DirectionsRoute[];
  }

  class DirectionsService {
    route(
      request: DirectionsRequest,
      callback: (result: DirectionsResult | null, status: DirectionsStatus) => void
    ): void;
  }

  interface DirectionsRendererOptions {
    map?: Map | null;
    suppressMarkers?: boolean;
    preserveViewport?: boolean;
    polylineOptions?: PolylineOptions;
  }

  class DirectionsRenderer {
    constructor(opts?: DirectionsRendererOptions);
    setDirections(directions: DirectionsResult): void;
    set(key: string, value: unknown): void;
  }

  enum GeocoderStatus {
    OK = 'OK',
  }

  interface GeocoderResult {
    geometry: {
      location: LatLng;
    };
  }

  interface GeocoderRequest {
    address?: string;
    region?: string;
  }

  class Geocoder {
    geocode(
      request: GeocoderRequest,
      callback: (results: GeocoderResult[] | null, status: GeocoderStatus) => void
    ): void;
  }

  namespace places {
    enum PlacesServiceStatus {
      OK = 'OK',
    }

    interface PlaceResult {
      place_id?: string;
      name?: string;
      formatted_address?: string;
      geometry?: {
        location?: LatLng;
      };
    }

    interface TextSearchRequest {
      query: string;
      bounds?: LatLngBounds;
    }

    class PlacesService {
      constructor(attrContainer: Map | HTMLDivElement);
      textSearch(
        request: TextSearchRequest,
        callback: (results: PlaceResult[] | null, status: PlacesServiceStatus) => void
      ): void;
    }
  }
}

interface Window {
  /** Google Maps JavaScript API のグローバル名前空間オブジェクト */
  google?: {
    maps?: typeof google.maps;
  };
  /** Google Maps API 認証エラー時に呼ばれるグローバルコールバック関数 */
  gm_authFailure?: () => void;
}
