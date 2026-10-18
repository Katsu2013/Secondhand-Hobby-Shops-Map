/**
 * @file src/main.tsx
 * @description React + TypeScript アプリケーションのエントリーポイント。
 * グローバルスタイルシート（`css/style.css`）を読み込み、DOMの `#root` 要素へ `App` コンポーネントをマウントします。
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '../css/style.css';

/**
 * アプリケーションをマウントするルートDOM要素。
 * `index.html` 内の `<div id="root"></div>` を取得します。
 */
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('ルート要素 (#root) が index.html 内に見つかりません。');
}

// React 18 の createRoot API を使用して StrictMode 下でアプリケーションを描画する
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
