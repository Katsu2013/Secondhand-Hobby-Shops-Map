import json
import os
import re

TARGET_REGEX = re.compile(
    r"(ハードオフ|HARD\s*OFF|HARD・OFF|オフハウス|OFF\s*HOUSE|モードオフ|MODE\s*OFF|"
    r"ガレージオフ|GARAGE\s*OFF|リカーオフ|LIQUOR\s*OFF|ホビーオフ|HOBBY\s*OFF|"
    r"ブックオフ|BOOK\s*OFF|BOOKOFF|駿河屋|SURUGAYA|らしんばん|まんだらけ|MANDARAKE|"
    r"メロンブックス|アニメイト|animate|ゲオ|GEO|古本市場|ふるいち|お宝創庫|"
    r"万代|マンガ倉庫|鑑定団)",
    re.IGNORECASE
)

EXCLUDE_REGEX = re.compile(
    r"(バンダイナムコ|BANDAI\s*NAMCO|スタジオジブリ|アニメイトカフェ|万代シティ|万代シテイ|万代橋|万代島|万代町|スーパーマーケット万代|万代\s+.*店.*スーパー)",
    re.IGNORECASE
)

def classify_shop(name, brand, tags):
    text = f"{name} {brand}".strip()
    chains = []
    brands = []

    if re.search(r"ハードオフ|HARD\s*OFF|HARD・OFF", text, re.I):
        chains.append("hardoff")
        brands.append("hardoff")

    if re.search(r"ブックオフ|BOOK\s*OFF|BOOKOFF", text, re.I):
        chains.append("bookoff")
        if re.search(r"SUPER\s*BAZAAR|スーパーバザー", text, re.I):
            brands.append("bookoff_sb")

        elif re.search(r"PLUS|プラス", text, re.I):
            brands.append("bookoff_plus")

        else:
            brands.append("bookoff")

    if re.search(r"オフハウス|OFF\s*HOUSE|モードオフ|MODE\s*OFF|ガレージオフ|GARAGE\s*OFF|リカーオフ|LIQUOR\s*OFF", text, re.I):
        chains.append("offhouse")
        if re.search(r"モードオフ|MODE\s*OFF", text, re.I):
            brands.append("modeoff")
        elif re.search(r"ガレージオフ|GARAGE\s*OFF", text, re.I):
            brands.append("garageoff")
        elif re.search(r"リカーオフ|LIQUOR\s*OFF", text, re.I):
            brands.append("liquoroff")
        else:
            brands.append("offhouse")

    if re.search(r"ホビーオフ|HOBBY\s*OFF", text, re.I):
        chains.append("hobbyoff")
        brands.append("hobbyoff")

    if re.search(r"駿河屋|SURUGAYA", text, re.I):
        chains.append("surugaya")
        brands.append("surugaya")

    if re.search(r"らしんばん|まんだらけ|MANDARAKE|メロンブックス|アニメイト|animate", text, re.I):
        chains.append("anime_shop")
        if "らしんばん" in text:
            brands.append("lashinbang")

        if re.search(r"まんだらけ|MANDARAKE", text, re.I):
            brands.append("mandarake")

        if "メロンブックス" in text:
            brands.append("melonbooks")

        if re.search(r"アニメイト|animate", text, re.I):
            brands.append("animate")

    if re.search(r"ゲオ|GEO|古本市場|ふるいち|お宝創庫|万代|マンガ倉庫", text, re.I):
        if "万代" in text and tags.get("shop") in ("supermarket", "convenience", "department_store"):
            return None
        chains.append("general_game")
        if re.search(r"古本市場|ふるいち", text):
            brands.append("furuichi")

        elif "お宝創庫" in text:
            brands.append("otakarasouko")

        elif "マンガ倉庫" in text:
            brands.append("mangasouko")

        elif "万代" in text:
            brands.append("mandai")

        else:
            brands.append("geo")

    if "鑑定団" in text:
        chains.append("kanteidan")
        brands.append("kanteidan")


    if not chains:
        return None

    # Deduplicate preserving order
    chains = list(dict.fromkeys(chains))
    brands = list(dict.fromkeys(brands))

    priority = ["hardoff", "hobbyoff", "offhouse", "bookoff", "surugaya", "kanteidan", "anime_shop", "general_game"]
    primary = next((p for p in priority if p in chains), chains[0])

    return {
        "chain": primary,
        "chains": chains,
        "brands": brands,
        "categories": []
    }

