"""
@file scripts/update_all_official_data.py
@description 全国の各中古・ホビーショップチェーン公式サイト・公式APIから最新の店舗一覧を取得し、
国土地理院APIによる番地レベルジオコーディングおよび27詳細サブジャンル自動判定を経て
`data/shops.json` / `public/data/shops.json` を最新状態に再構築する統合バッチスクリプト。

【なぜこのスクリプトが必要か】
新店舗のオープン・閉店・営業時間変更・取扱ジャンル変更を定期的に自動反映できるよう、
GitHub Actions の定期実行（cron）やローカルの `npm run update-data` から単一コマンドで
全チェーンの一次情報取得からデータベース生成までを安全（フォールバック保護付き）に実行するためです。
"""

from pipeline_support import atomic_json_write
import json
import os
import re
import ssl
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

from fetch_official_all import fetch_all_hardoff, fetch_all_surugaya
from geocode_and_build import build_master_database

ctx = ssl.create_default_context()
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}


def fetch_url(url: str, timeout: int = 25) -> str:
    """指定URLからUTF-8文字列を取得するヘルパー関数。"""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def save_json_safely(filepath: str, data: list, min_expected_count: int, label: str) -> bool:
    """
    取得した店舗リストが最小期待件数以上の場合のみJSONファイルを上書き保存する安全ガード関数。
    通信障害や相手先サイトのメンテナンス時に店舗データが0件等で破損するのを防ぎます。
    """
    if not isinstance(data, list) or len(data) < min_expected_count:
        print(
            f"[WARN] {label}: 取得件数 ({len(data) if isinstance(data, list) else 0}件) が "
            f"最小期待件数 ({min_expected_count}件) 未満のため、既存の {filepath} を維持します。"
        )
        return False

    # 件数だけでなくレコード形式と前回比も検証し、部分取得を全件取得と誤認しない。
    required = ("title",) if "bookoff" in filepath else ("name", "address")
    if any(not isinstance(item, dict) or any(not isinstance(item.get(key), str) or not item[key].strip() for key in required) for item in data):
        print(f"[WARN] {label}: レコード形式が不正なため既存データを維持します。")
        return False
    if os.path.exists(filepath):
        with open(filepath, encoding="utf-8") as handle:
            previous = json.load(handle)
        if len(data) < len(previous) * 0.85:
            print(f"[WARN] {label}: 前回の85%未満のため既存データを維持します。")
            return False
    atomic_json_write(filepath, data)
    print(f"[OK] {label}: 最新 {len(data)} 店舗を {filepath} に保存しました。")
    return True


# ============================================================================
# 1. 駿河屋 フレンドリーショップ公式一覧の取得
# ============================================================================
def fetch_all_surugaya_friendly() -> list:
    """駿河屋公式サイトから全国のフレンドリーショップ一覧を取得する。"""
    print("Fetching Surugaya Friendly Shops...")
    html = fetch_url("https://www.suruga-ya.jp/feature/shoplist-friendly/index.html")
    pref_links = sorted(
        list(set(re.findall(r"/feature/shoplist-friendly/[a-z0-9_-]+\.html", html)))
    )
    pref_links = [p for p in pref_links if not p.endswith("index.html")]

    friendly_stores = []
    seen = set()
    for p in pref_links:
        try:
            p_html = fetch_url("https://www.suruga-ya.jp" + p)
            parts = p_html.split('<div class="tenpo-name">')[1:]
            for part in parts:
                name_m = re.search(r">\s*([^<]+?)\s*</a>", part) or re.search(
                    r"^([^<]+)<", part
                )
                name = name_m.group(1).strip() if name_m else ""
                addr_m = re.search(r'<div class="tenpo-address">(.*?)</div>', part, re.S)
                addr_raw = addr_m.group(1) if addr_m else ""
                addr_clean = re.sub(r"<a[^>]*>.*?</a>", "", addr_raw, flags=re.S)
                addr_clean = re.sub(r"<[^>]+>", " ", addr_clean)
                addr_clean = re.sub(r"〒\s*\d{3}-\d{4}", "", addr_clean)
                addr_clean = re.sub(r"\s+", " ", addr_clean).strip()
                if name and addr_clean:
                    if "駿河屋" not in name:
                        name = f"{name} (駿河屋FS)"
                    if name not in seen:
                        seen.add(name)
                        friendly_stores.append(
                            {"name": name, "address": addr_clean, "hours": ""}
                        )
        except Exception as e:
            print(f"[WARN] Surugaya FS page {p}: {e}")
    return friendly_stores


