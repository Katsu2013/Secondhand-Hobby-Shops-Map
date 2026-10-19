"""更新用JSONの検証・安定ID・原子的な保存を共通化する。

通信障害や入力形式の変更で、不完全なDBを自動公開しないための処理。
"""
import hashlib
import json
import math
import os
import re
from pathlib import Path
import unicodedata
import time


def identity_key(namespace, shop):
    """取得順によらない店舗識別キー。既存ID台帳との照合にも使用する。"""
    def normalize(value):
        return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value)).lower()
    raw = namespace + "\0" + normalize(shop["name"]) + "\0" + normalize(shop["address"])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def stable_shop_id(namespace, shop, registry):
    """既存の採番を引き継ぎ、新店舗は内容から決定的なIDを生成する。"""
    key = identity_key(namespace, shop)
    return registry["entries"].get(key, f"{namespace}_{key[:20]}")


def atomic_json_write(path, data):
    """同じディレクトリで書込み完了後に置換し、途中切断によるJSON破損を防ぐ。"""
    if os.path.exists(path):
        with open(path, encoding="utf-8") as existing:
            if json.load(existing) == data:
                return
    temporary = str(path) + ".tmp"
    try:
        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            handle.write("\n")
        # Windowsの開発サーバーやウイルス検査が一時的にファイルを開いている場合だけ再試行する。
        for attempt in range(8):
            try:
                os.replace(temporary, path)
                break
            except PermissionError as error:
                if getattr(error, 'winerror', None) not in (5, 32, 33) or attempt == 7:
                    raise
                time.sleep(min(0.05 * 2 ** attempt, 0.5))
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)


def validate_database(shops, previous_count=0):
    """必須項目・座標・IDの一意性と大幅な件数減少を公開前に検出する。"""
    if not isinstance(shops, list) or not shops:
        raise ValueError("店舗DBが空または配列ではありません")
    if previous_count and len(shops) < previous_count * 0.85:
        raise ValueError("店舗DBが前回の85%未満です。既存の公開DBを維持します")
    with open(Path(__file__).resolve().parents[1] / "data/shops.schema.json", encoding="utf-8") as handle:
        schema = json.load(handle)["items"]
    seen = set()
    chains = set(schema['properties']['chain']['enum'])
    for shop in shops:
        if not isinstance(shop, dict) or not isinstance(shop.get("id"), str) or not shop["id"]:
            raise ValueError("店舗IDがありません")
        if shop["id"] in seen:
            raise ValueError(f"店舗IDが重複しています: {shop['id']}")
        seen.add(shop["id"])
        if set(schema['required']) - set(shop):
            raise ValueError(f"必須の店舗項目がありません: {shop['id']}")
        if shop.get('assortmentStatus') not in schema['properties']['assortmentStatus']['enum']:
            raise ValueError(f"取扱確認状態が不正です: {shop['id']}")
        sources = shop.get('assortmentSources')
        if not isinstance(sources, list):
            raise ValueError(f"取扱出典が不正です: {shop['id']}")
        for source in sources:
            if (not isinstance(source, dict) or set(source) != {'url', 'checkedAt', 'labels', 'name', 'chain', 'categories', 'subCategories'} or
                not isinstance(source['name'], str) or source['chain'] not in chains or
                any(not isinstance(source[field], list) or any(cat not in schema['properties'][field]['items']['enum'] for cat in source[field]) for field in ('categories', 'subCategories')) or
                not isinstance(source['url'], str) or not source['url'].startswith('https://') or
                not isinstance(source['checkedAt'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', source['checkedAt']) or
                not isinstance(source['labels'], list) or not all(isinstance(label, str) for label in source['labels'])):
                raise ValueError(f"取扱出典の構造が不正です: {shop['id']}")
        if set(shop) - set(schema["properties"]):
            raise ValueError(f"未知の店舗項目があります: {shop['id']}")
        if not isinstance(shop.get("name"), str) or not shop["name"] or shop.get("chain") not in chains:
            raise ValueError(f"店舗名・チェーンが不正です: {shop['id']}")
        for field, limit in (("lat", 90), ("lng", 180)):
            value = shop.get(field)
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or abs(value) > limit:
                raise ValueError(f"座標が不正です: {shop['id']}")
        for field in ("chains", "brands", "categories", "subCategories", "sourceIds"):
            if not isinstance(shop.get(field), list) or not all(isinstance(item, str) for item in shop[field]):
                raise ValueError(f"配列項目が不正です: {shop['id']} {field}")
            definition = schema["properties"][field]
            if len(set(shop[field])) != len(shop[field]) or len(shop[field]) < definition.get("minItems", 0):
                raise ValueError(f"配列が空または重複しています: {shop['id']} {field}")
            allowed = definition["items"].get("enum")
            if allowed and any(item not in allowed for item in shop[field]):
                raise ValueError(f"未知の分類があります: {shop['id']} {field}")
        if not isinstance(shop.get("hours", ""), str) or not isinstance(shop.get("address", ""), str):
            raise ValueError(f"文字列項目が不正です: {shop['id']}")