def main():
    """旧形式DBの手動生成。分類関数のimportでは入出力を実行しない。"""
    with open("scripts/raw_overpass.json", "r", encoding="utf-8") as f:
        raw = json.load(f)

    elements = raw.get("elements", [])
    print(f"Loaded {len(elements)} raw OSM elements")

    shops = []

    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name:ja") or tags.get("name") or tags.get("brand:ja") or tags.get("brand") or ""
        brand = tags.get("brand:ja") or tags.get("brand") or ""
        branch = tags.get("branch") or tags.get("branch:ja") or ""

        if not name:
            continue
        if EXCLUDE_REGEX.search(name):
            continue
        if not (TARGET_REGEX.search(name) or TARGET_REGEX.search(brand)):
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
        full_addr = tags.get("addr:full") or f"{pref}{city}{suburb}".strip()
        hours = tags.get("opening_hours") or ""

        shops.append({
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

    CURATED_SHOPS = [
        {"name": "駿河屋 本店 (静岡)", "lat": 34.97321, "lng": 138.38345, "address": "静岡県静岡市葵区紺屋町8-1", "hours": "10:00-21:00"},
        {"name": "駿河屋 秋葉原本館", "lat": 35.70039, "lng": 139.77151, "address": "東京都千代田区外神田3-11-3", "hours": "11:00-21:00"},
        {"name": "駿河屋 秋葉原駅前店", "lat": 35.69878, "lng": 139.77451, "address": "東京都千代田区外神田1-15-15", "hours": "10:00-21:00"},
        {"name": "駿河屋 秋葉原ゲーム館", "lat": 35.69972, "lng": 139.77075, "address": "東京都千代田区外神田3-9-8", "hours": "11:00-21:00"},
        {"name": "駿河屋 秋葉原プラモデル館", "lat": 35.70112, "lng": 139.77138, "address": "東京都千代田区外神田4-4-2", "hours": "11:00-21:00"},
        {"name": "駿河屋 秋葉原トレカ・ボードゲーム館", "lat": 35.69935, "lng": 139.77258, "address": "東京都千代田区外神田3-15-4", "hours": "11:00-21:00"},
        {"name": "駿河屋 新宿マルイアネックス店", "lat": 35.69021, "lng": 139.70618, "address": "東京都新宿区新宿3-1-26 5F", "hours": "11:00-20:00"},
        {"name": "駿河屋 池袋乙女館", "lat": 35.73055, "lng": 139.71802, "address": "東京都豊島区東池袋1-29-1", "hours": "11:00-21:00"},
        {"name": "駿河屋 横浜マルイシティ店", "lat": 35.46542, "lng": 139.62421, "address": "神奈川県横浜市西区高島2-19-12 7F", "hours": "10:30-20:30"},
        {"name": "駿河屋 マルイファミリー海老名店", "lat": 35.45361, "lng": 139.39175, "address": "神奈川県海老名市中央1-6-1 5F", "hours": "10:30-20:00"},
        {"name": "駿河屋 大宮マルイ店", "lat": 35.90665, "lng": 139.62211, "address": "埼玉県さいたま市大宮区桜木町2-3 6F", "hours": "10:30-20:00"},
        {"name": "駿河屋 千葉中央店", "lat": 35.60751, "lng": 140.12062, "address": "千葉県千葉市中央区本千葉町15-1", "hours": "10:00-21:00"},
        {"name": "駿河屋 名古屋大須本館", "lat": 35.15861, "lng": 136.90562, "address": "愛知県名古屋市中区大須3-32-23", "hours": "11:00-20:00"},
        {"name": "駿河屋 名古屋栄店", "lat": 35.16628, "lng": 136.90731, "address": "愛知県名古屋市中区栄3-4-5 SKYLE 8F", "hours": "10:00-20:00"},
        {"name": "駿河屋 大阪日本橋本館", "lat": 34.65962, "lng": 135.50592, "address": "大阪府大阪市浪速区日本橋4-11-3", "hours": "10:00-21:00"},
        {"name": "駿河屋 オタロードアニメ・ホビー館", "lat": 34.66241, "lng": 135.50478, "address": "大阪府大阪市浪速区日本橋3-7-5", "hours": "11:00-21:00"},
        {"name": "駿河屋 梅田ロフト店", "lat": 34.70681, "lng": 135.49971, "address": "大阪府大阪市北区茶屋町16-7", "hours": "11:00-21:00"},
        {"name": "駿河屋 京都寺町店", "lat": 35.00215, "lng": 135.76752, "address": "京都府京都市下京区貞安前之町605", "hours": "10:00-21:00"},
        {"name": "駿河屋 神戸三宮1号店", "lat": 34.69261, "lng": 135.19125, "address": "兵庫県神戸市中央区三宮町1-9-1", "hours": "11:00-20:00"},
        {"name": "駿河屋 札幌ノルベサ店", "lat": 43.05662, "lng": 141.35168, "address": "北海道札幌市中央区南3条西5丁目1-1 3F", "hours": "11:00-21:00"},
        {"name": "駿河屋 博多マルイ店", "lat": 33.58891, "lng": 130.42022, "address": "福岡県福岡市博多区博多駅中央街9-1 6F", "hours": "10:00-21:00"},
        {"name": "駿河屋 小倉あるあるCity店", "lat": 33.88781, "lng": 130.88561, "address": "福岡県北九州市小倉北区浅野2-14-5 3F", "hours": "11:00-20:00"},
        {"name": "ハードオフ 秋葉原1号店", "lat": 35.70022, "lng": 139.77028, "address": "東京都千代田区外神田3-11-2", "hours": "11:00-20:00"},
        {"name": "ハードオフ・オフハウス・ホビーオフ 八王子大和田店", "lat": 35.66731, "lng": 139.36421, "address": "東京都八王子市大和田町1-25-22 (超大型旗艦店)", "hours": "10:00-20:00"},
        {"name": "ハードオフ・ホビーオフ 八王子堀之内店", "lat": 35.62541, "lng": 139.39821, "address": "東京都八王子市堀之内3-3-10", "hours": "10:00-20:00"},
        {"name": "ハードオフ・オフハウス・ホビーオフ 多摩和田店", "lat": 35.63951, "lng": 139.42721, "address": "東京都多摩市和田1264-1", "hours": "10:00-20:00"},
        {"name": "ハードオフ・オフハウス・ホビーオフ 町田木曽店", "lat": 35.56821, "lng": 139.42351, "address": "東京都町田市木曽西1-1-32", "hours": "10:00-20:00"},
        {"name": "ハードオフ・オフハウス・ホビーオフ 新潟紫竹山店", "lat": 37.89621, "lng": 139.06421, "address": "新潟県新潟市中央区紫竹山2-4-39 (本社お膝元)", "hours": "10:00-20:00"},
        # 添付画像の千葉エリア複合店も確実網羅
        {"name": "ハードオフ・オフハウス・ホビーオフ 千葉蘇我店", "lat": 35.58125, "lng": 140.13182, "address": "千葉県千葉市中央区川崎町55-3", "hours": "10:00-20:00"},
        {"name": "ハードオフ・オフハウス・ホビーオフ 鎌取店", "lat": 35.56312, "lng": 140.17821, "address": "千葉県千葉市緑区おゆみ野1-23-1", "hours": "10:00-20:00"},
        {"name": "ハードオフ・ブックオフ・オフハウス・ホビーオフ 千葉フレスポ稲毛店", "lat": 35.65021, "lng": 140.11852, "address": "千葉県千葉市稲毛区長沼原町731-17", "hours": "10:00-20:00"},
        {"name": "ハードオフ・ブックオフ・オフハウス・ホビーオフ 四街道店", "lat": 35.66821, "lng": 140.16952, "address": "千葉県四街道市大日429-2", "hours": "10:00-20:00"},
        {"name": "ハードオフ・ホビーオフ 市原五井店", "lat": 35.51281, "lng": 140.09521, "address": "千葉県市原市五井5472-1", "hours": "10:00-20:00"},
        {"name": "ブックオフ・オフハウス 千葉おゆみ野店", "lat": 35.55121, "lng": 140.16821, "address": "千葉県千葉市緑区おゆみ野南2-1-2", "hours": "10:00-21:00"},
        {"name": "千葉鑑定団 八千代店", "lat": 35.72481, "lng": 140.11821, "address": "千葉県八千代市勝田台1-18-1", "hours": "10:00-24:00"},
        {"name": "千葉鑑定団 東金店", "lat": 35.56821, "lng": 140.38211, "address": "千葉県東金市家徳38-1", "hours": "10:00-24:00"},
        {"name": "千葉鑑定団 酒々井店", "lat": 35.72891, "lng": 140.27321, "address": "千葉県印旛郡酒々井町飯積2-8-2", "hours": "10:00-24:00"},
        {"name": "千葉鑑定団 湾岸習志野店", "lat": 35.67621, "lng": 140.02411, "address": "千葉県習志野市茜浜1-1-1", "hours": "10:00-23:00"},
        {"name": "茨城鑑定団 神栖店", "lat": 35.88921, "lng": 140.66421, "address": "茨城県神栖市奥野谷275", "hours": "10:00-24:00"},
        {"name": "静岡鑑定団 八幡店", "lat": 34.96521, "lng": 138.40121, "address": "静岡県静岡市駿河区八幡3-6-12", "hours": "10:00-24:00"},
        {"name": "富士鑑定団", "lat": 35.15821, "lng": 138.68521, "address": "静岡県富士市青葉町545", "hours": "10:00-24:00"},
        {"name": "お宝創庫 半田店", "lat": 34.89211, "lng": 136.92541, "address": "愛知県半田市山代町1-106-1", "hours": "10:00-24:00"},
        {"name": "お宝創庫 堀田店", "lat": 35.11821, "lng": 136.92121, "address": "愛知県名古屋市瑞穂区新開町5-16", "hours": "10:00-24:00"},
        {"name": "お宝創庫 大府店", "lat": 35.01211, "lng": 136.96211, "address": "愛知県大府市共和町6-54-1", "hours": "10:00-24:00"},
        {"name": "お宝創庫 中川店", "lat": 35.13421, "lng": 136.85421, "address": "愛知県名古屋市中川区新家1-2421", "hours": "10:00-24:00"},
        {"name": "まんだらけ 中野店 (中野ブロードウェイ)", "lat": 35.70921, "lng": 139.66571, "address": "東京都中野区中野5-52-15", "hours": "12:00-20:00"},
        {"name": "まんだらけ コンプレックス (秋葉原)", "lat": 35.70031, "lng": 139.77061, "address": "東京都千代田区外神田3-11-12", "hours": "12:00-20:00"},
        {"name": "まんだらけ 渋谷店", "lat": 35.66121, "lng": 139.69871, "address": "東京都渋谷区宇田川町31-2 B2F", "hours": "12:00-20:00"},
        {"name": "まんだらけ 名古屋店 (大須)", "lat": 35.15881, "lng": 136.90411, "address": "愛知県名古屋市中区大須3-18-21", "hours": "12:00-20:00"},
        {"name": "まんだらけ グランドカオス (大阪日本橋)", "lat": 34.67121, "lng": 135.49821, "address": "大阪府大阪市中央区西心斎橋2-9-22", "hours": "12:00-20:00"},
        {"name": "らしんばん 秋葉原店新館", "lat": 35.70001, "lng": 139.77091, "address": "東京都千代田区外神田1-7-6 AKIBAカルチャーズZONE", "hours": "11:00-21:00"},
        {"name": "らしんばん 池袋本店", "lat": 35.73021, "lng": 139.71781, "address": "東京都豊島区東池袋1-28-4", "hours": "11:00-21:00"},
        {"name": "らしんばん 大阪日本橋店", "lat": 34.66111, "lng": 135.50561, "address": "大阪府大阪市浪速区日本橋3-6-3", "hours": "11:00-20:00"},
        {"name": "マンガ倉庫 福岡空港店", "lat": 33.58211, "lng": 130.45621, "address": "福岡県糟屋郡志免町別府北4-2-5", "hours": "24時間営業"},
        {"name": "万代 仙台南店", "lat": 38.20421, "lng": 140.88721, "address": "宮城県仙台市太白区中田6-25-20", "hours": "24時間営業"},
        {"name": "万代 多賀城店", "lat": 38.28521, "lng": 141.00821, "address": "宮城県多賀城市明月1-168-1", "hours": "10:00-24:00"}
    ]

    for idx, c in enumerate(CURATED_SHOPS):
        info = classify_shop(c["name"], "", {})
        if info:
            shops.append({
                "id": f"curated_{idx+1}",
                "name": c["name"],
                "chain": info["chain"],
                "chains": info["chains"],
                "brands": info["brands"],
                "categories": info["categories"],
                "lat": c["lat"],
                "lng": c["lng"],
                "address": c["address"],
                "hours": c["hours"]
            })

    # 同一敷地内・隣接店舗（約90m以内）にあるハードオフ系・ブックオフ系などの複合店舗を1つのバルーンに統合！
    BRAND_ORDER = [
        "hardoff", "bookoff", "bookoff_plus", "bookoff_sb",
        "offhouse", "hobbyoff", "modeoff", "garageoff", "liquoroff",
        "surugaya", "kanteidan", "lashinbang", "mandarake", "melonbooks", "animate",
        "geo", "furuichi", "otakarasouko", "mandai", "mangasouko"
    ]

    merged = []
    for s in shops:
        found = False
        for m in merged:
            dlat = abs(s["lat"] - m["lat"])
            dlng = abs(s["lng"] - m["lng"])
            if dlat < 0.00085 and dlng < 0.00085:
                # 同じ敷地内（約85m以内）の店舗を1つの複合バルーンにまとめる
                for ch in s["chains"]:
                    if ch not in m["chains"]:
                        m["chains"].append(ch)
                for br in s.get("brands", []):
                    if br not in m["brands"]:
                        m["brands"].append(br)
                for cat in s["categories"]:
                    if cat not in m["categories"]:
                        m["categories"].append(cat)
                if s["name"] not in m["name"] and len(m["name"]) < 45:
                    m["name"] = f"{m['name']} / {s['name']}"
                if not m["address"] and s["address"]:
                    m["address"] = s["address"]
                if not m["hours"] and s["hours"]:
                    m["hours"] = s["hours"]
                # ブランド順序を公式アプリ風（HARD OFF -> BOOK OFF -> OFF HOUSE -> Hobby OFF ...）に整列
                m["brands"].sort(key=lambda b: BRAND_ORDER.index(b) if b in BRAND_ORDER else 99)
                priority = ["hardoff", "hobbyoff", "offhouse", "bookoff", "surugaya", "kanteidan", "anime_shop", "general_game"]
                m["chain"] = next((p for p in priority if p in m["chains"]), m["chains"][0])
                found = True
                break
        if not found:
            s["brands"].sort(key=lambda b: BRAND_ORDER.index(b) if b in BRAND_ORDER else 99)
            merged.append(s)

    os.makedirs("data", exist_ok=True)
    with open("data/shops.json", "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))

    multi_count = sum(1 for s in merged if len(s.get("brands", [])) > 1)
    print(f"Saved {len(merged)} locations ({multi_count} multi-brand composite locations) to data/shops.json!")


if __name__ == "__main__":
    main()