# ============================================================================
# 2. ブックオフグループ公式検索JSON API (BOOKOFF / PLUS / SUPER BAZAAR)
# ============================================================================
def fetch_all_bookoff() -> list:
    """ブックオフ公式店舗検索APIから全店舗の最新JSONデータを取得する。"""
    print("Fetching BOOKOFF official JSON API...")
    all_docs = []
    seen_ids = set()
    for page in range(1, 15):
        url = f"https://as.blue.asp.appirits.com/bookoff2/search.json?limit=100&page={page}"
        try:
            raw = json.loads(fetch_url(url, timeout=30))
            docs = raw.get("result", {}).get("items") or raw.get("document", [])
            if not docs:
                break
            for d in docs:
                did = str(d.get("id", ""))
                if did and did not in seen_ids:
                    seen_ids.add(did)
                    all_docs.append(d)
            if len(docs) < 100:
                break
        except Exception as e:
            print(f"[WARN] Bookoff API page {page} failed: {e}")
            break
    print(f"Fetched {len(all_docs)} official Bookoff stores.")
    return all_docs


# ============================================================================
# 3. らしんばん公式JSON API
# ============================================================================
def fetch_all_lashinbang() -> list:
    """らしんばん公式APIから国内全店舗の最新リストを取得する。"""
    print("Fetching Lashinbang official JSON API...")
    lash_json = json.loads(fetch_url("https://api.lashinbang.com/api/get_store"))
    lash_stores = []
    for item in lash_json.get("items", []):
        # Area 13 = 海外, 14 = 通信販売
        if str(item.get("area")) in ("13", "14"):
            continue
        name = item.get("name", "").strip()
        if name and not name.startswith("らしんばん"):
            name = f"らしんばん {name}"
        addr = item.get("address", "").strip()
        hours = re.sub(r"\s+", " ", item.get("opening_hour", "")).strip()
        if name and addr:
            lash_stores.append({"name": name, "address": addr, "hours": hours})
    return lash_stores


# ============================================================================
# 4. 古本市場・ふるいち公式店舗一覧
# ============================================================================
def fetch_all_furuichi() -> list:
    """古本市場・ふるいち公式サイトから全国店舗リストを取得する。"""
    print("Fetching Furuichi official store page...")
    html = fetch_url("https://www.furu1.net/shop/", timeout=30)
    with open("scripts/furuichi.html", "w", encoding="utf-8") as f:
        f.write(html)

    stores = []
    seen = set()
    blocks = html.split('shop__display__content__title__name__text">')[1:]
    for blk in blocks:
        name = blk.split("</span>")[0].strip()
        addr_m = re.search(
            r'shop__display__content__detail__block__dd__text">\s*([^<]+?)\s*</p>',
            blk,
            re.S,
        )
        addr = re.sub(r"\s+", " ", addr_m.group(1)).strip() if addr_m else ""
        m_det = re.search(
            r'accordion-time-content__list__detail">\s*([^<]+?)\s*</p>', blk
        )
        m_end = re.search(r"営業終了\s*(\d{1,2}:\d{2})", blk)
        hours = ""
        if m_det:
            hours = m_det.group(1).strip().replace("~", "～")
        elif m_end:
            hours = f"10:00～{m_end.group(1)}"

        if name and addr and name not in seen:
            seen.add(name)
            stores.append({"name": name, "address": addr, "hours": hours})
    return stores


# ============================================================================
# 5. お宝創庫グループ公式店舗一覧
# ============================================================================
def fetch_all_otakarasouko() -> list:
    """お宝創庫グループ公式サイトから店舗リストを取得する。"""
    print("Fetching Otakarasouko official store page...")
    html = fetch_url("https://www.otakarasouko.com/store/", timeout=30)
    with open("scripts/otakarasouko.html", "w", encoding="utf-8") as f:
        f.write(html)

    stores = []
    seen = set()
    items = re.findall(
        r'<p class="name">([^<]+)</p>\s*<p class="address">([^<]+)</p>', html, re.S
    )
    for name_raw, addr_raw in items:
        name = name_raw.strip()
        addr = re.sub(r"\s+", " ", addr_raw).strip()
        if name and addr and name not in seen:
            seen.add(name)
            stores.append({"name": name, "address": addr, "hours": ""})
    return stores


# ============================================================================
# 6. ゲオ (GEO) 公式店舗検索（47都道府県）
# ============================================================================
def fetch_all_geo() -> list:
    """現行の全国一覧から店舗番号を取得し、既存IDを保持する。"""
    from update_assortments import parse_geo_index
    stores = parse_geo_index(fetch_url("https://geo-mobile.jp/store/index.html"))
    with open("scripts/official_geo.json", encoding="utf-8") as handle:
        previous = {int(item['id'].removeprefix('geo_off_')): item['id'] for item in json.load(handle)}
    for item in stores:
        item['id'] = previous.get(int(item['id'].removeprefix('geo_off_')), item['id'])
    return stores


