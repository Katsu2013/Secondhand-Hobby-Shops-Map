/**
 * @file src/components/Modals.tsx
 * @description Google Maps APIキー設定モーダル（`ApiKeyModal`）および
 * 店舗情報の追加・取扱カテゴリ編集モーダル（`ShopEditModal`）を提供するコンポーネント群。
 */

import React, { useEffect, useState } from 'react';
import { CATEGORIES, CHAIN_GROUPS, classifyShopByName } from '../config/shopMaster';
import type { CategoryId, ChainId, Shop } from '../types/shop';

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
            本アプリは<strong>APIキーなしでも全国約2,043店舗の内蔵マップ＋道路ルート計算</strong>がそのまま使えますが、ご自身の{' '}
            <strong>Google Maps JavaScript API キー</strong> を入力すると、以下の機能がフル解放されます：
          </p>
          <ul className="feature-list">
            <li>✅ 本家 Google マップの描画・ストリートビュー・航空写真切替</li>
            <li>✅ Google Directions API によるリアルタイム交通状況・電車乗換ルート表示</li>
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
            ※入力されたAPIキーはお使いのブラウザ（localStorage）にのみ保存され、外部サーバーへ送信されることはありません。
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

/**
 * 店舗追加・編集モーダルで保存ボタンを押した際に渡される入力データのインターフェース。
 */
export interface ShopFormSubmitData {
  /** 編集対象店舗のID（新規作成時は空文字列 `""`） */
  id: string;
  /** 店舗名 */
  name: string;
  /** 代表チェーンID */
  chain: ChainId;
  /** 取扱カテゴリIDの配列 */
  categories: CategoryId[];
  /** 緯度 */
  lat: number;
  /** 経度 */
  lng: number;
  /** 住所文字列 */
  address: string;
  /** 営業時間文字列 */
  hours: string;
}

/**
 * `ShopEditModal` コンポーネントのPropsインターフェース。
 */
export interface ShopEditModalProps {
  /** モーダルが開いているかどうか */
  isOpen: boolean;
  /** 編集対象の店舗オブジェクト（新規追加時は `null`） */
  editingShop: Shop | null;
  /** 新規追加時の初期座標として使用する現在の地図中心座標 */
  defaultCenter: { lat: number; lng: number };
  /** モーダルを閉じるコールバック */
  onClose: () => void;
  /** 店舗データを保存するコールバック */
  onSaveShop: (data: ShopFormSubmitData) => void;
  /** 編集中の店舗データを削除するコールバック */
  onDeleteShop: (shopId: string) => void;
}

/**
 * 店舗の新規手動追加および既存店舗の取扱カテゴリ・住所・座標編集を行うモーダルコンポーネント。
 *
 * @param props - `ShopEditModalProps` オブジェクト
 * @returns 店舗編集モーダルのJSX要素
 */
