/**
 * @file src/components/HeaderBar.tsx
 * @description 画面最上部に配置されるヘッダーバーコンポーネント。
 * アプリのタイトル、全国収録店舗数バッジ、
 * アクセス手段のクイック切替バー、主要エリアジャンプ選択、周辺店舗スキャンボタン、API設定ボタンを提供します。
 */

import React from 'react';
import { AREA_PRESETS, TRAVEL_MODES } from '../config/shopMaster';
import type { AreaPreset, TravelModeId } from '../types/shop';

/**
 * `HeaderBar` コンポーネントのPropsインターフェース。
 */
export interface HeaderBarProps {
  /** 全国データベースに登録されている総店舗数 */
  totalDbCount: number;
  /** 現在選択されているアクセス手段ID */
  travelMode: TravelModeId;
  /** アクセス手段を変更した際のコールバック関数 */
  onSelectTravelMode: (modeId: TravelModeId) => void;
  /** エリアプリセットを選択してジャンプした際のコールバック関数 */
  onSelectAreaPreset: (preset: AreaPreset) => void;
  /** 「このエリアの店舗をさらに探索」ボタンを押した際のコールバック関数 */
  onScanArea: () => void;
  /** 左側のオプション画面パネルの表示/非表示を切り替えるコールバック関数 */
  onToggleOptionsPanel: () => void;
  /** Google Maps APIキー設定モーダルを開くコールバック関数 */
  onOpenApiModal: () => void;
}

/**
 * アプリケーションの上部ナビゲーションバーを描画するReact関数コンポーネント。
 *
 * 【なぜヘッダーにも移動手段ボタンを置くのか】
 * 左側のオプションパネルを閉じて地図を広く表示している状態でも、ワンクリックで
 * 「車（有料）」「車（一般道）」「電車・バス」「自転車」「徒歩」を切り替えて所要時間を比較できるようにするためです。
 *
 * @param props - `HeaderBarProps` オブジェクト
 * @returns ヘッダーバーのJSX要素
 */
export const HeaderBar: React.FC<HeaderBarProps> = ({
  totalDbCount,
  travelMode,
  onSelectTravelMode,
  onSelectAreaPreset,
  onScanArea,
  onToggleOptionsPanel,
  onOpenApiModal,
}) => {
  /**
   * エリアプリセットのセレクトボックスが変更された際のイベントハンドラ。
   * 選択されたインデックスからプリセット座標を取得して親コンポーネントへ通知し、セレクト値をリセットします。
   *
   * @param e - セレクト要素の変更イベント
   */
  const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const idx = parseInt(e.target.value, 10);
    if (!Number.isNaN(idx) && AREA_PRESETS[idx]) {
      onSelectAreaPreset(AREA_PRESETS[idx]);
      e.target.value = '';
    }
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          id="btn-toggle-options"
          type="button"
          className="icon-btn"
          title="オプションパネルを開閉"
          aria-label="オプションパネルを開閉"
          onClick={onToggleOptionsPanel}
        >
          <span className="hamburger-icon">☰</span>
          <span className="btn-label-desktop">オプション設定</span>
        </button>

        <div className="brand-block">
          <span className="brand-logo">🗺️</span>
          <div>
            <h1 className="app-title">中古＆ホビーショップ巡りマップ</h1>
            <p className="app-subtitle">
              検索いらずで全国のハードオフ・駿河屋・ブックオフ等の所要時間がひと目でわかる
            </p>
          </div>
        </div>
      </div>

      <div className="header-center">
        {/* アクセス手段クイック切替バー */}
        <div
          className="quick-mode-bar"
          id="header-travel-modes"
          role="radiogroup"
          aria-label="アクセス手段の選択"
        >
          {TRAVEL_MODES.map((mode) => {
            const isActive = travelMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={`quick-mode-btn ${isActive ? 'active' : ''}`}
                title={mode.name}
                onClick={() => onSelectTravelMode(mode.id)}
              >
                <span>{mode.icon}</span>
                <span>{mode.shortName}</span>
              </button>
            );
          })}
        </div>

        {/* 主要エリアへワンクリックジャンプ */}
        <div className="area-jump-wrap">
          <select
            id="select-area-preset"
            className="area-select"
            aria-label="主要エリアへジャンプ"
            defaultValue=""
            onChange={handleAreaChange}
          >
            <option value="">📍 主要エリアへジャンプ...</option>
            {AREA_PRESETS.map((area, idx) => (
              <option key={area.name} value={String(idx)}>
                📍 {area.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="header-right">
        <div className="header-db-count">
          <span id="total-db-count" className="db-count-badge">
            全国 {totalDbCount.toLocaleString()} 店舗収録
          </span>
        </div>

        <button
          id="btn-places-scan"
          type="button"
          className="action-btn scan-btn"
          title="現在表示中のマップ範囲内にある中古ショップを追加スキャンします"
          onClick={onScanArea}
        >
          <span>🔍</span>
          <span className="hide-sm">表示エリアの店舗を自動探索</span>
        </button>

        <button
          id="btn-api-settings"
          type="button"
          className="action-btn api-btn"
          title="地図の設定（Google Maps APIキー）"
          aria-label="地図の設定"
          onClick={onOpenApiModal}
        >
          <span aria-hidden="true">⚙️</span>
          <span id="api-btn-text">地図の設定</span>
        </button>
      </div>
    </header>
  );
};
