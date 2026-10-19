/**
 * @file src/components/Modals.tsx
 * @description Google Maps APIキー設定モーダル（`ApiKeyModal`）を提供します。
 */

import React, { useEffect, useState } from 'react';


/**
 * `ApiKeyModal` コンポーネントのPropsインターフェース。
 */
export interface ApiKeyModalProps {
  /** モーダルが開いているかどうか */
  isOpen: boolean;
  /** 現在保存されているGoogle Maps APIキー */
  currentApiKey: string;
  /** モーダルを閉じるコールバック */
  onClose: () => void;
  /** APIキーを保存してGoogle Mapsを有効化するコールバック */
  onSaveApiKey: (apiKey: string) => void;
  /** APIキーをクリアして内蔵マップ（Leaflet）へ戻すコールバック */
  onClearApiKey: () => void;
}

/**
 * Google Maps JavaScript API キーの設定・解除を行うモーダルダイアログコンポーネント。
 *
 * @param props - `ApiKeyModalProps` オブジェクト
 * @returns APIキー設定モーダルのJSX要素
 */
export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  currentApiKey,
  onClose,
  onSaveApiKey,
  onClearApiKey,
}) => {
  /** 入力フィールドのAPIキー文字列状態 */
  const [inputKey, setInputKey] = useState<string>(currentApiKey);
  /** パスワードマスクを解除して平文表示するかどうかの状態 */
  const [showPlainKey, setShowPlainKey] = useState<boolean>(false);

  // モーダルが開かれるたびに現在のAPIキーを入力欄へ同期する
  useEffect(() => {
    if (isOpen) {
      setInputKey(currentApiKey);
    }
  }, [isOpen, currentApiKey]);

  return (
    <div
      id="modal-api-key"
      className={`modal-backdrop ${isOpen ? '' : 'hidden'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-api-title"
    >
      <div className="modal-dialog">
        <div className="modal-header">
          <h3 id="modal-api-title">🔑 Google Maps API キー設定</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-lead">
            本アプリは<strong>APIキーなしでも全国の収録店舗を表示する内蔵マップ＋道路ルート計算</strong>がそのまま使えますが、ご自身の{' '}
            <strong>Google Maps JavaScript API キー</strong> を入力すると、以下の機能がフル解放されます：
          </p>
          <ul className="feature-list">
            <li>✅ 本家 Google マップの描画・ストリートビュー・航空写真切替</li>
            <li>✅ Googleの渋滞予測を考慮した車の到着時間・公共交通の乗換検索</li>
            <li>✅ Google Places API による新店舗・未登録店舗のリアルタイム検索補完</li>
          </ul>
          <div className="form-group">
            <label htmlFor="input-google-api-key">Google Maps JavaScript API Key</label>
            <input
              type={showPlainKey ? 'text' : 'password'}
              id="input-google-api-key"
              placeholder="AIzaSy..."
              autoComplete="off"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
            />
            <label className="checkbox-row small">
              <input
                type="checkbox"
                id="chk-show-api-key"
                checked={showPlainKey}
                onChange={(e) => setShowPlainKey(e.target.checked)}
              />
              <span>キー文字列を表示する</span>
            </label>
          </div>
          <p className="modal-note">
            ※APIキーはブラウザに保存し、地図・ルート検索時にGoogleへ送信します。渋滞予測を含む検索はGoogleの利用料金が発生する場合があります。
          </p>
        </div>
        <div className="modal-footer">
          <button
            id="btn-clear-api-key"
            type="button"
            className="btn-secondary"
            onClick={onClearApiKey}
          >
            キーをクリア (内蔵マップに戻す)
          </button>
          <button
            id="btn-save-api-key"
            type="button"
            className="btn-primary"
            onClick={() => onSaveApiKey(inputKey.trim())}
          >
            保存して Google Maps を有効化
          </button>
        </div>
      </div>
    </div>
  );
};
