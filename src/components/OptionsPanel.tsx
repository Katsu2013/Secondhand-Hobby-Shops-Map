/**
 * @file src/components/OptionsPanel.tsx
 * @description 画面左側に配置されるオプション設定パネルコンポーネント。
 * 出発地の設定（GPS・地図クリック・駅名検索）、アクセス手段の選択、所要時間上限スライダー、
 * 店舗チェーン別のON/OFF、扱っている商品カテゴリ別のON/OFF（OR/AND切替対応）、
 * などの閲覧条件を設定します。店舗データは自動更新される配布DBを参照します。
 */

import React, { useMemo, useState } from 'react';
import {
  CATEGORIES,
  CHAIN_GROUPS,
  getEffectiveShopSubCategories,
  SUB_CATEGORIES,
  SUB_CATEGORY_MAP,
  TRAVEL_MODES,
} from '../config/shopMaster';
import type {
  CategoryId,
  CategoryMatchMode,
  ChainId,
  OriginLocation,
  Shop,
  SubCategoryId,
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
  /** 出発時刻モード（`'now'`: 現在時刻リアルタイム / `'custom'`: 任意時刻指定） */
  departureTimeMode: 'now' | 'custom';
  /** 出発時刻モードを切り替えるコールバック */
  onChangeDepartureTimeMode: (mode: 'now' | 'custom') => void;
  /** 任意指定された出発時刻文字列（`"HH:MM"` 形式） */
  customDepartureTime: string;
  /** 任意指定の出発時刻を変更するコールバック */
  onChangeCustomDepartureTime: (timeStr: string) => void;
  /** 現在のリアルタイム時刻文字列（`"HH:MM"` 形式） */
  currentClockText: string;
  /** 閉店に間に合わない店舗（到着時営業終了）を非表示にするかどうか */
  hideClosedOnArrival: boolean;
  /** 閉店に間に合わない店舗の非表示設定を切り替えるコールバック */
  onChangeHideClosedOnArrival: (hide: boolean) => void;
  /** 現在ONになっているチェーンIDのSet */
  enabledChains: ReadonlySet<ChainId>;
  /** 個別チェーンのON/OFFを切り替えるコールバック */
  onToggleChain: (chainId: ChainId, enabled: boolean) => void;
  /** 全チェーンを一括ONまたは全OFFにするコールバック */
  onSetAllChains: (enableAll: boolean) => void;
  /** 現在ONになっている取扱親カテゴリIDのSet */
  enabledCategories: ReadonlySet<CategoryId>;
  /** 現在ONになっている詳細サブジャンルIDのSet */
  enabledSubCategories: ReadonlySet<SubCategoryId>;
  /** 親カテゴリ（配下の詳細ジャンル一括）のON/OFFを切り替えるコールバック */
  onToggleCategory: (catId: CategoryId, enabled: boolean) => void;
  /** 個別の詳細サブジャンルのON/OFFを切り替えるコールバック */
  onToggleSubCategory: (subCatId: SubCategoryId, enabled: boolean) => void;
  /** 指定した親カテゴリ（配下の詳細ジャンル）のみを単独ONにするコールバック */
  onSelectOnlyCategory: (catId: CategoryId) => void;
  /** 指定した詳細サブジャンル1つのみを単独ONにするコールバック */
  onSelectOnlySubCategory: (subCatId: SubCategoryId) => void;
  /** 全カテゴリ・全詳細ジャンルを一括ONまたは全OFFにするコールバック */
  onSetAllCategories: (enableAll: boolean) => void;
  /** カテゴリ絞り込みの一致モード（`'OR'` または `'AND'`） */
  categoryMatchMode: CategoryMatchMode;
  /** カテゴリ一致モードを変更するコールバック */
  onChangeCategoryMatchMode: (mode: CategoryMatchMode) => void;
  /** 全店舗データ配列（各チェーン・各カテゴリの該当店舗数カウント表示に使用） */
  allShops: readonly Shop[];

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
  departureTimeMode,
  onChangeDepartureTimeMode,
  customDepartureTime,
  onChangeCustomDepartureTime,
  currentClockText,
  hideClosedOnArrival,
  onChangeHideClosedOnArrival,
  enabledChains,
  onToggleChain,
  onSetAllChains,
  enabledCategories: _enabledCategories,
  enabledSubCategories,
  onToggleCategory,
  onToggleSubCategory,
  onSelectOnlyCategory,
  onSelectOnlySubCategory,
  onSetAllCategories,
  categoryMatchMode,
  onChangeCategoryMatchMode,
  allShops,
}) => {
  /** 出発地検索テキストボックスの入力状態 */
  const [originQuery, setOriginQuery] = useState<string>('');
  /** 詳細サブジャンルツリーを展開表示している親カテゴリIDの集合（初期状態でホビー系を展開し階層構造を分かりやすく提示） */
  const [expandedParentCats, setExpandedParentCats] = useState<Set<CategoryId>>(
    () => new Set<CategoryId>(['figure_hobby'])
  );

  /**
   * 親カテゴリの詳細ツリー展開・折りたたみを切り替えます。
   *
   * @param catId - 対象の親カテゴリID
   */
  const handleToggleExpandParent = (catId: CategoryId): void => {
    setExpandedParentCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  /**
   * 全親カテゴリの詳細ツリーを一括展開または一括折りたたみします。
   *
   * @param expandAll - `true` なら全展開、`false` なら全折りたたみ
   */
  const handleExpandAllParentCats = (expandAll: boolean): void => {
    if (expandAll) {
      setExpandedParentCats(new Set(CATEGORIES.map((c) => c.id)));
    } else {
      setExpandedParentCats(new Set());
    }
  };

  /**
   * 各チェーンに属する全国の店舗数を集計した辞書。
   * なぜ `useMemo` を使うか：約2,500店舗のループ集計を `allShops` が変化した時だけに限定し、
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
   * 各親カテゴリおよび各詳細サブジャンルを取り扱っている全国の店舗数を集計した辞書ペア。
   */
  const { categoryCounts, subCategoryCounts } = useMemo<{
    categoryCounts: Record<CategoryId, number>;
    subCategoryCounts: Record<SubCategoryId, number>;
  }>(() => {
    const catCounts = {} as Record<CategoryId, number>;
    const subCounts = {} as Record<SubCategoryId, number>;
    CATEGORIES.forEach((c) => {
      catCounts[c.id] = 0;
    });
    SUB_CATEGORIES.forEach((s) => {
      subCounts[s.id] = 0;
    });

    allShops.forEach((shop) => {
      const shopSubs = getEffectiveShopSubCategories(shop);
      const seenParents = new Set<CategoryId>();
      shopSubs.forEach((subId) => {
        if (subCounts[subId] !== undefined) {
          subCounts[subId] += 1;
        }
        const subInfo = SUB_CATEGORY_MAP[subId];
        if (subInfo) {
          seenParents.add(subInfo.parentId);
        }
      });
      (shop.categories || []).forEach((cid) => seenParents.add(cid));
      seenParents.forEach((cid) => {
        if (catCounts[cid] !== undefined) {
          catCounts[cid] += 1;
        }
      });
    });

    return { categoryCounts: catCounts, subCategoryCounts: subCounts };
  }, [allShops]);

  /**
   * 出発地検索の実行ハンドラ。
   */
  const handleTriggerOriginSearch = (): void => {
    if (originQuery.trim()) {
      onSearchOrigin(originQuery.trim());
    }
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

          <div className="closing-eval-box">
            <div className="time-limit-header">
              <span>🕒 出発時刻（閉店に間に合うか判定）</span>
              <strong className="highlight-val">
                {departureTimeMode === 'now'
                  ? `現在時刻 (${currentClockText}) 発`
                  : `指定時刻 (${customDepartureTime}) 発`}
              </strong>
            </div>

            <div className="dep-time-mode-row">
              <button
                type="button"
                className={`opt-btn-sm ${departureTimeMode === 'now' ? 'active' : ''}`}
                onClick={() => onChangeDepartureTimeMode('now')}
              >
                現在時刻で判定
              </button>
              <button
                type="button"
                className={`opt-btn-sm ${departureTimeMode === 'custom' ? 'active' : ''}`}
                onClick={() => onChangeDepartureTimeMode('custom')}
              >
                時刻を指定
              </button>
              {departureTimeMode === 'custom' && (
                <input
                  type="time"
                  id="input-departure-time"
                  className="dep-time-input"
                  aria-label="出発時刻を指定"
                  value={customDepartureTime}
                  onChange={(e) => onChangeCustomDepartureTime(e.target.value || '18:00')}
                />
              )}
            </div>

            {departureTimeMode === 'custom' && <p className="section-desc">過去の時刻を指定した場合は翌日の出発として計算します。</p>}
            <label className="checkbox-row" style={{ marginTop: '6px' }}>
              <input
                type="checkbox"
                id="chk-hide-closed-arrival"
                checked={hideClosedOnArrival}
                onChange={(e) => onChangeHideClosedOnArrival(e.target.checked)}
              />
              <span>
                🔴 <strong>閉店に間に合わない店舗</strong>（到着時営業終了）を非表示にする
              </span>
            </label>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              id="chk-show-pin-time"
              checked={showPinTime}
              onChange={(e) => onChangeShowPinTime(e.target.checked)}
            />
            <span>地図ピン上に「所要時間・閉店判定バッジ」を常時表示する</span>
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

        {/* 4. 扱っているカテゴリリストのオン・オフ（親カテゴリ大分類＋詳細サブジャンル階層ツリー） */}
        <section className="option-section">
          <div className="section-title-row">
            <h3>🎮 取扱ジャンル絞り込み（詳細対応）</h3>
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
              <button
                type="button"
                id="btn-cats-expand-toggle"
                className="text-link-btn"
                onClick={() =>
                  handleExpandAllParentCats(expandedParentCats.size < CATEGORIES.length)
                }
              >
                {expandedParentCats.size < CATEGORIES.length ? '▼全展開' : '▲全閉'}
              </button>
            </div>
          </div>
          <p className="section-desc">
            公式掲載で確認できた品目で絞り込みます。未確認店も全選択のORでは表示します。大分類だけの公表では詳細を推測しません。
          </p>

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

          <div id="category-filter-list" className="filter-check-list cat-tree-container">
            {CATEGORIES.map((cat) => {
              const childSubIds = cat.subCategories;
              const enabledChildCount = childSubIds.filter((sid) =>
                enabledSubCategories.has(sid)
              ).length;
              const isAllChecked = enabledChildCount === childSubIds.length;
              const isNoneChecked = enabledChildCount === 0;
              const isPartial = !isAllChecked && !isNoneChecked;
              const isExpanded = expandedParentCats.has(cat.id);

              return (
                <div
                  key={cat.id}
                  className={`cat-tree-group ${
                    isNoneChecked ? 'unchecked' : isPartial ? 'partial' : 'checked'
                  }`}
                >
                  <div className="cat-parent-row">
                    <label className="cat-parent-label">
                      <input
                        type="checkbox"
                        checked={!isNoneChecked}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = isPartial;
                          }
                        }}
                        onChange={(e) => onToggleCategory(cat.id, e.target.checked)}
                      />
                      <span className="chain-dot" style={{ background: cat.color }}>
                        {cat.icon}
                      </span>
                      <span className="filter-name">{cat.name}</span>
                    </label>

                    <div className="cat-parent-actions">
                      <button
                        type="button"
                        className="solo-filter-btn"
                        title={`「${cat.name}」のみを表示`}
                        onClick={() => onSelectOnlyCategory(cat.id)}
                      >
                        のみ
                      </button>
                      <span className="filter-count" title="該当店舗数">
                        {categoryCounts[cat.id] || 0}店
                      </span>
                      <button
                        type="button"
                        className={`cat-expand-btn ${isExpanded ? 'open' : ''}`}
                        title="詳細ジャンルを展開・折りたたむ"
                        onClick={() => handleToggleExpandParent(cat.id)}
                      >
                        {isExpanded ? '▲' : '▼'} 詳細({enabledChildCount}/{childSubIds.length})
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="cat-sub-list">
                      {childSubIds.map((subId) => {
                        const subInfo = SUB_CATEGORY_MAP[subId];
                        if (!subInfo) return null;
                        const subChecked = enabledSubCategories.has(subId);
                        return (
                          <div
                            key={subId}
                            className={`cat-sub-item ${subChecked ? 'checked' : 'unchecked'}`}
                          >
                            <label className="cat-sub-label">
                              <input
                                type="checkbox"
                                checked={subChecked}
                                onChange={(e) => onToggleSubCategory(subId, e.target.checked)}
                              />
                              <span className="sub-cat-icon">{subInfo.icon}</span>
                              <span className="sub-cat-name">{subInfo.name}</span>
                            </label>
                            <div className="cat-sub-right">
                              <button
                                type="button"
                                className="solo-filter-btn"
                                title={`「${subInfo.shortName}」のみをピンポイント表示`}
                                onClick={() => onSelectOnlySubCategory(subId)}
                              >
                                のみ
                              </button>
                              <span className="sub-filter-count">
                                {subCategoryCounts[subId] || 0}店
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>


      </div>
    </aside>
  );
};
