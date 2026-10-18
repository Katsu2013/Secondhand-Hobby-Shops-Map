/**
 * @file src/components/ShopListPanel.tsx
 * @description 画面右側に配置される「表示エリア内の店舗一覧」パネルコンポーネント。
 * 現在地図の画面内に収まっているフィルタ済み店舗を所要時間が短い順などに並べて表示し、
 * ワンクリックでのルート表示、複数店舗の巡回（ハシゴ）ルート追加、店舗情報の編集機能を提供します。
 */

import React from 'react';
import { CATEGORY_MAP, CHAIN_GROUPS, CHAIN_MAP, TRAVEL_MODE_MAP, TRAVEL_MODES } from '../config/shopMaster';
import type { Shop, SortByMode, TravelModeId } from '../types/shop';

/**
 * `ShopListPanel` コンポーネントのPropsインターフェース。
 */
export interface ShopListPanelProps {
  /** モバイル表示時にこのリストパネルがアクティブかどうか */
  isMobileVisible: boolean;
  /** モバイル表示時に地図画面へ戻るボタンのコールバック */
  onBackToMapMobile: () => void;
  /** 現在画面内に表示されている店舗配列 */
  viewportShops: readonly Shop[];
  /** 現在選択されている店舗ID */
  selectedShopId: string | null;
  /** 巡回（ハシゴ）ルートに追加されている店舗ID配列 */
  tourShopIds: readonly string[];
  /** 現在のアクセス手段ID */
  travelMode: TravelModeId;
  /** リスト内キーワード絞り込みテキスト */
  listSearchText: string;
  /** リスト内キーワード変更時のコールバック */
  onChangeListSearchText: (text: string) => void;
  /** 現在の並び替え（ソート）モード */
  sortBy: SortByMode;
  /** 並び替えモード変更時のコールバック */
  onChangeSortBy: (sort: SortByMode) => void;
  /** 店舗カードまたは「ルート表示」ボタンをクリックした際のコールバック */
  onSelectShop: (shop: Shop) => void;
  /** 「+巡回ハシゴ」ボタンをクリックした際のコールバック */
  onToggleTourShop: (shopId: string) => void;
  /** 巡回リストをすべてクリアするコールバック */
  onClearTour: () => void;
  /** 巡回リストの全店舗を通る最適ハシゴルートを計算・描画するコールバック */
  onCalculateTourRoute: () => void;
  /** 店舗カードの「編集」ボタンをクリックした際のコールバック */
  onOpenEditShopModal: (shop: Shop) => void;
}

/**
 * 画面内の店舗リストと巡回（ハシゴ）ルートバーを描画するReact関数コンポーネント。
 *
 * 【なぜ最大120件にスライスして描画するか】
 * 全国広域ズーム時に2,000件以上のDOM要素を一度に生成するとブラウザのスクロール性能が低下するため、
 * ソート順（所要時間が短い順など）の上位120件を描画することで軽快なレスポンスを保証しています。
 *
 * @param props - `ShopListPanelProps` オブジェクト
 * @returns 店舗リストパネルのJSX要素
 */