# ============================================================================
# 7. イエローサブマリン 公式店舗一覧
# ============================================================================
def fetch_all_yellowsubmarine() -> list:
    """イエローサブマリン公式サイトから店舗一覧を取得する。"""
    print("Fetching Yellow Submarine official stores...")
    import html
    html_top = fetch_url("https://yellowsubmarine.co.jp/", timeout=15)
    shop_urls = []
    for m in re.finditer(r'href=[\'"](https://yellowsubmarine\.co\.jp/shop/[^\'"]+)[\'"]', html_top):
        u = m.group(1)
        if u != "https://yellowsubmarine.co.jp/shop/" and u not in shop_urls:
            shop_urls.append(u)
    stores = []
    for u in shop_urls:
        try:
            page_html = fetch_url(u, timeout=15)
            title_m = re.search(r"<title>(.*?)</title>", page_html, re.I)
            raw_title = title_m.group(1) if title_m else ""
            name = raw_title.split("|")[0].split("-")[0].strip()
            if not name.startswith("イエローサブマリン"):
                name = f"イエローサブマリン {name}"
            trs = re.findall(r"<tr.*?>(.*?)</tr>", page_html, flags=re.DOTALL | re.I)
            data = {}
            for tr in trs:
                th = re.search(r"<th.*?>(.*?)</th>", tr, flags=re.DOTALL | re.I)
                td = re.search(r"<td.*?>(.*?)</td>", tr, flags=re.DOTALL | re.I)
                if th and td:
                    th_text = re.sub(r"<[^>]+>", "", th.group(1)).strip()
                    td_text = re.sub(r"<br\s*/?>", " / ", td.group(1))
                    td_text = re.sub(r"<[^>]+>", " ", td_text).strip()
                    data[th_text] = html.unescape(" ".join(td_text.split()))
            addr = data.get("所在地", "")
            hours = data.get("営業時間", "")
            tel = data.get("電話番号", "") or data.get("連絡先", "")
            if not addr:
                m_addr = re.search(r"(&#12306;[^\n<]+(?:都|道|府|県)[^\n<]+)", page_html)
                if m_addr:
                    addr = html.unescape(re.sub(r"<[^>]+>", " ", m_addr.group(1)).strip())
            addr_clean = re.sub(r"^[〒\d\- ]+", "", addr).strip()
            categories = ["tcg", "figure_hobby"]
            sub_categories = ["sub_tcg_card", "sub_board_game"]
            if any(w in page_html for w in ["プラモデル", "スケールモデル", "ガンプラ", "プラモ"]):
                sub_categories.append("sub_plamo")
            if any(w in page_html for w in ["フィギュア", "トイ", "キャラクター"]):
                sub_categories.append("sub_figure")
            stores.append({
                "name": name,
                "chain": "yellowsubmarine",
                "chains": ["yellowsubmarine"],
                "brands": ["yellowsubmarine"],
                "url": u,
                "address": addr,
                "clean_address": addr_clean,
                "tel": tel,
                "hours": hours,
                "categories": categories,
                "subCategories": sorted(list(set(sub_categories))),
            })
        except Exception as e:
            print(f"[WARN] Yellow Submarine {u} error: {e}")
    return stores


# ============================================================================
# 8. ポポンデッタ 公式店舗一覧
# ============================================================================
def fetch_all_popondetta() -> list:
    """ポポンデッタ公式サイトから店舗一覧を取得する。"""
    print("Fetching Popondetta official stores...")
    import html
    page_html = fetch_url("https://popondetta.com/map.html", timeout=15)
    tables = re.findall(r"<table.*?</table>", page_html, flags=re.DOTALL | re.I)
    if not tables:
        return []
    rows = re.findall(r"<tr.*?</tr>", tables[0], flags=re.DOTALL | re.I)
    stores = []
    current_pref = ""
    for r in rows:
        tds = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, flags=re.DOTALL | re.I)
        cells = [html.unescape(" ".join(re.sub(r"<[^>]+>", " ", td).strip().split())) for td in tds]
        if not cells or len(cells) <= 1 or any("店舗名" in c for c in cells):
            continue
        if len(cells) >= 6:
            current_pref = cells[0]
            name, addr, tel, hours = cells[1], cells[2], cells[3], cells[4]
        elif len(cells) == 5:
            name, addr, tel, hours = cells[0], cells[1], cells[2], cells[3]
        else:
            continue
        name = name.strip()
        full_name = f"ポポンデッタ {name}" if not name.startswith("ポポンデッタ") else name
        addr_clean = re.sub(r"^[〒\d\- ]+", "", addr).strip()
        stores.append({
            "name": full_name,
            "chain": "popondetta",
            "chains": ["popondetta"],
            "brands": ["popondetta"],
            "pref": current_pref,
            "address": addr,
            "clean_address": addr_clean,
            "tel": tel,
            "hours": hours,
            "categories": ["figure_hobby"],
            "subCategories": ["sub_minicar_rail"],
        })
    return stores



