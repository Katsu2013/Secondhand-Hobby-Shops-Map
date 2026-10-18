import json
import os
import re
import ssl
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

ctx = ssl._create_unverified_context()
HEADERS = {"User-Agent": "Mozilla/5.0"}

def clean_address_for_geocode(addr):
    a = str(addr or "").strip()
    a = re.sub(r'〒\s*\d{3}-?\d{4}\s*', '', a)
    a = a.translate(str.maketrans("０１２３４５６７８９－ー−‐　", "0123456789---- "))
    a = re.sub(r'\s+', ' ', a)
    return a.strip()

def extract_core_address_key(addr):
    a = clean_address_for_geocode(addr)
    parts = a.split(" ")
    core = parts[0]
    core = re.sub(r'[0-9B]+F.*$', '', core)
    m = re.match(r'^(.+?[都道府県].+?[市区町村郡].+?\d+(?:-\d+|\d*丁目\d*番\d*号?|\d*番地\d*))', core)
    if m:
        return m.group(1)
    return core

GSI_CACHE_FILE = "scripts/gsi_geocode_cache.json"
if os.path.exists(GSI_CACHE_FILE):
    with open(GSI_CACHE_FILE, "r", encoding="utf-8") as f:
        gsi_cache = json.load(f)
else:
    gsi_cache = {}

def geocode_gsi(addr):
    clean = clean_address_for_geocode(addr)
    if not clean:
        return None
    if clean in gsi_cache:
        return gsi_cache[clean]

    core = extract_core_address_key(addr)
    candidates = []
    if core:
        candidates.append(core)
    if clean not in candidates:
        candidates.append(clean)

    m_chome = re.match(r'^(.+?[都道府県].+?[市区町村郡].+?(?:\d+丁目|\d+-\d+|\d+))', core)
    if m_chome and m_chome.group(1) not in candidates:
        candidates.append(m_chome.group(1))

    m_town = re.match(r'^(.+?[都道府県].+?[市区町村郡][^\d]+)', core)
    if m_town and m_town.group(1) not in candidates:
        candidates.append(m_town.group(1))

    for q in candidates:
        try:
            url = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + urllib.parse.quote(q)
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
                data = json.loads(r.read().decode("utf-8"))
            if data and len(data) > 0:
                coords = data[0]["geometry"]["coordinates"] # [lng, lat]
                res = {"lat": round(float(coords[1]), 6), "lng": round(float(coords[0]), 6)}
                gsi_cache[clean] = res
                return res
        except Exception:
            pass

    return None

SUB_TO_PARENT = {
    "sub_retro_game": "retro_game",
    "sub_modern_game": "retro_game",
    "sub_tcg_card": "tcg",
    "sub_board_game": "tcg",
    "sub_figure": "figure_hobby",
    "sub_plamo": "figure_hobby",
    "sub_minicar_rail": "figure_hobby",
    "sub_retro_toy": "figure_hobby",
    "sub_pc_junk": "pc_junk",
    "sub_smartphone": "pc_junk",
    "sub_camera": "pc_junk",
    "sub_tool_diy": "pc_junk",
    "sub_home_appliance": "pc_junk",
    "sub_audio": "audio_inst",
    "sub_instrument": "audio_inst",
    "sub_vinyl_record": "audio_inst",
    "sub_comic_book": "book_media",
    "sub_doujin": "book_media",
    "sub_anime_goods": "book_media",
    "sub_otome_goods": "book_media",
    "sub_cd_dvd": "book_media",
    "sub_apparel": "apparel_life",
    "sub_luxury_brand": "apparel_life",
    "sub_outdoor_sport": "apparel_life",
    "sub_car_bike": "apparel_life",
    "sub_liquor": "apparel_life",
    "sub_furniture_zakka": "apparel_life",
}

def derive_parent_categories(sub_cats):
    parents = {SUB_TO_PARENT[sc] for sc in sub_cats if sc in SUB_TO_PARENT}
    return sorted(parents)