export const ShopListPanel: React.FC<ShopListPanelProps> = ({
  isMobileVisible,
  onBackToMapMobile,
  viewportShops,
  selectedShopId,
  tourShopIds,
  travelMode,
  listSearchText,
  onChangeListSearchText,
  sortBy,
  onChangeSortBy,
  onSelectShop,
  onToggleTourShop,
  onClearTour,
  onCalculateTourRoute,
  onOpenEditShopModal,
}) => {
  /** 現在の移動手段オブジェクト */
  const currentMode = TRAVEL_MODE_MAP[travelMode] || TRAVEL_MODES[0];
  /** パフォーマンス維持のため上位120件に切り出した店舗配列 */
  const listItems = viewportShops.slice(0, 120);

  return (
    <aside
      id="list-panel"
      className={`side-panel right-panel ${isMobileVisible ? '' : 'mob-hidden'}`}
      aria-label="画面内の店舗リスト"
    >
      <div className="panel-header">
        <div>
          <h2>📋 画面内の店舗一覧</h2>
          <p className="panel-sub-caption">地図を動かすと一覧と所要時間が自動更新されます</p>
        </div>
        <button
          id="btn-toggle-list-mobile"
          type="button"
          className="panel-close-btn show-mobile-only"
          onClick={onBackToMapMobile}
        >
          地図へ戻る
        </button>
      </div>

      {/* リスト内フィルタ・並び替えツールバー */}
      <div className="list-toolbar">
        <input
          type="text"
          id="input-list-filter"
          className="list-search-input"
          placeholder="表示中の店名・市区町村で絞り込み..."
          value={listSearchText}
          onChange={(e) => onChangeListSearchText(e.target.value)}
        />
        <select
          id="select-sort-by"
          className="list-sort-select"
          aria-label="並び替え"
          value={sortBy}
          onChange={(e) => onChangeSortBy(e.target.value as SortByMode)}
        >
          <option value="time_asc">⏱️ 所要時間が短い順</option>
          <option value="chain">🏪 チェーン別</option>
          <option value="cat_count">🎮 取扱カテゴリが多い順</option>
          <option value="name">🔤 店舗名順</option>
        </select>
      </div>

      {/* 巡回（ハシゴ）ルートバー（1店舗以上追加されている時のみ表示） */}
      <div
        id="tour-builder-bar"
        className={`tour-builder-bar ${tourShopIds.length === 0 ? 'hidden' : ''}`}
      >
        <div className="tour-bar-top">
          <span>
            🚗 巡回（ハシゴ）リスト: <strong id="tour-count-num">{tourShopIds.length}</strong> 店舗
          </span>
          <div className="tour-bar-actions">
            <button
              id="btn-calc-tour-route"
              type="button"
              className="tour-go-btn"
              onClick={onCalculateTourRoute}
            >
              最適ハシゴルート表示
            </button>
            <button
              id="btn-clear-tour"
              type="button"
              className="tour-clear-btn"
              onClick={onClearTour}
            >
              クリア
            </button>
          </div>
        </div>
      </div>

      {/* 店舗カードリスト本体 */}
      <div id="shop-list-container" className="shop-list-container">
        {listItems.length === 0 ? (
          <div className="empty-list-state">
            <p>
              <strong>この表示エリア内に条件に合う店舗がありません</strong>
            </p>
            <p style={{ marginTop: '6px' }}>
              地図をズームアウト・移動するか、上部の「🔍 表示エリアの店舗を自動探索」ボタンを押してみてください。
            </p>
          </div>
        ) : (
          listItems.map((shop) => {
            const primaryChain = CHAIN_MAP[shop.chain] || CHAIN_GROUPS[0];
            const shopChains = shop.chains && shop.chains.length > 0 ? shop.chains : [shop.chain];
            const isSelected = shop.id === selectedShopId;
            const inTour = tourShopIds.includes(shop.id);
            const travel = shop._travel;

            return (
              <div
                key={shop.id}
                className={`shop-card ${isSelected ? 'active' : ''}`}
                style={{ '--card-chain-color': primaryChain.color } as React.CSSProperties}
                onClick={() => onSelectShop(shop)}
              >
                <div className="shop-card-top">
                  <div className="shop-card-title-group">
                    <div className="shop-chain-pills">
                      {shopChains.map((cid) => {
                        const c = CHAIN_MAP[cid];
                        if (!c) return null;
                        return (
                          <span key={cid} className="chain-tag" style={{ background: c.color }}>
                            {c.icon} {c.shortName}
                          </span>
                        );
                      })}
                    </div>
                    <div className="shop-card-name">{shop.name}</div>
                  </div>

                  <div
                    className={`shop-time-box ${travel?.isExact ? 'exact' : ''}`}
                    title={
                      travel?.isExact
                        ? '実ルート計算済みの所要時間'
                        : '直線距離と移動手段からの概算所要時間（クリックで正確ルート表示）'
                    }
                  >
                    <span className="shop-time-main">
                      {currentMode.icon} {travel?.isExact ? '' : '約'}
                      {travel?.formattedTime || '--分'}
                    </span>
                    <span className="shop-dist-sub">
                      {travel?.formattedDist || ''} {travel?.isExact ? '(実ルート)' : '(目安)'}
                    </span>
                  </div>
                </div>

                <div className="shop-cat-tags">
                  {(shop.categories || []).map((catId) => {
                    const cat = CATEGORY_MAP[catId];
                    if (!cat) return null;
                    return (
                      <span key={catId} className="cat-pill">
                        {cat.icon} {cat.shortName}
                      </span>
                    );
                  })}
                </div>

                {(shop.address || shop.hours) && (
                  <div className="shop-meta-text">
                    {shop.address && <span>📍 {shop.address}</span>}
                    {shop.hours && <span>🕒 {shop.hours}</span>}
                  </div>
                )}

                <div className="shop-card-actions">
                  <button
                    type="button"
                    className="card-btn route-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectShop(shop);
                    }}
                  >
                    <span>🛣️</span> ルート表示
                  </button>
                  <button
                    type="button"
                    className={`card-btn tour-btn ${inTour ? 'in-tour' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTourShop(shop.id);
                    }}
                  >
                    <span>🚩</span> {inTour ? '巡回追加済' : '+巡回ハシゴ'}
                  </button>
                  <button
                    type="button"
                    className="card-btn"
                    title="取扱カテゴリやメモを編集"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEditShopModal(shop);
                    }}
                  >
                    <span>✏️</span> 編集
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