def main() -> None:
    """全チェーンの公式データを順次更新し、マスターDBをビルドするメイン処理。"""
    t0 = time.time()
    print("=== Starting automated official store data update ===")

    # 1. 駿河屋（リアルストア & フレンドリーショップ）
    try:
        su_real = fetch_all_surugaya()
        save_json_safely("scripts/official_surugaya.json", su_real, 80, "駿河屋リアルストア")
    except Exception as e:
        print(f"[WARN] Surugaya fetch error: {e}")

    try:
        su_fs = fetch_all_surugaya_friendly()
        save_json_safely(
            "scripts/official_surugaya_friendly.json", su_fs, 30, "駿河屋フレンドリーショップ"
        )
    except Exception as e:
        print(f"[WARN] Surugaya FS fetch error: {e}")

    # 2. ハードオフグループ全店
    try:
        ho_stores = fetch_all_hardoff()
        save_json_safely("scripts/official_hardoff.json", ho_stores, 800, "ハードオフグループ")
    except Exception as e:
        print(f"[WARN] Hard Off fetch error: {e}")

    # 3. ブックオフグループ全店
    try:
        bo_stores = fetch_all_bookoff()
        save_json_safely("scripts/official_bookoff.json", bo_stores, 500, "ブックオフグループ")
    except Exception as e:
        print(f"[WARN] Bookoff fetch error: {e}")

    # 4. らしんばん全店
    try:
        lash_stores = fetch_all_lashinbang()
        save_json_safely("scripts/official_lashinbang.json", lash_stores, 45, "らしんばん")
    except Exception as e:
        print(f"[WARN] Lashinbang fetch error: {e}")

    # 5. 古本市場・ふるいち全店
    try:
        furu_stores = fetch_all_furuichi()
        save_json_safely("scripts/official_furuichi.json", furu_stores, 120, "古本市場・ふるいち")
    except Exception as e:
        print(f"[WARN] Furuichi fetch error: {e}")

    # 6. お宝創庫グループ全店
    try:
        ota_stores = fetch_all_otakarasouko()
        save_json_safely("scripts/official_otakarasouko.json", ota_stores, 35, "お宝創庫グループ")
    except Exception as e:
        print(f"[WARN] Otakarasouko fetch error: {e}")

    # 7. ゲオ (GEO) 全店
    try:
        geo_stores = fetch_all_geo()
        save_json_safely("scripts/official_geo.json", geo_stores, 500, "ゲオ (GEO)")
    except Exception as e:
        print(f"[WARN] GEO fetch error: {e}")

    # 8. イエローサブマリン全店
    try:
        ys_stores = fetch_all_yellowsubmarine()
        save_json_safely("scripts/official_yellowsubmarine.json", ys_stores, 20, "イエローサブマリン")
    except Exception as e:
        print(f"[WARN] Yellow Submarine fetch error: {e}")

    # 9. ポポンデッタ全店
    try:
        popon_stores = fetch_all_popondetta()
        save_json_safely("scripts/official_popondetta.json", popon_stores, 35, "ポポンデッタ")
    except Exception as e:
        print(f"[WARN] Popondetta fetch error: {e}")

    # 中古PC・スマホ専門店。店舗ごとの販売情報も同時に検証して保存する。
    from update_pc_shops import update_pc_shops
    update_pc_shops()

    # OSM補完は検証済みの追跡対象スナップショットへ更新し、障害時は保持する。
    from update_osm_supplement import update_osm_supplement
    update_osm_supplement()

    # 店舗別販売品目を確認する。失敗した出典は以前の確認日付き情報を保持する。
    from update_assortments import update_assortments
    update_assortments()

    # 8. 国土地理院ジオコーディング＆複合店統合・27詳細サブジャンル付与ビルド
    print("=== Running geocode_and_build.build_master_database() ===")
    build_master_database()
    print(f"=== All done in {time.time() - t0:.1f}s! ===")


if __name__ == "__main__":
    main()
