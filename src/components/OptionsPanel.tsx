/**
 * @file src/components/OptionsPanel.tsx
 * @description 画面左側に配置されるオプション設定パネルコンポーネント。
 * 出発地の設定（GPS・地図クリック・駅名検索）、アクセス手段の選択、所要時間上限スライダー、
 * 店舗チェーン別のON/OFF、扱っている商品カテゴリ別のON/OFF（OR/AND切替対応）、
 * および店舗データの手動追加・JSONインポート/エクスポート機能を提供します。
 */

import React, { useMemo, useState } from 'react';
import { CATEGORIES, CHAIN_GROUPS, TRAVEL_MODES } from '../config/shopMaster';
import type {
  CategoryId,
  CategoryMatchMode,
  ChainId,
  OriginLocation,
  Shop,
  TravelModeId,
} from '../types/shop';

/**
 * `OptionsPanel` コンポーネントのPropsインターフェース。
 */
export interface OptionsPanelProps {
  /** パネルが折りたたまれて非表示になっているかどうか（デスクトップ用） */
  isCollapsed: boolean;
  /** モバイル表示時に現在このタブがアクティブかどうか */
  isMobileVisible: boolean;
  /** オプションパネルを閉じるボタンのコールバック */
  onClosePanel: () => void;
  /** 現在の出発地点情報 */
  origin: OriginLocation;
  /** 地図クリックによる出発地指定モード中かどうか */
  isPickingOrigin: boolean;
  /** GPSで現在地を取得して出発地に設定するコールバック */
  onUseGpsOrigin: () => void;
  /** 地図クリックによる出発地指定モードをトグルするコールバック */
  onTogglePickOriginMap: () => void;
  /** 駅名・地名テキストで出発地を検索・設定するコールバック */
  onSearchOrigin: (query: string) => void;
  /** 現在選択中のアクセス手段ID */
  travelMode: TravelModeId;
  /** アクセス手段を変更するコールバック */
  onSelectTravelMode: (modeId: TravelModeId) => void;
  /** 所要時間上限（分、150は無制限） */
  maxMinutes: number;
  /** 所要時間上限スライダー変更時のコールバック */
  onChangeMaxMinutes: (mins: number) => void;
  /** ピン上の所要時間バッジを常時表示するかどうか */
  showPinTime: boolean;
  /** ピン上の所要時間バッジ表示設定を切り替えるコールバック */
  onChangeShowPinTime: (show: boolean) => void;
  /** 出発地からの15/30/60分到達目安サークルを表示するかどうか */
  showTimeCircles: boolean;
  /** 到達目安サークル表示設定を切り替えるコールバック */
  onChangeShowTimeCircles: (show: boolean) => void;
  /** 現在ONになっているチェーンIDのSet */
  enabledChains: ReadonlySet<ChainId>;
  /** 個別チェーンのON/OFFを切り替えるコールバック */
  onToggleChain: (chainId: ChainId, enabled: boolean) => void;
  /** 全チェーンを一括ONまたは全OFFにするコールバック */
  onSetAllChains: (enableAll: boolean) => void;
  /** 現在ONになっている取扱カテゴリIDのSet */
  enabledCategories: ReadonlySet<CategoryId>;
  /** 個別カテゴリのON/OFFを切り替えるコールバック */
  onToggleCategory: (catId: CategoryId, enabled: boolean) => void;
  /** 全カテゴリを一括ONまたは全OFFにするコールバック */
  onSetAllCategories: (enableAll: boolean) => void;
  /** カテゴリ絞り込みの一致モード（`'OR'` または `'AND'`） */
  categoryMatchMode: CategoryMatchMode;
  /** カテゴリ一致モードを変更するコールバック */
  onChangeCategoryMatchMode: (mode: CategoryMatchMode) => void;
  /** 全店舗データ配列（各チェーン・各カテゴリの該当店舗数カウント表示に使用） */
  allShops: readonly Shop[];
  /** 新規店舗追加モーダルを開くコールバック */
  onOpenAddShopModal: () => void;
  /** 店舗データベースをJSONファイルとしてエクスポートするコールバック */
  onExportJson: () => void;
  /** JSONファイルから店舗データをインポートするコールバック */
  onImportJsonFile: (file: File) => void;
}

/**
 * オプション設定サイドパネルを描画するReact関数コンポーネント。
 *
 * @param props - `OptionsPanelProps` オブジェクト
 * @returns オプションパネルのJSX要素
 */
