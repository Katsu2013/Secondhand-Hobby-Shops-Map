const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');

const origin = { name: '出発地', lat: 35, lng: 139 };
const shops = [{ id: 'a', name: 'A', lat: 35.1, lng: 139.1 }, { id: 'b', name: 'B', lat: 35.2, lng: 139.2 }];
const result = (seconds, traffic) => ({ routes: [{ legs: [{ duration: { value: seconds }, distance: { value: 10000 },
  ...(traffic === undefined ? {} : { duration_in_traffic: { value: traffic } }) }],
  overview_path: [{ lat: () => 35, lng: () => 139 }, { lat: () => 35.1, lng: () => 139.1 }] }] });

test('自動車は出発日時・回避条件を送信し、渋滞込みの時間を優先する', async () => {
  const load = createLoader();
  const route = load('src/services/routeService.ts');
  let request;
  const service = { route(req, callback) { request = req; callback(result(600, 1200), 'OK'); } };
  const output = await route.calculateRoute(origin, [shops[0]], 'DRIVING_NO_TOLL', new Date(Date.now() + 60000), service, new AbortController().signal);
  assert.equal(output.minutes, 20);
  assert.equal(output.trafficConsidered, true);
  assert.equal(request.drivingOptions.trafficModel, 'bestguess');
  assert.equal(request.avoidTolls, true);
  assert.equal(request.avoidHighways, true);
  assert.match(output.description, /渋滞考慮/);
});

test('巡回は各区間を取得し、次の出発日時に渋滞込みの時間を累積する', async () => {
  const load = createLoader();
  const route = load('src/services/routeService.ts');
  const requests = [];
  const departure = new Date(Date.now() + 60000);
  const service = { route(req, callback) { requests.push(req); callback(result(300, 600), 'OK'); } };
  const output = await route.calculateRoute(origin, shops, 'DRIVING_TOLL', departure, service, new AbortController().signal);
  assert.equal(output.minutes, 20);
  assert.equal(output.distanceKm, 20);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].drivingOptions.departureTime.getTime() - departure.getTime(), 600000);
  assert.equal(requests[1].origin.lat, shops[0].lat);
});

test('交通予測がない応答は通常時間を使い、渋滞情報なしと表示する', async () => {
  const route = createLoader()('src/services/routeService.ts');
  const service = { route(_req, callback) { callback(result(600), 'OK'); } };
  const output = await route.calculateRoute(origin, [shops[0]], 'DRIVING_TOLL', new Date(), service, new AbortController().signal);
  assert.equal(output.minutes, 10);
  assert.equal(output.trafficConsidered, false);
  assert.match(output.description, /概算.*渋滞情報なし/);
});

test('公共交通には時刻表の出発条件を送り、渋滞考慮として扱わない', async () => {
  const route = createLoader()('src/services/routeService.ts');
  let request;
  const output = await route.calculateRoute(origin, [shops[0]], 'TRANSIT', new Date(), { route(req, callback) {
    request = req; callback(result(900), 'OK');
  } }, new AbortController().signal);
  assert.ok(request.transitOptions.departureTime);
  assert.equal(request.drivingOptions, undefined);
  assert.equal(output.trafficConsidered, false);
});

test('OSRMのdurationを採用し、渋滞未考慮の概算として返す', async () => {
  const load = createLoader({ fetch: async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{
    duration: 6000, distance: 10000, geometry: { coordinates: [[139, 35], [139.1, 35.1]] }
  }] }) }) });
  const output = await load('src/services/routeService.ts').calculateRoute(origin, [shops[0]], 'DRIVING_TOLL', new Date(), null, new AbortController().signal);
  assert.equal(output.minutes, 100);
  assert.equal(output.trafficConsidered, false);
  assert.match(output.description, /概算.*渋滞未考慮/);
});

test('非対応の公共交通・一般道優先を自動車APIへ送らず、全区間を概算する', async () => {
  const load = createLoader({ fetch: async () => { assert.fail('非対応モードで道路APIを呼ばない'); } });
  const maps = load('src/services/mapService.ts');
  const master = load('src/config/shopMaster.ts');
  for (const modeId of ['TRANSIT', 'DRIVING_NO_TOLL']) {
    const output = await maps.fetchOsrmOrFallbackRouteData(origin, shops, master.TRAVEL_MODE_MAP[modeId]);
    const expected = master.estimateTravelInfo(origin.lat, origin.lng, shops[0].lat, shops[0].lng, modeId).estMinutes +
      master.estimateTravelInfo(shops[0].lat, shops[0].lng, shops[1].lat, shops[1].lng, modeId).estMinutes;
    assert.equal(output.minutes, expected);
    assert.equal(output.isRoadRoute, false);
  }
});

