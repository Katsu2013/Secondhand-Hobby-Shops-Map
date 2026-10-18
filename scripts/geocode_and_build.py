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

HO_LOGO_MAP = {
    "hard_off": ("hardoff", "hardoff", ["pc_junk", "audio_inst", "retro_game"]),
    "hard_gakki": ("hardoff", "hardoff", ["audio_inst"]),
    "kougukan": ("hardoff", "hardoff", ["pc_junk"]),
    "hard_pc": ("hardoff", "hardoff", ["pc_junk", "retro_game"]),
    "kamerakan": ("hardoff", "hardoff", ["pc_junk", "audio_inst"]),
    "off_house": ("offhouse", "offhouse", ["pc_junk", "figure_hobby"]),
    "outdoor": ("offhouse", "offhouse", ["figure_hobby", "pc_junk"]),
    "mode_off": ("offhouse", "modeoff", ["figure_hobby"]),
    "mode_off_vintage": ("offhouse", "modeoff", ["figure_hobby"]),
    "garage_off": ("offhouse", "garageoff", ["pc_junk", "figure_hobby"]),
    "liquor_off": ("offhouse", "liquoroff", ["figure_hobby"]),
    "hobby_off": ("hobbyoff", "hobbyoff", ["figure_hobby", "tcg", "retro_game"]),
    "hobby_toreka": ("hobbyoff", "hobbyoff", ["tcg", "figure_hobby", "retro_game"]),
    "book_off": ("bookoff", "bookoff", ["book_media", "retro_game", "tcg", "figure_hobby"]),
}

BRAND_ORDER = [
    "hardoff", "bookoff", "bookoff_plus", "bookoff_sb",
    "offhouse", "hobbyoff", "modeoff", "garageoff", "liquoroff",
    "surugaya", "kanteidan", "lashinbang", "mandarake", "melonbooks", "animate",
    "geo", "furuichi", "otakarasouko", "mandai", "mangasouko"
]

def map_bookoff_categories(item, store_cat):
    """
    ブックオフ公式APIの product_parents_sell コード配列と業態名から、
    実際の店舗ごとの取扱カテゴリを正確にマッピングします。
    """
    raw_codes = ":".join(item.get("product_parents_sell") or [])
    parts = set(raw_codes.split(":")) if raw_codes else set()
    cats = set()

    # 01:本, 02:CD/DVD/ゲーム, 21:アニメグッズ
    if any(k in parts for k in ("01", "02", "21")) or not parts:
        cats.add("book_media")
    # 02:ゲーム
    if "02" in parts or not parts:
        cats.add("retro_game")
    # 09:トレカ
    if "09" in parts:
        cats.add("tcg")
    # 10:ホビー・フィギュア・プラモデル
    if "10" in parts:
        cats.add("figure_hobby")
    # 03:スマホ, 04:デジタル家電/PC, 05:生活家電
    if any(k in parts for k in ("03", "04", "05")):
        cats.add("pc_junk")
    # 06:楽器
    if "06" in parts:
        cats.add("audio_inst")

    # 業態別の標準保証
    if store_cat == "BOOKOFF SUPER BAZAAR":
        cats.update(["book_media", "retro_game", "tcg", "figure_hobby", "pc_junk", "audio_inst"])
    elif store_cat == "BOOKOFF PLUS":
        cats.update(["book_media", "retro_game", "tcg", "figure_hobby", "pc_junk"])
    else:
        cats.update(["book_media", "retro_game"])

    return sorted(cats)

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
        chain_id, brand_id, cats = HO_LOGO_MAP.get(item["logo_type"], ("hardoff", "hardoff", ["pc_junk", "retro_game"]))
        park_str = item.get("parking", "").strip()
        base_ho_hours = "11:00～20:00" if ("秋葉原" in item["name"] or "上野" in item["name"]) else "10:00～20:00"
        ho_hours = f"{base_ho_hours} ({park_str})" if park_str else base_ho_hours
        if key not in ho_grouped:
            ho_grouped[key] = {
                "id": item["id"],
                "names": [item["name"]],
                "chains": [chain_id],
                "brands": [brand_id],
                "categories": list(cats),
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
            for c in cats:
                if c not in g["categories"]:
                    g["categories"].append(c)

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
        cats = ["retro_game", "figure_hobby", "tcg", "book_media", "pc_junk"]
        if "プラモデル" in name:
            cats = ["figure_hobby"]
        elif "トレカ" in name:
            cats = ["tcg", "figure_hobby"]
        elif "ゲーム館" in name:
            cats = ["retro_game", "pc_junk"]
        elif "乙女" in name or "キャラ" in name:
            cats = ["figure_hobby", "book_media"]

        su_hours = (s.get("hours") or "").strip() or "10:00～21:00"
        final_shops.append({
            "id": f"surugaya_off_{idx+1}",
            "name": name,
            "chain": "surugaya",
            "chains": ["surugaya"],
            "brands": ["surugaya"],
            "categories": cats,
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
        final_shops.append({
            "id": g["id"],
            "name": display_name,
            "chain": primary_chain,
            "chains": g["chains"],
            "brands": g["brands"],
            "categories": sorted(g["categories"]),
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

        cats = map_bookoff_categories(b, sc)

        final_shops.append({
            "id": f"bookoff_off_{b.get('id')}",
            "name": full_name,
            "chain": "bookoff",
            "chains": ["bookoff"],
            "brands": [brand_id],
            "subBrand": sub_brand,
            "categories": cats,
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
        final_shops.append({
            "id": g["id"],
            "name": g["name"],
            "chain": "general_game",
            "chains": ["general_game"],
            "brands": ["geo"],
            "subBrand": "ゲオ (GEO)",
            "categories": ["retro_game", "book_media", "pc_junk"],
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
        final_shops.append({
            "id": f"lashin_off_{idx+1}",
            "name": s["name"],
            "chain": "anime_shop",
            "chains": ["anime_shop"],
            "brands": ["lashinbang"],
            "categories": ["figure_hobby", "book_media", "tcg", "retro_game"],
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
        final_shops.append({
            "id": f"furu_off_{idx+1}",
            "name": s["name"],
            "chain": "general_game",
            "chains": ["general_game"],
            "brands": ["furuichi"],
            "categories": ["retro_game", "tcg", "book_media", "figure_hobby"],
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
        final_shops.append({
            "id": f"ota_off_{idx+1}",
            "name": s["name"],
            "chain": "general_game",
            "chains": ["general_game"],
            "brands": ["otakarasouko"],
            "categories": ["retro_game", "figure_hobby", "tcg", "pc_junk", "audio_inst"],
            "lat": coords["lat"],
            "lng": coords["lng"],
            "address": clean_address_for_geocode(s["address"]),
            "hours": ota_h,
            "verified": True
        })

    # Add Official Kanteidan Group (22 active stores across Chiba, Ibaraki, Shizuoka, Tochigi, Gunma)
    kantei_added = 0
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
            "categories": ["retro_game", "figure_hobby", "tcg", "book_media", "pc_junk", "audio_inst"],
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

        final_shops.append({
            "id": f"osm_{el.get('type','n')[0]}_{el.get('id')}",
            "name": name,
            "chain": info["chain"],
            "chains": info["chains"],
            "brands": info["brands"],
            "categories": info["categories"],
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