HO_LOGO_MAP = {
    "hard_off": (
        "hardoff",
        "hardoff",
        [
            "sub_pc_junk",
            "sub_smartphone",
            "sub_camera",
            "sub_tool_diy",
            "sub_home_appliance",
            "sub_audio",
            "sub_instrument",
            "sub_vinyl_record",
            "sub_retro_game",
            "sub_modern_game",
        ],
    ),
    "hard_gakki": ("hardoff", "hardoff", ["sub_instrument", "sub_audio", "sub_vinyl_record"]),
    "kougukan": ("hardoff", "hardoff", ["sub_tool_diy"]),
    "hard_pc": ("hardoff", "hardoff", ["sub_pc_junk", "sub_smartphone"]),
    "kamerakan": ("hardoff", "hardoff", ["sub_camera"]),
    "off_house": (
        "offhouse",
        "offhouse",
        [
            "sub_apparel",
            "sub_luxury_brand",
            "sub_outdoor_sport",
            "sub_furniture_zakka",
            "sub_home_appliance",
        ],
    ),
    "outdoor": ("offhouse", "offhouse", ["sub_outdoor_sport", "sub_apparel"]),
    "mode_off": ("offhouse", "modeoff", ["sub_apparel", "sub_luxury_brand"]),
    "mode_off_vintage": ("offhouse", "modeoff", ["sub_apparel", "sub_luxury_brand"]),
    "garage_off": ("offhouse", "garageoff", ["sub_car_bike", "sub_tool_diy"]),
    "liquor_off": ("offhouse", "liquoroff", ["sub_liquor"]),
    "hobby_off": (
        "hobbyoff",
        "hobbyoff",
        [
            "sub_figure",
            "sub_plamo",
            "sub_minicar_rail",
            "sub_retro_toy",
            "sub_tcg_card",
            "sub_board_game",
            "sub_anime_goods",
        ],
    ),
    "hobby_toreka": ("hobbyoff", "hobbyoff", ["sub_tcg_card", "sub_board_game"]),
    "book_off": (
        "bookoff",
        "bookoff",
        [
            "sub_comic_book",
            "sub_cd_dvd",
            "sub_retro_game",
            "sub_modern_game",
            "sub_tcg_card",
            "sub_figure",
            "sub_plamo",
        ],
    ),
}

BRAND_ORDER = [
    "hardoff", "bookoff", "bookoff_plus", "bookoff_sb",
    "offhouse", "hobbyoff", "modeoff", "garageoff", "liquoroff",
    "surugaya", "kanteidan", "lashinbang", "mandarake", "melonbooks", "animate",
    "geo", "furuichi", "otakarasouko", "mandai", "mangasouko"
]

def map_bookoff_subcategories(item, store_cat):
    """
    ブックオフ公式APIの product_parents_sell コード配列と業態名から、
    実際の店舗ごとの詳細サブジャンル（subCategories）を正確にマッピングします。
    """
    raw_codes = ":".join(item.get("product_parents_sell") or [])
    parts = set(raw_codes.split(":")) if raw_codes else set()
    sub_cats = set()

    # 01:本・コミック・書籍
    if "01" in parts or not parts:
        sub_cats.add("sub_comic_book")
    # 02:CD・DVD・ブルーレイ・ゲーム
    if "02" in parts or not parts:
        sub_cats.update(["sub_cd_dvd", "sub_modern_game", "sub_retro_game"])
    # 03:携帯電話・スマートフォン・タブレット
    if "03" in parts:
        sub_cats.add("sub_smartphone")
    # 04:デジタル家電・パソコン・AV機器
    if "04" in parts:
        sub_cats.update(["sub_pc_junk", "sub_home_appliance", "sub_audio", "sub_camera"])
    # 05:生活家電
    if "05" in parts:
        sub_cats.add("sub_home_appliance")
    # 06:楽器・音楽機材
    if "06" in parts:
        sub_cats.add("sub_instrument")
    # 07:メンズ・レディース古着・アパレル
    if "07" in parts:
        sub_cats.add("sub_apparel")
    # 08:ブランドバッグ・腕時計・貴金属
    if "08" in parts:
        sub_cats.add("sub_luxury_brand")
    # 09:トレーディングカード
    if "09" in parts:
        sub_cats.add("sub_tcg_card")
    # 10:フィギュア・プラモデル・おもちゃ・ミニカー・鉄道模型
    if "10" in parts:
        sub_cats.update(["sub_figure", "sub_plamo", "sub_minicar_rail", "sub_retro_toy"])
    # 11:ベビー・キッズ, 14:食器・雑貨・インテリア・家具
    if "11" in parts or "14" in parts:
        sub_cats.add("sub_furniture_zakka")
    # 12:スポーツ用品, 13:アウトドア・キャンプ・釣具, 15:ゴルフ用品
    if any(k in parts for k in ("12", "13", "15")):
        sub_cats.add("sub_outdoor_sport")
    # 21:アニメ・キャラグッズ
    if "21" in parts:
        sub_cats.update(["sub_anime_goods", "sub_otome_goods"])
    # 22:レコード・アナログ盤
    if "22" in parts:
        sub_cats.add("sub_vinyl_record")

    # 業態別の標準保証
    if store_cat == "BOOKOFF SUPER BAZAAR":
        sub_cats.update([
            "sub_comic_book", "sub_cd_dvd", "sub_retro_game", "sub_modern_game",
            "sub_tcg_card", "sub_figure", "sub_plamo", "sub_minicar_rail", "sub_retro_toy",
            "sub_pc_junk", "sub_smartphone", "sub_home_appliance", "sub_audio", "sub_instrument",
            "sub_anime_goods", "sub_apparel", "sub_luxury_brand", "sub_outdoor_sport", "sub_furniture_zakka"
        ])
    elif store_cat == "BOOKOFF PLUS":
        sub_cats.update([
            "sub_comic_book", "sub_cd_dvd", "sub_retro_game", "sub_modern_game",
            "sub_tcg_card", "sub_figure", "sub_plamo", "sub_anime_goods",
            "sub_apparel", "sub_luxury_brand"
        ])
    else:
        sub_cats.update(["sub_comic_book", "sub_cd_dvd", "sub_retro_game", "sub_modern_game"])

    return sorted(sub_cats)

