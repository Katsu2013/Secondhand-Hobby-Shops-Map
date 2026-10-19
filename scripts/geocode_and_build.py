from pipeline_support import stable_shop_id, validate_database, atomic_json_write
from assortment_support import apply_assortment, correct_brand
import json
import os
import re
import ssl
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

ctx = ssl.create_default_context()
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

    if os.environ.get("REUSE_MAP_OFFLINE") == "1":
        return None

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

# 業態コードはチェーン・看板の識別専用。取扱商品は店舗別出典で設定する。
HO_LOGO_MAP = {'hard_off': ('hardoff', 'hardoff', []),
 'hard_gakki': ('hardoff', 'hardoff', []),
 'kougukan': ('hardoff', 'hardoff', []),
 'hard_pc': ('hardoff', 'hardoff', []),
 'kamerakan': ('hardoff', 'hardoff', []),
 'off_house': ('offhouse', 'offhouse', []),
 'outdoor': ('offhouse', 'offhouse', []),
 'mode_off': ('offhouse', 'modeoff', []),
 'mode_off_vintage': ('offhouse', 'modeoff', []),
 'garage_off': ('offhouse', 'garageoff', []),
 'liquor_off': ('offhouse', 'liquoroff', []),
 'hobby_off': ('hobbyoff', 'hobbyoff', []),
 'hobby_toreka': ('hobbyoff', 'hobbyoff', []),
 'book_off': ('bookoff', 'bookoff', [])}

BRAND_ORDER = [
    "hardoff", "bookoff", "bookoff_plus", "bookoff_sb",
    "offhouse", "hobbyoff", "modeoff", "garageoff", "liquoroff",
    "surugaya", "kanteidan", "lashinbang", "mandarake", "melonbooks", "animate",
    "geo", "furuichi", "otakarasouko", "mandai", "mangasouko"
]