test('中止したGoogle検索はフォールバックせず破棄する', async () => {
  const route = createLoader()('src/services/routeService.ts');
  const controller = new AbortController();
  const pending = route.calculateRoute(origin, [shops[0]], 'DRIVING_TOLL', new Date(), { route() {} }, controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('過去の指定時刻は翌日、現在出発は現在以降の日時を使う', () => {
  const route = createLoader()('src/services/routeService.ts');
  const now = new Date(2026, 9, 18, 20, 0);
  assert.equal(route.getDepartureDate('custom', '19:00', now).getDate(), 19);
  assert.ok(route.getDepartureDate('now', '', now).getTime() >= now.getTime());
});

test('翌日11時到着と早朝4時台の深夜営業を正しく判定する', () => {
  const master = createLoader()('src/config/shopMaster.ts');
  assert.equal(master.evaluateClosingFeasibility('10:00-20:00', 720, 1380).status, 'open_ok');
  assert.equal(master.evaluateClosingFeasibility('10:00-29:00', 10, 270).status, 'closing_soon');
});

test('SDK読込後の認証失敗もアプリに通知する', async () => {
  let script;
  let failed = 0;
  const browser = {};
  const maps = createLoader({ window: browser, document: { getElementById: () => null, createElement: () => ({}),
    head: { appendChild: element => { script = element; } } } })('src/services/mapService.ts');
  const pending = maps.loadGoogleMapsSdk('dummy', () => failed++);
  script.onload();
  await pending;
  browser.gm_authFailure();
  assert.equal(failed, 1);
});

test('配布データの不正な営業時間と配列を正規化して起動時の停止を防ぐ', () => {
  const normalize = createLoader()('src/services/shopValidation.ts').normalizeShop;
  const output = normalize({ ...shops[0], chain: 'hardoff', categories: ['retro_game'], chains: 'hardoff', hours: {} });
  assert.equal(output.hours, '');
  assert.equal(output.chains[0], 'hardoff');
  assert.equal(normalize({ ...shops[0], chain: 'hardoff', lat: Infinity }), null);
});


test('現行Routes APIを優先し、交通予測のミリ秒を分へ変換する', async () => {
  let request;
  const modern = { maps: { TravelMode: { DRIVING: 'DRIVING' }, importLibrary: async () => ({ Route: { computeRoutes: async req => {
    request = req;
    return { routes: [{ durationMillis: 1800000, distanceMeters: 9000, path: [{ lat: 35, lng: 139 }, { lat: 35.1, lng: 139.1 }] }] };
  } } }) } };
  const route = createLoader({ window: { google: modern }, google: modern })('src/services/routeService.ts');
  const output = await route.calculateRoute(origin, [shops[0]], 'DRIVING_NO_TOLL', new Date(), { route() { assert.fail('現行API成功時は旧APIを呼ばない'); } }, new AbortController().signal);
  assert.equal(output.minutes, 30);
  assert.equal(output.trafficConsidered, true);
  assert.deepEqual(Array.from(output.path, point => Array.from(point)), [[35, 139], [35.1, 139.1]]);
  assert.equal(request.routingPreference, 'TRAFFIC_AWARE_OPTIMAL');
  assert.equal(request.routeModifiers.avoidTolls, true);
});

test('StrictModeの同時SDKロードを共有し、認証失敗は最新の呼出し元へ通知する', async () => {
  let script;
  let inserts = 0;
  let notified = '';
  const browser = {};
  const maps = createLoader({ window: browser, document: { getElementById: () => null, createElement: () => ({}),
    head: { appendChild: element => { inserts++; script = element; } } } })('src/services/mapService.ts');
  const a = maps.loadGoogleMapsSdk('dummy', () => notified = 'old');
  const b = maps.loadGoogleMapsSdk('dummy', () => notified = 'new');
  assert.equal(a, b);
  assert.equal(inserts, 1);
  script.onload(); await b; browser.gm_authFailure();
  assert.equal(notified, 'new');
});
