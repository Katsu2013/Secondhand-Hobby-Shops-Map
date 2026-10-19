/** @file 配布JSONの実行時検証。型アサーションだけでは破損データを防げないため使用します。 */
import { BRAND_PLATES, CATEGORY_MAP, CHAIN_MAP, getEffectiveShopSubCategories, SUB_CATEGORY_MAP } from '../config/shopMaster';
import type { Shop } from '../types/shop';

/**
 * 配布データの値を検証し、画面表示に使える店舗だけを返します。
 * @param value - 検証前のJSON値
 * @returns 正規化した店舗。不正な必須項目がある場合はnull
 */
export function normalizeShop(value: unknown): Shop | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  /** 実行時の検証対象レコード */
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id.trim() || typeof row.name !== 'string' || !row.name.trim() ||
    typeof row.chain !== 'string' || !Object.hasOwn(CHAIN_MAP, row.chain) ||
    typeof row.lat !== 'number' || !Number.isFinite(row.lat) || Math.abs(row.lat) > 90 ||
    typeof row.lng !== 'number' || !Number.isFinite(row.lng) || Math.abs(row.lng) > 180) return null;
  /** 許可された列挙値だけを残し、文字列やオブジェクトの混入を取り除きます。 */
  const list = (input: unknown, master: object): string[] => Array.isArray(input)
    ? [...new Set(input.filter((item): item is string => typeof item === 'string' && Object.hasOwn(master, item)))] : [];
  /** 必須項目と任意項目を別々に検証した店舗 */
  const shop: Shop = {
    id: row.id, name: row.name, chain: row.chain as Shop['chain'], lat: row.lat, lng: row.lng,
    chains: list(row.chains, CHAIN_MAP) as NonNullable<Shop['chains']>,
    brands: list(row.brands, BRAND_PLATES) as NonNullable<Shop['brands']>,
    categories: list(row.categories, CATEGORY_MAP) as Shop['categories'],
    subCategories: list(row.subCategories, SUB_CATEGORY_MAP) as NonNullable<Shop['subCategories']>,
    address: typeof row.address === 'string' ? row.address : '',
    hours: typeof row.hours === 'string' ? row.hours : '',
    subBrand: typeof row.subBrand === 'string' ? row.subBrand : '',
    isCustom: row.isCustom === true,
    sourceIds: Array.isArray(row.sourceIds) ? row.sourceIds.filter((id): id is string => typeof id === 'string') : undefined,
    assortmentStatus: ['confirmed', 'partial', 'unverified', 'user_edited'].includes(String(row.assortmentStatus))
      ? row.assortmentStatus as Shop['assortmentStatus'] : (row.isCustom === true ? 'user_edited' : 'unverified'),
    assortmentSources: Array.isArray(row.assortmentSources) ? row.assortmentSources.filter(
      /** URLを画面のリンクに使うため、外部JSONのスキームと確認日を検証します。 */
      (source): source is NonNullable<Shop['assortmentSources']>[number] => source && typeof source === 'object' &&
        typeof source.name === 'string' && typeof source.chain === 'string' && Object.hasOwn(CHAIN_MAP, source.chain) &&
        Array.isArray(source.categories) && source.categories.every((cat: unknown) => typeof cat === 'string' && Object.hasOwn(CATEGORY_MAP, cat)) &&
        Array.isArray(source.subCategories) && source.subCategories.every((cat: unknown) => typeof cat === 'string' && Object.hasOwn(SUB_CATEGORY_MAP, cat)) &&
        typeof source.url === 'string' && /^https:\/\//.test(source.url) &&
        typeof source.checkedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt) &&
        Array.isArray(source.labels) && source.labels.every((label: unknown) => typeof label === 'string')
    ) : [],
  };
  if (!shop.chains!.length) shop.chains = [shop.chain];
  shop.subCategories = getEffectiveShopSubCategories(shop);
  // 未確認の配布レコードに推測タグが残っていても表示しないため、未確認分類は表示しません。
  if (shop.assortmentStatus === 'unverified') { shop.categories = []; shop.subCategories = []; }
  return shop;
}
