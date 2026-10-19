/**
 * @file 路線・交通予測の取得と、取得条件を利用者へ伝えるためのルートサービス。
 * 道路形状の取得と交通予測の取得を分け、推計を実測として扱わないために使用します。
 */
import { TRAVEL_MODE_MAP } from '../config/shopMaster';
import { fetchOsrmOrFallbackRouteData } from './mapService';
import type { OriginLocation, Shop, TravelModeId } from '../types/shop';

/** ルート描画と所要時間表示に必要な取得結果。 */
export interface RouteResult {
  /** 全区間の移動時間（分）。滞在時間は含みません。 */
  minutes: number;
  /** 全区間の距離（km） */
  distanceKm: number;
  /** 経路の描画座標 */
  path: Array<[number, number]>;
  /** 経路形状を取得できたか */
  isRoadRoute: boolean;
  /** 全区間で交通予測を取得できたか */
  trafficConsidered: boolean;
  /** 算出条件と制限の説明 */
  description: string;
}

/**
 * Googleに渡せる現在または未来の出発時刻を生成します。
 * @param mode - 出発時刻の指定方式
 * @param time - 指定時刻（HH:mm）。過去の時刻は翌日の出発として扱います。
 * @param now - 基準時刻
 * @returns APIに渡す出発日時
 */
export function getDepartureDate(mode: 'now' | 'custom', time: string, now = new Date()): Date {
  /** APIが過去時刻と判定しないよう、現在出発には数秒の余裕を設けます。 */
  const departure = new Date(now.getTime() + 5000);
  if (mode === 'custom' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    /** 指定された時・分 */
    const [hours, minutes] = time.split(':').map(Number);
    departure.setHours(hours, minutes, 0, 0);
    if (departure.getTime() < now.getTime()) departure.setDate(departure.getDate() + 1);
  }
  return departure;
}

/**
 * Googleのコールバックを中止・タイムアウト可能なPromiseへ変換します。
 * @param service - Google Directionsサービス
 * @param request - 出発条件を含む検索条件
 * @param signal - 古い検索の表示更新を中止するシグナル
 * @returns APIのルート結果
 */
function requestGoogleRoute(
  service: google.maps.DirectionsService,
  request: google.maps.DirectionsRequest,
  signal: AbortSignal
): Promise<google.maps.DirectionsResult> {
  return new Promise((resolve, reject) => {
    /** 中止時にイベントとタイマーを除去するための完了処理 */
    const finish = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    };
    /** Googleへの通信自体は中止できなくても結果を破棄します。 */
    const abort = (): void => { finish(); reject(new DOMException('中止', 'AbortError')); };
    /** 応答がない場合でも概算表示へ戻すためのタイマー */
    const timer = setTimeout(() => { finish(); reject(new Error('Googleルート検索タイムアウト')); }, 20000);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    /** 既存のDirections APIを利用できるプロジェクトとの互換処理。 */
    const legacy = (): void => {
      if (signal.aborted) return;
      try {
        service.route(request, (result, status) => {
          finish();
          if (signal.aborted) return;
          if (status === 'OK' && result?.routes?.[0]?.legs?.[0]) resolve(result);
          else reject(new Error(`Googleルート検索: ${status}`));
        });
      } catch (error) { finish(); reject(error); }
    };
    // 新しいGoogleプロジェクトではLegacy APIを有効化できないため、現行Routes APIを優先する。
    if (typeof window.google?.maps?.importLibrary === 'function') {
      google.maps.importLibrary('routes').then(library => {
        if (signal.aborted) throw new DOMException('中止', 'AbortError');
        return library.Route.computeRoutes({ origin: request.origin, destination: request.destination,
          travelMode: request.travelMode, fields: ['durationMillis', 'distanceMeters', 'path'],
          ...(request.drivingOptions ? { departureTime: request.drivingOptions.departureTime,
            routingPreference: 'TRAFFIC_AWARE_OPTIMAL' as const,
            routeModifiers: { avoidHighways: Boolean(request.avoidHighways), avoidTolls: Boolean(request.avoidTolls) } } : {}),
          ...(request.transitOptions ? { departureTime: request.transitOptions.departureTime } : {}) });
      }).then(response => {
        if (signal.aborted) return;
        /** 旧・新APIの単位差を吸収して、同じ経路計算ロジックを使用します。 */
        const route = response.routes?.[0];
        if (!route || !Number.isFinite(route.durationMillis) || !Number.isFinite(route.distanceMeters) || !route.path?.length) {
          throw new Error('Routes APIの応答が不完全です');
        }
        finish();
        // 現行APIは数値プロパティのLatLngAltitude、旧APIはlat()/lng()。
        // 旧APIの形へ合わせないと交通予測の取得成功後に概算へ落ちてしまう。
        resolve({ routes: [{ overview_path: route.path.map(point => ({
          lat: () => typeof point.lat === 'function' ? point.lat() : point.lat,
          lng: () => typeof point.lng === 'function' ? point.lng() : point.lng,
        })), legs: [{
          duration: { text: '', value: route.durationMillis! / 1000 },
          distance: { text: '', value: route.distanceMeters! },
          // 指定した予測条件からフォールバックした場合は、渋滞考慮済みと表示しない。
          ...(request.drivingOptions && !response.fallbackInfo
            ? { duration_in_traffic: { text: '', value: route.durationMillis! / 1000 } } : {}),
        }] }] });
      }).catch(error => {
        if (!signal.aborted) { console.warn('Routes APIを取得できないため互換APIを試します:', error); legacy(); }
      });
    } else legacy();
  });
}

