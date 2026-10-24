/// <reference types="vite/client" />

/**
 * @file src/vite-env.d.ts
 * @description Vite環境変数（`import.meta.env`）の型定義ファイル。
 * なぜ必要か：`.env.local` 等から注入される `VITE_GOOGLE_MAPS_API_KEY` をTypeScriptで型安全に参照するため。
 */

interface ImportMetaEnv {
  /** Google Maps JavaScript API キー（ローカル `.env.local` またはCIビルド環境変数） */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Mapbox パブリックアクセストークン（CIビルド環境変数またはローカル `.env.local`） */
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
}

interface ImportMeta {
  /** Vite 環境変数オブジェクト */
  readonly env: ImportMetaEnv;
}
