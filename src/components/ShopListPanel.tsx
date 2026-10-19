/**
 * @file src/components/ShopListPanel.tsx
 * @description 画面右側に配置される「表示エリア内の店舗一覧」パネルコンポーネント。
 * 現在地図の画面内に収まっているフィルタ済み店舗を所要時間が短い順などに並べて表示し、
 * ワンクリックでのルート表示、複数店舗の巡回（ハシゴ）ルート追加機能を提供します。
 */

import React, { useState } from 'react';
import {
  CHAIN_GROUPS,
  CHAIN_MAP,
  CATEGORY_MAP,
  getEffectiveShopSubCategories,
  getShopActivePlates,
  getGeoAssortmentNotice,
  SUB_CATEGORY_MAP,
  TRAVEL_MODE_MAP,
  TRAVEL_MODES,
} from '../config/shopMaster';
import type { ChainId, Shop, SortByMode, SubCategoryId, TravelModeId } from '../types/shop';

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
  /** 現在ONになっている詳細サブジャンルIDのSet（店舗カード上のタグ強調表示用） */
  enabledSubCategories?: ReadonlySet<SubCategoryId>;
  /** マップと同じ業態のロゴだけを表示するための有効チェーン */
  enabledChains: ReadonlySet<ChainId>;
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
  enabledSubCategories,
  enabledChains,
  listSearchText,
  onChangeListSearchText,
  sortBy,
  onChangeSortBy,
  onSelectShop,
  onToggleTourShop,
  onClearTour,
  onCalculateTourRoute,
}) => {
  /** 現在の移動手段オブジェクト */
  const currentMode = TRAVEL_MODE_MAP[travelMode] || TRAVEL_MODES[0];
  /** パフォーマンス維持のため上位120件に切り出した店舗配列 */
  /** 続きを表示することで120件以降も選択可能にします。 */
  const [displayLimit, setDisplayLimit] = useState(120);
  /** スマホで一覧性を保ちつつ、必要な店舗の詳細だけ展開する状態 */
  const [expandedDetails, setExpandedDetails] = useState<ReadonlySet<string>>(new Set());
  /** 現在表示するカード */
  const listItems = viewportShops.slice(0, displayLimit);

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
          地図のみ
        </button>
      </div>

      {/* リスト内フィルタ・並び替えツールバー */}
      <div className="list-toolbar">
        <input
          type="text"
          id="input-list-filter"
          className="list-search-input"
          placeholder="店名・市区町村"
          aria-label="店舗一覧を店名・市区町村で絞り込み"
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
            /** 代表チェーンの定義オブジェクト */
            const primaryChain = CHAIN_MAP[shop.chain] || CHAIN_GROUPS[0];
            /** 店舗が現在選択中かどうか */
            const isSelected = shop.id === selectedShopId;
            /** 店舗が巡回（ハシゴ）リストに含まれているかどうか */
            const inTour = tourShopIds.includes(shop.id);
            /** 移動所要時間・距離・閉店判定の計算結果オブジェクト */
            const travel = shop._travel;
            /** モバイルの詳細を閉じても、通常ゲオの取得範囲の制限は常に読めるようにする注意文 */
            const assortmentNotice = getGeoAssortmentNotice(shop);

            return (
              <div
                key={shop.id}
                className={`shop-card ${isSelected ? 'active' : ''}`}
                style={{ '--card-chain-color': primaryChain.color } as React.CSSProperties}
                onClick={() => onSelectShop(shop)}
              >
                <div className="shop-brand-plates" aria-label="店舗ブランド">
                  {getShopActivePlates(shop, enabledChains).map((plate, index) => (
                    <div key={`${plate.chainId}-${index}`} className={`brand-plate ${plate.cls}`}
                      dangerouslySetInnerHTML={{ __html: plate.html }} />
                  ))}
                </div>
                <div className="shop-card-top">
                  <div className="shop-card-title-group">
                    <div className="shop-card-name">{shop.name}</div>
                  </div>

                  <div
                    className={`shop-time-box ${travel?.trafficConsidered ? 'exact' : ''}`}
                    title={
                      travel?.trafficConsidered
                        ? 'Googleの渋滞を考慮した予測時間'
                        : '直線距離と移動手段からの概算所要時間（クリックでルートを検索）'
                    }
                  >
                    <span className="shop-time-main">
                      {currentMode.icon} {travel?.trafficConsidered ? '約(渋滞考慮)' : '約'}
                      {travel?.formattedTime || '--分'}
                    </span>
                    <span className="shop-dist-sub">
                      {travel?.formattedDist || ''} {travel?.trafficConsidered ? '(交通予測)' : '(概算・渋滞未考慮)'}
                    </span>
                  </div>
                </div>

                {travel?.closingInfo && (
                  <div className={`shop-closing-badge status-${travel.closingInfo.status}`}>
                    {travel.closingInfo.badgeLabel}
                  </div>
                )}

                {assortmentNotice && <p className="shop-assortment-warning">{assortmentNotice}</p>}
                <button type="button" className="card-details-toggle show-mobile-only"
                  aria-expanded={expandedDetails.has(shop.id)} aria-controls={`shop-details-${shop.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedDetails(previous => {
                      const next = new Set(previous);
                      if (next.has(shop.id)) next.delete(shop.id); else next.add(shop.id);
                      return next;
                    });
                  }}>
                  {expandedDetails.has(shop.id) ? '取扱商品・店舗情報を閉じる ▲' : '取扱商品・住所・営業時間 ▼'}
                </button>
                <div id={`shop-details-${shop.id}`} className={`shop-card-details ${expandedDetails.has(shop.id) ? 'expanded' : ''}`}>
                <div className="shop-cat-tags">
                  {shop.categories.filter((cat) => !getEffectiveShopSubCategories(shop).some((sub) => SUB_CATEGORY_MAP[sub].parentId === cat)).map((cat) => (
                    <span className="cat-pill" key={cat}>{CATEGORY_MAP[cat].shortName}（詳細未確認）</span>
                  ))}
                  {(() => {
                    /** 店舗が取り扱うすべての有効な詳細サブジャンルID配列 */
                    const allSubs = getEffectiveShopSubCategories(shop);
                    /** 選択中（ON）のジャンルを優先的に先頭へ並べ替えた詳細ジャンル配列 */
                    const sortedSubs = [...allSubs].sort((a, b) => {
                      const aOn = enabledSubCategories ? (enabledSubCategories.has(a) ? 0 : 1) : 0;
                      const bOn = enabledSubCategories ? (enabledSubCategories.has(b) ? 0 : 1) : 0;
                      return aOn - bOn;
                    });
                    /** カード上に常時表示する上位8件のジャンル配列 */
                    const visibleSubs = sortedSubs.slice(0, 8);
                    /** 「+Nジャンル」として折りたたむ9件目以降のジャンル配列 */
                    const hiddenSubs = sortedSubs.slice(8);
                    /** ユーザーによって一部のジャンルに絞り込み中かどうかの真偽値 */
                    const isNarrowed =
                      enabledSubCategories && enabledSubCategories.size < 27;

                    return (
                      <>
                        {visibleSubs.map((subId) => {
                          /** 詳細サブジャンルのマスター定義 */
                          const sub = SUB_CATEGORY_MAP[subId];
                          if (!sub) return null;
                          /** 絞り込み条件に一致してハイライト表示すべきかどうかの真偽値 */
                          const isHighlighted =
                            isNarrowed && enabledSubCategories?.has(subId);
                          return (
                            <span
                              key={subId}
                              className={`cat-pill ${isHighlighted ? 'cat-pill-highlight' : ''}`}
                              title={sub.name}
                            >
                              {sub.icon} {sub.shortName}
                            </span>
                          );
                        })}

                        {hiddenSubs.length > 0 && (
                          <span
                            className="cat-pill cat-pill-more"
                            title={`その他の取扱ジャンル: ${hiddenSubs
                              .map((sid) => SUB_CATEGORY_MAP[sid]?.shortName || sid)
                              .join(' / ')}`}
                          >
                            +{hiddenSubs.length}ジャンル
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="shop-assortment-note">
                  {shop.assortmentStatus === 'user_edited' ? '取扱商品：ユーザー設定' :
                    shop.assortmentStatus === 'unverified' || !shop.assortmentSources?.length ? '取扱商品：未確認' :
                      shop.assortmentStatus === 'partial' ? '取扱商品：一部のみ公式情報で確認' : '取扱商品：店舗別の公式掲載情報'}
                  {shop.assortmentSources?.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}
                      title={source.labels.join(' / ')}>{source.name}の公式情報（{source.checkedAt}確認）</a>
                  ))}
                  <span>掲載品目は現在の在庫を保証しません。</span>
                </div>

                {(shop.address || shop.hours) && (
                  <div className="shop-meta-text">
                    {shop.address && <span>📍 {shop.address}</span>}
                    {shop.hours && <span>🕒 営業: {shop.hours}</span>}
                  </div>
                )}

                </div>
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
                </div>
              </div>
            );
          })
        )}
        {viewportShops.length > displayLimit && (
          <button type="button" className="opt-btn" onClick={() => setDisplayLimit(limit => limit + 120)}>
            続きを表示（{listItems.length} / {viewportShops.length}店舗）
          </button>
        )}
      </div>
    </aside>
  );
};
