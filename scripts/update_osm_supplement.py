"""補完対象チェーンのOSMデータを更新し、障害時には追跡済みJSONを保持する。"""
import json
import re
import ssl
import urllib.parse
import urllib.request
from pipeline_support import atomic_json_write

PATH = "scripts/osm_supplement.json"
TARGET = r"まんだらけ|MANDARAKE|メロンブックス|アニメイト|animate|万代|マンガ倉庫"
EXCLUDE = re.compile(r"閉店|万代橋|万代シティ|万代島|万代町|スーパーマーケット万代|アニメイトカフェ")


def update_osm_supplement():
    """日本国内の補完店舗だけを検索し、全体の大幅欠損や形式不正を保存しない。"""
    with open(PATH, encoding="utf-8") as handle:
        previous = json.load(handle)
    query = f'[out:json][timeout:35];(nwr["shop"]["name"~"{TARGET}",i](24,122,46,146);nwr["shop"]["brand"~"{TARGET}",i](24,122,46,146););out center tags;'
    for endpoint in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        try:
            request = urllib.request.Request(endpoint, data=urllib.parse.urlencode({"data": query}).encode(),
                headers={"User-Agent": "SecondhandHobbyShopsMap/1.0 (+https://github.com/Katsu2013/Secondhand-Hobby-Shops-Map)"})
            with urllib.request.urlopen(request, timeout=45, context=ssl.create_default_context()) as response:
                raw = json.load(response)
            if not isinstance(raw, dict) or not isinstance(raw.get("elements"), list):
                raise ValueError("Overpassの形式が不正です")
            elements = []
            for item in raw["elements"]:
                if not isinstance(item, dict) or not isinstance(item.get("tags"), dict):
                    continue
                tags = item["tags"]
                name = tags.get("name:ja") or tags.get("name") or ""
                if not isinstance(name, str) or EXCLUDE.search(name) or tags.get("shop") in (None, "no", "vacant", "supermarket", "convenience"):
                    continue
                if tags.get("disused:shop") or tags.get("abandoned:shop") or tags.get("closed") or tags.get("highway"):
                    continue
                if item.get("type") not in ("node", "way", "relation") or not isinstance(item.get("id"), int):
                    continue
                elements.append(item)
            if len(elements) < max(80, len(previous["elements"]) * 0.75):
                raise ValueError("補完データの件数が大幅に減少しています")
            elements.sort(key=lambda item: (item["type"], item["id"]))
            atomic_json_write(PATH, {"version": 1, "elements": elements})
            print(f"[OK] OSM補完: {len(elements)}件")
            return True
        except Exception as error:
            print(f"[WARN] OSM補完の取得失敗: {error}")
    print("[WARN] OSM補完は既存スナップショットを維持します。")
    return False
