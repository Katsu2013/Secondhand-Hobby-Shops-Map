import urllib.request
import urllib.parse
import json
import time
import ssl

BRANDS = [
    "ハードオフ", "HARD OFF", "オフハウス", "OFF HOUSE", "ホビーオフ", "HOBBY OFF",
    "モードオフ", "MODE OFF", "ガレージオフ", "GARAGE OFF", "リカーオフ", "LIQUOR OFF",
    "ブックオフ", "BOOKOFF", "BOOK OFF", "BOOKOFF SUPER BAZAAR", "BOOKOFF PLUS",
    "駿河屋", "らしんばん", "まんだらけ", "メロンブックス", "アニメイト",
    "ゲオ", "GEO", "古本市場", "ふるいち", "お宝創庫", "万代", "マンガ倉庫",
    "千葉鑑定団", "茨城鑑定団", "静岡鑑定団", "鑑定団"
]

brand_clauses = "\n".join([f'  nwr["brand"="{b}"];' for b in BRANDS])

query = f"""[out:json][timeout:45];
(
{brand_clauses}
  nwr["shop"="second_hand"](24.0,122.0,46.0,146.0);
  nwr["shop"="anime"](24.0,122.0,46.0,146.0);
);
out center tags;"""

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

ctx = ssl._create_unverified_context()

for url in ENDPOINTS:
    try:
        print(f"Querying {url} ...")
        t0 = time.time()
        req = urllib.request.Request(
            url,
            data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
            headers={
                "User-Agent": "ReuseShopMapApp/1.0 (https://example.com; contact@example.com)",
                "Accept": "*/*"
            }
        )
        with urllib.request.urlopen(req, timeout=50, context=ctx) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
        elems = raw.get("elements", [])
        print(f"Got {len(elems)} elements from {url} in {time.time()-t0:.1f}s")
        if len(elems) > 0:
            with open("scripts/raw_overpass.json", "w", encoding="utf-8") as f:
                json.dump(raw, f, ensure_ascii=False)
            break
    except Exception as e:
        print(f"Failed {url}: {e}")