def build_master_database():
    with open("scripts/official_surugaya.json", "r", encoding="utf-8") as f:
        su_real = json.load(f)
    with open("scripts/official_surugaya_friendly.json", "r", encoding="utf-8") as f:
        su_friendly = json.load(f)
    with open("scripts/official_hardoff.json", "r", encoding="utf-8") as f:
        ho_official = json.load(f)
    with open("scripts/official_bookoff.json", "r", encoding="utf-8") as f:
        bo_official = json.load(f)
    with open("scripts/official_geo.json", "r", encoding="utf-8") as f:
        geo_official = json.load(f)
    with open("scripts/official_furuichi.json", "r", encoding="utf-8") as f:
        furu_official = json.load(f)
    with open("scripts/official_otakarasouko.json", "r", encoding="utf-8") as f:
        ota_official = json.load(f)
    with open("scripts/official_lashinbang.json", "r", encoding="utf-8") as f:
        lash_official = json.load(f)
    with open("scripts/official_kanteidan.json", "r", encoding="utf-8") as f:
        kanteidan_official = json.load(f)

    # Extract official Furuichi hours from scripts/furuichi.html
    furu_hours_map = {}
    if os.path.exists("scripts/furuichi.html"):
        with open("scripts/furuichi.html", "r", encoding="utf-8") as f:
            furu_html = f.read()
        for blk in furu_html.split('shop__display__content__title__name__text">')[1:]:
            fname = blk.split("</span>")[0].strip()
            m_det = re.search(r'accordion-time-content__list__detail">\s*([^<]+?)\s*</p>', blk)
            m_end = re.search(r'営業終了\s*(\d{1,2}:\d{2})', blk)
            if m_det:
                furu_hours_map[fname] = m_det.group(1).strip().replace("~", "～")
            elif m_end:
                furu_hours_map[fname] = f"10:00～{m_end.group(1)}"

    # 1. Group Hard Off official stores by core address key
    ho_grouped = {}
    for item in ho_official:
        key = extract_core_address_key(item["address"])
        chain_id, brand_id, sub_cats = HO_LOGO_MAP.get(
            item["logo_type"],
            ("hardoff", "hardoff", ["sub_pc_junk", "sub_retro_game", "sub_modern_game"]),
        )
        park_str = item.get("parking", "").strip()
        base_ho_hours = "11:00～20:00" if ("秋葉原" in item["name"] or "上野" in item["name"]) else "10:00～20:00"
        ho_hours = f"{base_ho_hours} ({park_str})" if park_str else base_ho_hours
        if key not in ho_grouped:
            ho_grouped[key] = {
                "id": item["id"],
                "names": [item["name"]],
                "chains": [chain_id],
                "brands": [brand_id],
                "subCategories": list(sub_cats),
                "address": clean_address_for_geocode(item["address"]),
                "hours": ho_hours
            }
        else:
            g = ho_grouped[key]
            if item["name"] not in g["names"]:
                g["names"].append(item["name"])
            if chain_id not in g["chains"]:
                g["chains"].append(chain_id)
            if brand_id not in g["brands"]:
                g["brands"].append(brand_id)
            for sc in sub_cats:
                if sc not in g["subCategories"]:
                    g["subCategories"].append(sc)

    all_addresses = set()
    for s in su_real + su_friendly + furu_official + ota_official + lash_official + geo_official + kanteidan_official:
        all_addresses.add(s["address"])
    for b in bo_official:
        sc = b.get("store_category", "")
        if sc in ("BOOKOFF", "BOOKOFF PLUS", "BOOKOFF SUPER BAZAAR") and "閉店" not in sc and "閉店" not in b.get("title", ""):
            all_addresses.add(b.get("text", ""))
    for g in ho_grouped.values():
        all_addresses.add(g["address"])

    uncached = [a for a in all_addresses if clean_address_for_geocode(a) not in gsi_cache]
    print(f"Geocoding {len(uncached)} new official addresses via GSI Japan API...")

    with ThreadPoolExecutor(max_workers=14) as ex:
        futures = {ex.submit(geocode_gsi, a): a for a in uncached}
        for _ in as_completed(futures):
            pass

    with open(GSI_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(gsi_cache, f, ensure_ascii=False)
    print("GSI geocoding complete!")

    final_shops = []
    priority_chains = ["hardoff", "hobbyoff", "offhouse", "bookoff", "surugaya", "kanteidan", "anime_shop", "general_game"]

    # Add Official Surugaya Real Stores & Friendly Shops
    for idx, s in enumerate(su_real + su_friendly):
        coords = geocode_gsi(s["address"])
        if not coords:
            continue
        name = s["name"]
        sub_cats = [
            "sub_retro_game", "sub_modern_game", "sub_tcg_card", "sub_board_game",
            "sub_figure", "sub_plamo", "sub_minicar_rail", "sub_retro_toy",
            "sub_comic_book", "sub_doujin", "sub_anime_goods", "sub_otome_goods",
            "sub_cd_dvd", "sub_pc_junk"
        ]
        if "プラモデル" in name:
            sub_cats = ["sub_plamo", "sub_minicar_rail", "sub_figure"]
        elif "トレカ" in name or "ボードゲーム" in name:
            sub_cats = ["sub_tcg_card", "sub_board_game"]
        elif "ゲーム館" in name:
            sub_cats = ["sub_retro_game", "sub_modern_game", "sub_pc_junk"]
        elif "乙女" in name or "キャラ" in name:
            sub_cats = ["sub_otome_goods", "sub_anime_goods", "sub_doujin", "sub_comic_book", "sub_figure"]
        elif "アニメ・ホビー" in name:
            sub_cats = ["sub_figure", "sub_plamo", "sub_anime_goods", "sub_doujin", "sub_cd_dvd"]

        su_hours = (s.get("hours") or "").strip() or "10:00～21:00"
        final_shops.append({
            "id": f"surugaya_off_{idx+1}",
            "name": name,
            "chain": "surugaya",
            "chains": ["surugaya"],
            "brands": ["surugaya"],
            "categories": derive_parent_categories(sub_cats),
            "subCategories": sorted(sub_cats),
            "lat": coords["lat"],
            "lng": coords["lng"],
            "address": clean_address_for_geocode(s["address"]),
            "hours": su_hours,
            "verified": True
        })

    # Add Official Hard Off Group
    for g in ho_grouped.values():
        coords = geocode_gsi(g["address"])
        if not coords:
            continue
        g["brands"].sort(key=lambda b: BRAND_ORDER.index(b) if b in BRAND_ORDER else 99)
        primary_chain = next((p for p in priority_chains if p in g["chains"]), g["chains"][0])
        display_name = " / ".join(g["names"])
        sub_cats = sorted(g["subCategories"])
        final_shops.append({
            "id": g["id"],
            "name": display_name,
            "chain": primary_chain,
            "chains": g["chains"],
            "brands": g["brands"],
            "categories": derive_parent_categories(sub_cats),
            "subCategories": sub_cats,
            "lat": coords["lat"],
            "lng": coords["lng"],
            "address": g["address"],
            "hours": g["hours"],
            "verified": True
        })

    # Add Official BOOKOFF / BOOKOFF PLUS / BOOKOFF SUPER BAZAAR (706 active stores)
    bo_added = 0
    for b in bo_official:
        sc = b.get("store_category", "")
        title = b.get("title", "").strip()
        if sc not in ("BOOKOFF", "BOOKOFF PLUS", "BOOKOFF SUPER BAZAAR"):
            continue
        if "閉店" in sc or "閉店" in title:
            continue

        addr = clean_address_for_geocode(b.get("text", ""))
        coords = geocode_gsi(addr)
        if not coords:
            # Fallback to official lat/lon if GSI didn't match
            if b.get("lat") and b.get("lon"):
                coords = {"lat": round(float(b["lat"]), 6), "lng": round(float(b["lon"]), 6)}
            else:
                continue

        if sc == "BOOKOFF SUPER BAZAAR":
            brand_id = "bookoff_sb"
            full_name = title if "SUPER BAZAAR" in title.upper() else f"BOOKOFF SUPER BAZAAR {title}"
            sub_brand = "BOOKOFF SUPER BAZAAR"
        elif sc == "BOOKOFF PLUS":
            brand_id = "bookoff_plus"
            full_name = title if "PLUS" in title.upper() else f"BOOKOFF PLUS {title}"
            sub_brand = "BOOKOFF PLUS"
        else:
            brand_id = "bookoff"
            full_name = title if ("ブックオフ" in title or "BOOKOFF" in title.upper()) else f"ブックオフ {title}"
            sub_brand = "ブックオフ"

        hours_list = b.get("business_hours1") or []
        hours_str = hours_list[0] if isinstance(hours_list, list) and hours_list else ""
        hours_str = re.sub(r'<[^>]+>', ' ', hours_str).strip()

        sub_cats = map_bookoff_subcategories(b, sc)

        final_shops.append({
            "id": f"bookoff_off_{b.get('id')}",
            "name": full_name,
            "chain": "bookoff",
            "chains": ["bookoff"],
            "brands": [brand_id],
            "subBrand": sub_brand,
            "categories": derive_parent_categories(sub_cats),
            "subCategories": sub_cats,
            "lat": coords["lat"],
            "lng": coords["lng"],
            "address": addr,
            "hours": hours_str,
            "verified": True
        })
        bo_added += 1
    print(f"Added {bo_added} official BOOKOFF / PLUS / SUPER BAZAAR stores.")

    # Add Official GEO stores (819 active stores)
    geo_added = 0
    for g in geo_official:
        if "閉店" in g["name"]:
            continue
        coords = geocode_gsi(g["address"])
        if not coords:
            continue
        geo_subs = [
            "sub_modern_game", "sub_retro_game", "sub_smartphone",
            "sub_home_appliance", "sub_pc_junk", "sub_cd_dvd",
            "sub_comic_book", "sub_tcg_card"
        ]
        final_shops.append({
            "id": g["id"],
            "name": g["name"],
            "chain": "general_game",
            "chains": ["general_game"],
            "brands": ["geo"],
            "subBrand": "ゲオ (GEO)",
            "categories": derive_parent_categories(geo_subs),
            "subCategories": sorted(geo_subs),
            "lat": coords["lat"],
            "lng": coords["lng"],
            "address": clean_address_for_geocode(g["address"]),
            "hours": g.get("hours", ""),
            "verified": True
        })
        geo_added += 1
    print(f"Added {geo_added} official GEO stores.")

    # Add Official Lashinbang (73 stores)
    for idx, s in enumerate(lash_official):
        coords = geocode_gsi(s["address"])
        if not coords:
            continue
        lash_subs = [
            "sub_figure", "sub_plamo", "sub_tcg_card", "sub_comic_book",
            "sub_doujin", "sub_anime_goods", "sub_otome_goods", "sub_cd_dvd",
            "sub_retro_game", "sub_modern_game"
        ]
        final_shops.append({
            "id": f"lashin_off_{idx+1}",
            "name": s["name"],
            "chain": "anime_shop",
            "chains": ["anime_shop"],
            "brands": ["lashinbang"],
            "categories": derive_parent_categories(lash_subs),
            "subCategories": sorted(lash_subs),
            "lat": coords["lat"],
            "lng": coords["lng"],
            "address": clean_address_for_geocode(s["address"]),
            "hours": s.get("hours", ""),
            "verified": True
        })

    # Add Official Furuichi / 古本市場 (181 stores)
    for idx, s in enumerate(furu_official):
        coords = geocode_gsi(s["address"])
        if not coords:
            continue
        f_hours = (s.get("hours") or "").strip() or furu_hours_map.get(s["name"], "10:00～22:00")
        if "トレカパーク" in s["name"]:
            furu_subs = ["sub_tcg_card", "sub_board_game"]
        else:
            furu_subs = [
                "sub_comic_book", "sub_retro_game", "sub_modern_game",
                "sub_tcg_card", "sub_board_game", "sub_figure",
                "sub_plamo", "sub_anime_goods", "sub_cd_dvd", "sub_smartphone"
            ]
        final_shops.append({
            "id": f"furu_off_{idx+1}",
            "name": s["name"],
            "chain": "general_game",
            "chains": ["general_game"],
            "brands": ["furuichi"],
            "categories": derive_parent_categories(furu_subs),
            "subCategories": sorted(furu_subs),
            "lat": coords["lat"],
            "lng": coords["lng"],
            "address": clean_address_for_geocode(s["address"]),
            "hours": f_hours,
            "verified": True
        })

    # Add Official Otakarasouko Group (52 stores)
    for idx, s in enumerate(ota_official):
        coords = geocode_gsi(s["address"])
        if not coords:
            continue
        ota_h = (s.get("hours") or "").strip()
        if not ota_h:
            ota_h = "10:00～21:00" if ("イオン" in s["name"] or "アピタ" in s["name"] or "ららぽーと" in s["name"]) else "10:00～24:00"
        oname = s["name"]
        if "エコツール" in oname:
            ota_subs = ["sub_tool_diy"]
        elif "プレイズ" in oname:
            ota_subs = ["sub_tcg_card", "sub_board_game", "sub_retro_game", "sub_modern_game"]
        elif "おじゃま館" in oname:
            ota_subs = ["sub_retro_game", "sub_modern_game", "sub_tcg_card"]
        elif "メディオ" in oname:
            ota_subs = [
                "sub_plamo", "sub_figure", "sub_minicar_rail",
                "sub_retro_game", "sub_modern_game", "sub_tcg_card",
                "sub_pc_junk", "sub_anime_goods"
            ]
        else:
            ota_subs = [
                "sub_retro_game", "sub_modern_game", "sub_tcg_card", "sub_board_game",
                "sub_figure", "sub_plamo", "sub_minicar_rail", "sub_retro_toy",
                "sub_pc_junk", "sub_smartphone", "sub_camera", "sub_tool_diy",
                "sub_home_appliance", "sub_audio", "sub_instrument",
                "sub_comic_book", "sub_anime_goods", "sub_cd_dvd",
                "sub_apparel", "sub_luxury_brand", "sub_outdoor_sport"
            ]
        final_shops.append({
            "id": f"ota_off_{idx+1}",
            "name": oname,
            "chain": "general_game",
            "chains": ["general_game"],
            "brands": ["otakarasouko"],
            "categories": derive_parent_categories(ota_subs),
            "subCategories": sorted(ota_subs),
            "lat": coords["lat"],
            "lng": coords["lng"],
            "address": clean_address_for_geocode(s["address"]),
            "hours": ota_h,
            "verified": True
        })

    # Add Official Kanteidan Group (22 active stores across Chiba, Ibaraki, Shizuoka, Tochigi, Gunma)
    kantei_added = 0
    kantei_subs = [
        "sub_retro_game", "sub_modern_game", "sub_tcg_card", "sub_board_game",
        "sub_figure", "sub_plamo", "sub_minicar_rail", "sub_retro_toy",
        "sub_pc_junk", "sub_smartphone", "sub_camera", "sub_tool_diy",
        "sub_home_appliance", "sub_audio", "sub_instrument", "sub_vinyl_record",
        "sub_comic_book", "sub_doujin", "sub_anime_goods", "sub_cd_dvd",
        "sub_apparel", "sub_luxury_brand", "sub_outdoor_sport", "sub_car_bike", "sub_liquor"
    ]
    for idx, s in enumerate(kanteidan_official):
        coords = geocode_gsi(s["address"])
        if not coords:
            continue
        final_shops.append({
            "id": s.get("id", f"kanteidan_off_{idx+1}"),
            "name": s["name"],
            "chain": "kanteidan",
            "chains": ["kanteidan"],
            "brands": ["kanteidan"],
            "subBrand": s.get("subBrand", "鑑定団"),
            "categories": derive_parent_categories(kantei_subs),
            "subCategories": sorted(kantei_subs),
            "lat": coords["lat"],
            "lng": coords["lng"],
            "address": clean_address_for_geocode(s["address"]),
            "hours": s.get("hours", "10:00～24:00"),
            "verified": True
        })
        kantei_added += 1
    print(f"Added {kantei_added} official Kanteidan Group stores.")

    # Add remaining chains from OSM (Animate, Melonbooks, Mandarake, Mandai, Mangasouko)
    # Note: Bookoff, HardOff, Surugaya, Lashinbang, Furuichi, Otakarasouko, GEO, Kanteidan are 100% official now!
    with open("scripts/raw_overpass.json", "r", encoding="utf-8") as f:
        raw_osm = json.load(f).get("elements", [])

    OTHER_REGEX = re.compile(
        r"(まんだらけ|MANDARAKE|"
        r"メロンブックス|アニメイト|animate|"
        r"万代|マンガ倉庫)",
        re.IGNORECASE
    )
    EXCLUDE_REGEX = re.compile(
        r"(ハードオフ|HARD\s*OFF|オフハウス|OFF\s*HOUSE|ホビーオフ|HOBBY\s*OFF|モードオフ|ガレージオフ|リカーオフ|"
        r"ブックオフ|BOOK\s*OFF|BOOKOFF|ゲオ|GEO|鑑定団|"
        r"駿河屋|SURUGAYA|らしんばん|古本市場|ふるいち|お宝創庫|"
        r"バンダイナムコ|BANDAI\s*NAMCO|スタジオジブリ|アニメイトカフェ|万代シティ|万代シテイ|万代橋|万代島|万代町|スーパーマーケット万代)",
        re.IGNORECASE
    )

    from build_shops_db import classify_shop

    osm_added = 0
    for el in raw_osm:
        tags = el.get("tags", {})
        if tags.get("disused:shop") or tags.get("abandoned:shop") or tags.get("closed"):
            continue
        name = tags.get("name:ja") or tags.get("name") or tags.get("brand:ja") or tags.get("brand") or ""
        brand = tags.get("brand:ja") or tags.get("brand") or ""
        branch = tags.get("branch") or tags.get("branch:ja") or ""
        if not name or EXCLUDE_REGEX.search(name) or "閉店" in name:
            continue
        if not (OTHER_REGEX.search(name) or OTHER_REGEX.search(brand)):
            continue
        if branch and branch not in name:
            name = f"{name} {branch}"

        lat = el.get("lat") or (el.get("center", {}).get("lat"))
        lng = el.get("lon") or (el.get("center", {}).get("lon"))
        if not lat or not lng:
            continue

        info = classify_shop(name, brand, tags)
        if not info:
            continue

        pref = tags.get("addr:province") or tags.get("addr:state") or ""
        city = tags.get("addr:city") or ""
        suburb = tags.get("addr:suburb") or tags.get("addr:quarter") or ""
        block = tags.get("addr:block_number") or tags.get("addr:housenumber") or ""
        full_addr = tags.get("addr:full") or f"{pref}{city}{suburb}{block}".strip()
        hours = (tags.get("opening_hours") or "").strip()
        if hours == "24/7":
            hours = "24時間営業"
        elif not hours:
            if "mandarake" in info["brands"]:
                hours = "12:00～20:00"
            elif "melonbooks" in info["brands"]:
                hours = "11:00～20:00"
            elif "animate" in info["brands"]:
                hours = "10:00～21:00"
            elif "mandai" in info["brands"] or "mangasouko" in info["brands"]:
                hours = "10:00～24:00"
            else:
                hours = "10:00～21:00"

        osm_subs = set()
        if "mandarake" in info["brands"]:
            osm_subs.update([
                "sub_figure", "sub_plamo", "sub_minicar_rail", "sub_retro_toy",
                "sub_retro_game", "sub_tcg_card", "sub_comic_book", "sub_doujin",
                "sub_anime_goods", "sub_otome_goods", "sub_cd_dvd", "sub_vinyl_record"
            ])
        if "melonbooks" in info["brands"]:
            osm_subs.update(["sub_doujin", "sub_comic_book", "sub_anime_goods", "sub_otome_goods", "sub_cd_dvd"])
        if "animate" in info["brands"]:
            osm_subs.update(["sub_comic_book", "sub_anime_goods", "sub_otome_goods", "sub_cd_dvd", "sub_figure", "sub_tcg_card"])
        if "mandai" in info["brands"] or "mangasouko" in info["brands"]:
            osm_subs.update(kantei_subs)

        osm_sub_list = sorted(osm_subs) if osm_subs else ["sub_comic_book", "sub_anime_goods"]

        final_shops.append({
            "id": f"osm_{el.get('type','n')[0]}_{el.get('id')}",
            "name": name,
            "chain": info["chain"],
            "chains": info["chains"],
            "brands": info["brands"],
            "categories": derive_parent_categories(osm_sub_list),
            "subCategories": osm_sub_list,
            "lat": round(float(lat), 6),
            "lng": round(float(lng), 6),
            "address": full_addr,
            "hours": hours
        })
        osm_added += 1

    print(f"Added {osm_added} supplemental stores from OSM (Mandarake / Animate / Melonbooks / Kanteidan / Mandai).")

    # Merge co-located stores within ~65m
    merged = []
    for s in final_shops:
        found = False
        for m in merged:
            if abs(s["lat"] - m["lat"]) < 0.0006 and abs(s["lng"] - m["lng"]) < 0.0006:
                for ch in s["chains"]:
                    if ch not in m["chains"]:
                        m["chains"].append(ch)
                for br in s.get("brands", []):
                    if br not in m["brands"]:
                        m["brands"].append(br)
                # Prefer specific bookoff_sb / bookoff_plus over generic bookoff when merging Hard Off FC Bookoff with Official Bookoff
                if ("bookoff_sb" in m["brands"] or "bookoff_plus" in m["brands"]) and "bookoff" in m["brands"]:
                    m["brands"].remove("bookoff")
                for cat in s["categories"]:
                    if cat not in m["categories"]:
                        m["categories"].append(cat)
                if "subCategories" not in m:
                    m["subCategories"] = []
                for sc in s.get("subCategories", []):
                    if sc not in m["subCategories"]:
                        m["subCategories"].append(sc)
                m["subCategories"].sort()
                m["categories"].sort()
                # Avoid duplicate Bookoff names if Hard Off FC already had Bookoff
                if s["name"] not in m["name"] and len(m["name"]) < 75:
                    if not ("ブックオフ" in s["name"] and ("ブックオフ" in m["name"] or "BOOKOFF" in m["name"])):
                        m["name"] = f"{m['name']} / {s['name']}"
                    elif "SUPER BAZAAR" in s["name"] or "PLUS" in s["name"]:
                        m["name"] = f"{m['name']} ({s['name']})"
                if not m["address"] and s["address"]:
                    m["address"] = s["address"]
                if not m["hours"] and s["hours"]:
                    m["hours"] = s["hours"]
                m["brands"].sort(key=lambda b: BRAND_ORDER.index(b) if b in BRAND_ORDER else 99)
                m["chain"] = next((p for p in priority_chains if p in m["chains"]), m["chains"][0])
                found = True
                break
        if not found:
            s["brands"].sort(key=lambda b: BRAND_ORDER.index(b) if b in BRAND_ORDER else 99)
            merged.append(s)

    os.makedirs("data", exist_ok=True)
    os.makedirs("public/data", exist_ok=True)
    with open("data/shops.json", "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
    with open("public/data/shops.json", "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Successfully built data/shops.json and public/data/shops.json with {len(merged)} verified locations!")

if __name__ == "__main__":
    build_master_database()
