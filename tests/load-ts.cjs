/** 実ソースをメモリで変換し、ネットワークだけを差し替えてNode標準テストで検証する。 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

/** @param {object} overrides テスト用ブラウザ環境 @returns {Function} TSモジュールの読込関数 */
exports.createLoader = function createLoader(overrides = {}) {
  const cache = new Map();
  const browser = { google: { maps: { TravelMode: { DRIVING: 'DRIVING', TRANSIT: 'TRANSIT', WALKING: 'WALKING', BICYCLING: 'BICYCLING' } } } };
  const environment = { console: { ...console, warn() {} }, URLSearchParams, Date, Math,
    setTimeout, clearTimeout, AbortController, DOMException, window: browser, google: browser.google,
    fetch: async () => { throw Error('テスト中の外部通信は禁止'); }, ...overrides };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.env.VITE_GOOGLE_MAPS_API_KEY', "''");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { ...environment, exports,
      require: specifier => load(path.resolve(path.dirname(file), specifier + '.ts')) }, { filename: file });
    return exports;
  }
  return load;
};