def build_master_database():
    # 台帳は既存IDの移行に必要な入力。欠落時に再採番せず、更新を止める。
    with open("scripts/shop_id_registry.json", "r", encoding="utf-8") as handle:
        registry = json.load(handle)
    with open("data/shops.json", "r", encoding="utf-8") as handle:
        previous_shops = json.load(handle)
    previous_ids = {}
    for previous in previous_shops:
        for source_id in previous.get("sourceIds", [previous["id"]]):
            previous_ids[source_id] = previous["id"]
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
    # PC専門店は買取専用店を除いた公式スナップショットを必須入力にする。
    pc_official = []
    for kind in ('iosys', 'janpara', 'pc_koubou', 'inverse'):
        with open(f'scripts/official_{kind}.json', encoding='utf-8') as handle:
            pc_official.extend(dict(item, chain=kind) for item in json.load(handle))

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
            ("hardoff", "hardoff", []),
        )
        park_str = item.get("parking", "").strip()
        ho_hours = (item.get("hours") or "").strip()  # 未取得の営業時間を固定値で創作しない
        if key not in ho_grouped:
            ho_grouped[key] = {
                "id": item["id"],
                "sourceIds": [item["id"]],
                "names": [item["name"]],
                "chains": [chain_id],
                "brands": [brand_id],
                "subCategories": list(sub_cats),
                "address": clean_address_for_geocode(item["address"]),
                "hours": ho_hours
            }
        else:
            g = ho_grouped[key]
            if item["id"] not in g["sourceIds"]:
                g["sourceIds"].append(item["id"])
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
    for s in su_real + su_friendly + furu_official + ota_official + lash_official + geo_official + kanteidan_official + pc_official:
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

    atomic_json_write(GSI_CACHE_FILE, gsi_cache)
    print("GSI geocoding complete!")

    final_shops = []
    priority_chains = ["hardoff", "hobbyoff", "offhouse", "bookoff", "surugaya", "kanteidan", "anime_shop", "general_game"]

    # Add Official Surugaya Real Stores & Friendly Shops
    for idx, s in enumerate(su_real + su_friendly):
        coords = geocode_gsi(s["address"])
        if not coords:
            continue
        name = s["name"]
        sub_cats = []

        su_hours = (s.get("hours") or "").strip()
        final_shops.append({
            "id": stable_shop_id("surugaya", s, registry),
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
            "sourceIds": sorted(g.get("sourceIds", [g["id"]])),
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

        sub_cats = []

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
        geo_subs = []
        final_shops.append({
            "id": g["id"],
            "sourceIds": sorted(g.get("sourceIds", [g["id"]])),
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
        lash_subs = []
        final_shops.append({
            "id": stable_shop_id("lashinbang", s, registry),
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
        f_hours = (s.get("hours") or "").strip() or furu_hours_map.get(s["name"], "")
        furu_subs = []
        final_shops.append({
            "id": stable_shop_id("furuichi", s, registry),
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
        oname = s["name"]
        ota_subs = []
        final_shops.append({
            "id": stable_shop_id("otakarasouko", s, registry),
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
    kantei_subs = []
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
            "hours": s.get("hours", ""),
            "verified": True
        })
        kantei_added += 1
    print(f"Added {kantei_added} official Kanteidan Group stores.")

    # Add remaining chains from OSM (Animate, Melonbooks, Mandarake, Mandai, Mangasouko)
    # Note: Bookoff, HardOff, Surugaya, Lashinbang, Furuichi, Otakarasouko, GEO, Kanteidan are 100% official now!
    # クリーンなCIでも使える追跡対象の補完スナップショット。
    with open("scripts/osm_supplement.json", "r", encoding="utf-8") as f:
        raw_osm = json.load(f)["elements"]

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
        if tags.get("shop") in ("no", "vacant", "supermarket", "convenience") or tags.get("highway"):
            continue
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
        osm_sub_list = []

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

    for item in pc_official:
        coords = geocode_gsi(item['address'])
        if not coords:
            raise ValueError(f"PC販売店舗の座標を取得できません: {item['name']}")
        kind = item['chain']
        brand = 'goodwill' if kind == 'pc_koubou' and 'グッドウィル' in item['name'] else kind
        final_shops.append(dict(id=item['id'], sourceIds=[item['id']], name=item['name'], chain=kind,
            chains=[kind], brands=[brand], categories=[], subCategories=[], **coords,
            address=clean_address_for_geocode(item['address']), hours=item['hours'], verified=True))

    # 看板は店名から判別できるが、販売商品は系列名から断定しない。
    for shop in final_shops:
        correct_brand(shop)

    # 品目の出典を構成店に対応付け、系列OFF時に別店舗の取扱いを混入させない。
    source_details = {sid: dict(name=shop['name'], chain=shop['chain'])
        for shop in final_shops for sid in shop.get('sourceIds', [shop['id']])}
    for item in ho_official:
        if item['id'] in source_details:
            source_details[item['id']] = dict(name=item['name'], chain=HO_LOGO_MAP.get(item['logo_type'], ('hardoff',))[0])

    # Merge co-located stores within ~65m
    merged = []
    for s in final_shops:
        s["sourceIds"] = s.get("sourceIds", [s["id"]])
        found = False
        for m in merged:
            # 秋葉原などでは別住所の専門店が近接する。新規PC店は距離だけで複合店にしない。
            if any(chain in ('iosys', 'janpara', 'pc_koubou', 'inverse') for chain in s['chains'] + m['chains']):
                continue
            if abs(s["lat"] - m["lat"]) < 0.0006 and abs(s["lng"] - m["lng"]) < 0.0006:
                m["sourceIds"] = sorted(set(m["sourceIds"] + s["sourceIds"]))
                # 異なる店の営業時間を、複合店全体の営業保証として使わない。
                if m["hours"] != s["hours"]:
                    m["hours"] = ""
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
                m["brands"].sort(key=lambda b: BRAND_ORDER.index(b) if b in BRAND_ORDER else 99)
                m["chain"] = next((p for p in priority_chains if p in m["chains"]), m["chains"][0])
                found = True
                break
        if not found:
            s["brands"].sort(key=lambda b: BRAND_ORDER.index(b) if b in BRAND_ORDER else 99)
            merged.append(s)

    # 統合の代表が変わっても、前回と共有する更新元IDがあれば既存のピンIDを維持する。
    for shop in merged:
        candidates = sorted({previous_ids[source_id] for source_id in shop["sourceIds"] if source_id in previous_ids})
        if candidates:
            shop["id"] = candidates[0]
    # 生成途中の従来推測タグを破棄し、確認済み店舗別情報だけを公開する。
    with open("scripts/assortment_evidence.json", encoding="utf-8") as handle:
        evidence = json.load(handle)
    for shop in merged:
        apply_assortment(shop, evidence, source_details)
    merged.sort(key=lambda shop: shop["id"])
    validate_database(merged, len(previous_shops))
    os.makedirs("public/data", exist_ok=True)
    # 両方とも同じデータを保存し、検証失敗時には公開DBを上書きしない。
    atomic_json_write("data/shops.json", merged)
    atomic_json_write("public/data/shops.json", merged)

    print(f"Successfully built data/shops.json and public/data/shops.json with {len(merged)} verified locations!")

if __name__ == "__main__":
    build_master_database()