export const ShopEditModal: React.FC<ShopEditModalProps> = ({
  isOpen,
  editingShop,
  defaultCenter,
  onClose,
  onSaveShop,
  onDeleteShop,
}) => {
  /** フォーム：店舗名 */
  const [name, setName] = useState<string>('');
  /** フォーム：代表チェーンID */
  const [chain, setChain] = useState<ChainId>('hardoff');
  /** フォーム：営業時間 */
  const [hours, setHours] = useState<string>('');
  /** フォーム：緯度文字列 */
  const [latStr, setLatStr] = useState<string>('');
  /** フォーム：経度文字列 */
  const [lngStr, setLngStr] = useState<string>('');
  /** フォーム：住所 */
  const [address, setAddress] = useState<string>('');
  /** フォーム：選択中の取扱カテゴリID集合 */
  const [selectedCats, setSelectedCats] = useState<Set<CategoryId>>(
    new Set(['retro_game', 'pc_junk'])
  );

  // モーダルが開かれた際、編集対象店舗があればその値を、なければ初期値をフォームにセットする
  useEffect(() => {
    if (!isOpen) return;
    if (editingShop) {
      setName(editingShop.name);
      setChain(editingShop.chain);
      setHours(editingShop.hours || '');
      setLatStr(String(editingShop.lat));
      setLngStr(String(editingShop.lng));
      setAddress(editingShop.address || '');
      setSelectedCats(new Set(editingShop.categories || []));
    } else {
      setName('');
      setChain('hardoff');
      setHours('');
      setLatStr(defaultCenter.lat.toFixed(6));
      setLngStr(defaultCenter.lng.toFixed(6));
      setAddress('');
      setSelectedCats(new Set(['retro_game', 'pc_junk']));
    }
  }, [isOpen, editingShop, defaultCenter.lat, defaultCenter.lng]);

  /**
   * 新規登録時に店舗名入力欄からフォーカスが外れた際、店名からチェーンと取扱カテゴリを自動推論して補助します。
   */
  const handleNameBlur = (): void => {
    if (editingShop || !name.trim()) return;
    const inferred = classifyShopByName(name);
    setChain(inferred.chain);
    setSelectedCats(new Set(inferred.categories));
  };

  /**
   * 取扱カテゴリチェックボックスのON/OFFを切り替えます。
   *
   * @param catId - 対象のカテゴリID
   * @param checked - チェック状態
   */
  const handleToggleCat = (catId: CategoryId, checked: boolean): void => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(catId);
      } else {
        next.delete(catId);
      }
      return next;
    });
  };

  /**
   * 保存ボタンクリック時のハンドラ。入力値を検証して親へ通知します。
   */
  const handleSave = (): void => {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    onSaveShop({
      id: editingShop ? editingShop.id : '',
      name: name.trim(),
      chain,
      categories: Array.from(selectedCats),
      lat,
      lng,
      address: address.trim(),
      hours: hours.trim(),
    });
  };

  return (
    <div
      id="modal-shop-edit"
      className={`modal-backdrop ${isOpen ? '' : 'hidden'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-shop-title"
    >
      <div className="modal-dialog">
        <div className="modal-header">
          <h3 id="modal-shop-title">
            {editingShop ? '✏️ 店舗情報・取扱カテゴリの編集' : '➕ 新しい中古ショップを追加'}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="edit-shop-name">店舗名 *</label>
            <input
              type="text"
              id="edit-shop-name"
              placeholder="例: ハードオフ・ホビーオフ 秋葉原1号店"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="edit-shop-chain">チェーン種別</label>
              <select
                id="edit-shop-chain"
                value={chain}
                onChange={(e) => setChain(e.target.value as ChainId)}
              >
                {CHAIN_GROUPS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="edit-shop-hours">営業時間 (任意)</label>
              <input
                type="text"
                id="edit-shop-hours"
                placeholder="例: 10:00〜20:00"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="edit-shop-lat">緯度 (Lat) *</label>
              <input
                type="number"
                step="0.00001"
                id="edit-shop-lat"
                value={latStr}
                onChange={(e) => setLatStr(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-shop-lng">経度 (Lng) *</label>
              <input
                type="number"
                step="0.00001"
                id="edit-shop-lng"
                value={lngStr}
                onChange={(e) => setLngStr(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="edit-shop-address">住所・メモ (任意)</label>
            <input
              type="text"
              id="edit-shop-address"
              placeholder="例: 駐車場30台あり、ジャンクコーナー充実"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>取り扱っているカテゴリ（複数選択可）</label>
            <div id="edit-shop-categories" className="edit-cat-grid">
              {CATEGORIES.map((cat) => {
                const isChecked = selectedCats.has(cat.id);
                return (
                  <label
                    key={cat.id}
                    className={`filter-item ${isChecked ? 'checked' : 'unchecked'}`}
                  >
                    <div className="filter-item-left">
                      <input
                        type="checkbox"
                        value={cat.id}
                        className="edit-cat-chk"
                        checked={isChecked}
                        onChange={(e) => handleToggleCat(cat.id, e.target.checked)}
                      />
                      <span>{cat.icon}</span>
                      <span className="filter-name">{cat.shortName}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {editingShop && (
            <button
              id="btn-delete-shop"
              type="button"
              className="btn-danger"
              onClick={() => onDeleteShop(editingShop.id)}
            >
              削除
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button id="btn-save-shop" type="button" className="btn-primary" onClick={handleSave}>
            保存する
          </button>
        </div>
      </div>
    </div>
  );
};