export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  isCollapsed,
  isMobileVisible,
  onClosePanel,
  origin,
  isPickingOrigin,
  onUseGpsOrigin,
  onTogglePickOriginMap,
  onSearchOrigin,
  travelMode,
  onSelectTravelMode,
  maxMinutes,
  onChangeMaxMinutes,
  showPinTime,
  onChangeShowPinTime,
  showTimeCircles,
  onChangeShowTimeCircles,
  enabledChains,
  onToggleChain,
  onSetAllChains,
  enabledCategories,
  onToggleCategory,
  onSetAllCategories,
  categoryMatchMode,
  onChangeCategoryMatchMode,
  allShops,
  onOpenAddShopModal,
  onExportJson,
  onImportJsonFile,
}) => {
  /** 出発地検索テキストボックスの入力状態 */
  const [originQuery, setOriginQuery] = useState<string>('');

  /**
   * 各チェーンに属する全国の店舗数を集計した辞書。
   * なぜ `useMemo` を使うか：約2,000店舗のループ集計を `allShops` が変化した時だけに限定し、
   * スライダー操作時などの不要な再計算を防ぐためです。
   */
  const chainCounts = useMemo<Record<ChainId, number>>(() => {
    const counts = {} as Record<ChainId, number>;
    CHAIN_GROUPS.forEach((c) => {
      counts[c.id] = 0;
    });
    allShops.forEach((shop) => {
      const chList = shop.chains && shop.chains.length > 0 ? shop.chains : [shop.chain];
      chList.forEach((cid) => {
        if (counts[cid] !== undefined) {
          counts[cid] += 1;
        }
      });
    });
    return counts;
  }, [allShops]);

  /**
   * 各商品カテゴリを取り扱っている全国の店舗数を集計した辞書。
   */
  const categoryCounts = useMemo<Record<CategoryId, number>>(() => {
    const counts = {} as Record<CategoryId, number>;
    CATEGORIES.forEach((c) => {
      counts[c.id] = 0;
    });
    allShops.forEach((shop) => {
      (shop.categories || []).forEach((catId) => {
        if (counts[catId] !== undefined) {
          counts[catId] += 1;
        }
      });
    });
    return counts;
  }, [allShops]);

  /**
   * 出発地検索の実行ハンドラ。
   */
  const handleTriggerOriginSearch = (): void => {
    if (originQuery.trim()) {
      onSearchOrigin(originQuery.trim());
    }
  };

  /**
   * JSONインポート用のファイル選択変更ハンドラ。
   *
   * @param e - ファイル入力要素の変更イベント
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJsonFile(file);
    }
    e.target.value = '';
  };

  return (
    <aside
      id="options-panel"
      className={`side-panel left-panel ${isCollapsed ? 'collapsed' : ''} ${
        isMobileVisible ? '' : 'mob-hidden'
      }`}
      aria-label="検索・フィルターオプション"
    >
      <div className="panel-header">
        <h2>⚙️ オプション設定</h2>
        <button
          id="btn-close-options"
          type="button"
          className="panel-close-btn"
          title="パネルを閉じる"
          onClick={onClosePanel}
        >
          ✕
        </button>
      </div>

      <div className="panel-scroll-body">
        {/* 1. 出発地点（現在地・任意地点）設定 */}
        <section className="option-section">
          <div className="section-title-row">
            <h3>🚩 出発地点（所要時間の基準）</h3>
          </div>
          <p className="section-desc">
            ここで設定した地点から各店舗までの所要時間と距離を自動計算します。
          </p>

          <div className="origin-status-box">
            <div className="origin-pin-badge">出発</div>
            <div className="origin-info">
              <div id="origin-coords-label" className="origin-name">
                {origin.name}
              </div>
              <div className="origin-sub">地図上の好きな場所を出発地にできます</div>
            </div>
          </div>

          <div className="origin-btn-grid">
            <button
              id="btn-use-gps"
              type="button"
              className="opt-btn primary-soft"
              onClick={onUseGpsOrigin}
            >
              <span>📡</span> 現在地(GPS)を取得
            </button>
            <button
              id="btn-pick-origin-map"
              type="button"
              className={`opt-btn ${isPickingOrigin ? 'active' : ''}`}
              onClick={onTogglePickOriginMap}
            >
              <span>👆</span> 地図クリックで指定
            </button>
          </div>

          <div className="origin-search-row">
            <input
              type="text"
              id="input-origin-search"
              placeholder="駅名・住所で出発地を変更 (例: 大宮駅)"
              value={originQuery}
              onChange={(e) => setOriginQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTriggerOriginSearch();
              }}
            />
            <button
              id="btn-origin-search"
              type="button"
              className="opt-btn-sm"
              onClick={handleTriggerOriginSearch}
            >
              設定
            </button>
          </div>
        </section>

        {/* 2. アクセス手段の選択 & 所要時間上限フィルター */}
        <section className="option-section">
          <div className="section-title-row">
            <h3>🚗 アクセス手段の選択</h3>
          </div>
          <div id="options-travel-modes" className="travel-mode-grid">
            {TRAVEL_MODES.map((mode) => {
              const isActive = travelMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={`mode-option-card ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectTravelMode(mode.id)}
                >
                  <span>{mode.icon}</span>
                  <span>{mode.shortName}</span>
                </button>
              );
            })}
          </div>

          <div className="time-limit-box">
            <div className="time-limit-header">
              <span>⏱️ 所要時間で絞り込み</span>
              <strong id="label-max-minutes" className="highlight-val">
                {maxMinutes >= 150 ? '制限なし（すべて表示）' : `約 ${maxMinutes} 分以内`}
              </strong>
            </div>
            <input
              type="range"
              id="range-max-minutes"
              min={15}
              max={150}
              step={15}
              value={maxMinutes}
              onChange={(e) => onChangeMaxMinutes(parseInt(e.target.value, 10))}
            />
            <div className="range-ticks">
              <span>15分</span>
              <span>30分</span>
              <span>60分</span>
              <span>90分</span>
              <span>120分</span>
              <span>無制限</span>
            </div>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              id="chk-show-pin-time"
              checked={showPinTime}
              onChange={(e) => onChangeShowPinTime(e.target.checked)}
            />
            <span>地図ピン上に「所要時間バッジ」を常時表示する</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              id="chk-show-time-circles"
              checked={showTimeCircles}
              onChange={(e) => onChangeShowTimeCircles(e.target.checked)}
            />
            <span>出発地からの15分 / 30分 / 60分到達目安サークルを表示</span>
          </label>
        </section>

        {/* 3. 店舗チェーンのオン・オフ */}
        <section className="option-section">
          <div className="section-title-row">
            <h3>🏪 店舗チェーンのオン・オフ</h3>
            <div className="mini-actions">
              <button
                type="button"
                id="btn-chains-all-on"
                className="text-link-btn"
                onClick={() => onSetAllChains(true)}
              >
                全ON
              </button>
              <button
                type="button"
                id="btn-chains-all-off"
                className="text-link-btn"
                onClick={() => onSetAllChains(false)}
              >
                全OFF
              </button>
            </div>
          </div>
          <p className="section-desc">巡りたいショップチェーンを選択してください。</p>
          <div id="chain-filter-list" className="filter-check-list">
            {CHAIN_GROUPS.map((chain) => {
              const checked = enabledChains.has(chain.id);
              return (
                <label
                  key={chain.id}
                  className={`filter-item ${checked ? 'checked' : 'unchecked'}`}
                >
                  <div className="filter-item-left">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onToggleChain(chain.id, e.target.checked)}
                    />
                    <span className="chain-dot" style={{ background: chain.color }}>
                      {chain.icon}
                    </span>
                    <span className="filter-name">{chain.name}</span>
                  </div>
                  <span className="filter-count">{chainCounts[chain.id] || 0}店</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* 4. 扱っているカテゴリリストのオン・オフ */}
        <section className="option-section">
          <div className="section-title-row">
            <h3>🎮 扱っているカテゴリのオン・オフ</h3>
            <div className="mini-actions">
              <button
                type="button"
                id="btn-cats-all-on"
                className="text-link-btn"
                onClick={() => onSetAllCategories(true)}
              >
                全ON
              </button>
              <button
                type="button"
                id="btn-cats-all-off"
                className="text-link-btn"
                onClick={() => onSetAllCategories(false)}
              >
                全OFF
              </button>
            </div>
          </div>

          <div className="match-mode-bar">
            <span>絞り込み条件:</span>
            <label className="radio-pill">
              <input
                type="radio"
                name="cat-match-mode"
                value="OR"
                checked={categoryMatchMode === 'OR'}
                onChange={() => onChangeCategoryMatchMode('OR')}
              />
              <span>どれか扱う (OR)</span>
            </label>
            <label className="radio-pill">
              <input
                type="radio"
                name="cat-match-mode"
                value="AND"
                checked={categoryMatchMode === 'AND'}
                onChange={() => onChangeCategoryMatchMode('AND')}
              />
              <span>すべて扱う (AND)</span>
            </label>
          </div>

          <div id="category-filter-list" className="filter-check-list">
            {CATEGORIES.map((cat) => {
              const checked = enabledCategories.has(cat.id);
              return (
                <label key={cat.id} className={`filter-item ${checked ? 'checked' : 'unchecked'}`}>
                  <div className="filter-item-left">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onToggleCategory(cat.id, e.target.checked)}
                    />
                    <span className="chain-dot" style={{ background: cat.color }}>
                      {cat.icon}
                    </span>
                    <span className="filter-name">{cat.name}</span>
                  </div>
                  <span className="filter-count">{categoryCounts[cat.id] || 0}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* 5. カスタム店舗追加・データ管理 */}
        <section className="option-section">
          <div className="section-title-row">
            <h3>🛠️ 店舗データの追加・カスタマイズ</h3>
          </div>
          <p className="section-desc">
            お気に入りの店舗の手動登録や、各店舗の取扱カテゴリの微調整・保存が可能です。
          </p>
          <div className="data-manage-btns">
            <button
              id="btn-add-shop"
              type="button"
              className="opt-btn"
              onClick={onOpenAddShopModal}
            >
              ➕ 新規店舗を手動で追加
            </button>
            <div className="origin-btn-grid">
              <button
                id="btn-export-json"
                type="button"
                className="opt-btn-sm"
                onClick={onExportJson}
              >
                💾 JSON書き出し
              </button>
              <label className="opt-btn-sm file-label">
                📂 JSON読み込み
                <input
                  type="file"
                  id="input-import-json"
                  accept=".json"
                  hidden
                  onChange={handleFileChange}
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
};
