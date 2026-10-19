/**
 * @file vite.config.ts
 * @description Viteのビルドおよび開発サーバー設定ファイル。
 * なぜこの設定が必要か：React (TSX) のトランスパイルを有効にし、
 * `base: './'`（相対パス出力）に設定することで GitHub Pages などのサブディレクトリ配信環境でも
 * アセットや `data/shops.json` がリンク切れなく動作するようにするため。
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Viteのメイン設定オブジェクト。
 * Reactプラグインを組み込み、相対パス出力（GitHub Pages対応）およびポート8080を設定します。
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 8080,
    strictPort: false,
    /** 店舗データ調査用のキャッシュは画面のホットリロードを必要としません。 */
    watch: { ignored: ['**/scripts/research-cache/**'] },
  },
});