/**
 * 巡回も区間ごとに交通予測を取得します。途中停車を含む一括検索では
 * duration_in_trafficが返らないため、前区間の到着予測を次の出発時刻にします。
 * @param origin - 出発地点
 * @param shops - 訪問順の店舗
 * @param modeId - 移動手段
 * @param departure - 最初の出発日時
 * @param service - Googleサービス。未設定時は内蔵の概算へフォールバックします。
 * @param signal - 中止シグナル
 * @returns 移動時間、形状と取得条件
 */
export async function calculateRoute(
  origin: OriginLocation, shops: readonly Shop[], modeId: TravelModeId,
  departure: Date, service: google.maps.DirectionsService | null, signal: AbortSignal
): Promise<RouteResult> {
  /** 選択した移動モード */
  const mode = TRAVEL_MODE_MAP[modeId];
  if (service && shops.length > 0) {
    try {
      /** 区間の始点 */
      let start = { lat: origin.lat, lng: origin.lng };
      /** 以降の区間に累積する秒数 */
      let seconds = 0;
      /** 全区間の合計距離 */
      let distanceKm = 0;
      /** 交通予測が取得できた区間数 */
      let trafficLegs = 0;
      /** 全区間を連結した形状 */
      const path: Array<[number, number]> = [];
      for (const shop of shops) {
        if (signal.aborted) throw new DOMException('中止', 'AbortError');
        /** 経由店での買物時間を含めず、移動だけの到着時刻を使用します。 */
        const legDeparture = new Date(Math.max(departure.getTime() + seconds * 1000, Date.now() + 5000));
        /** モードごとの出発時刻・道路回避条件 */
        const request: google.maps.DirectionsRequest = {
          origin: start, destination: { lat: shop.lat, lng: shop.lng },
          travelMode: google.maps.TravelMode[mode.googleMode],
          avoidHighways: mode.avoidHighways, avoidTolls: mode.avoidTolls,
          ...(mode.googleMode === 'DRIVING' ? { drivingOptions: { departureTime: legDeparture, trafficModel: 'bestguess' as const } } : {}),
          ...(mode.googleMode === 'TRANSIT' ? { transitOptions: { departureTime: legDeparture } } : {}),
        };
        /** Googleが返した1区間分の経路 */
        const route = (await requestGoogleRoute(service, request, signal)).routes[0];
        /** 停車のない1区間の時間・距離 */
        const leg = route.legs[0];
        /** 自動車以外の結果を交通予測ありと誤認しないための分岐 */
        const traffic = mode.googleMode === 'DRIVING' ? leg.duration_in_traffic?.value : undefined;
        /** 交通予測がない場合は通常の経路推計を使い、その事実を表示します。 */
        const duration = traffic ?? leg.duration?.value;
        if (!Number.isFinite(duration) || !Number.isFinite(leg.distance?.value) || !route.overview_path?.length) {
          throw new Error('Googleの時間・距離・経路形状が不完全です');
        }
        seconds += duration!;
        distanceKm += leg.distance!.value / 1000;
        if (traffic !== undefined) trafficLegs += 1;
        path.push(...route.overview_path!.map((point): [number, number] => [point.lat(), point.lng()]));
        start = { lat: shop.lat, lng: shop.lng };
      }
      /** 予測の取得条件を、全区間／一部区間／取得不可で区別します。 */
      const description = mode.googleMode === 'DRIVING'
        ? trafficLegs === shops.length ? 'Google交通予測・渋滞考慮' : trafficLegs > 0 ? 'Google経路の概算・一部区間のみ渋滞考慮' : 'Google経路の概算・渋滞情報なし'
        : mode.googleMode === 'TRANSIT' ? 'Google乗換案内の予測・運行遅延未考慮' : 'Google経路に基づく概算';
      return { minutes: Math.max(1, Math.ceil(seconds / 60)), distanceKm, path, isRoadRoute: true,
        trafficConsidered: trafficLegs === shops.length && mode.googleMode === 'DRIVING', description };
    } catch (error) {
      if (signal.aborted) throw error;
      console.warn('Googleルートを取得できないため概算に切り替えます:', error);
    }
  }
  /** 交通情報を持たないサービスからの時間は、常に概算として返します。 */
  const fallback = await fetchOsrmOrFallbackRouteData(origin, shops, mode, signal);
  return { minutes: fallback.minutes, distanceKm: fallback.distanceKm, path: fallback.latLngPath,
    isRoadRoute: fallback.isRoadRoute, trafficConsidered: false, description: fallback.description };
}
