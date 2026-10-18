import urllib.request
import ssl
import json
import re

ctx = ssl._create_unverified_context()
HEADERS = {"User-Agent": "Mozilla/5.0"}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
        return r.read().decode("utf-8", errors="ignore")

# 1. Fetch Lashinbang official JSON API!
lash_json = json.loads(fetch("https://api.lashinbang.com/api/get_store"))
lash_stores = []
for item in lash_json.get("items", []):
    # Area 13 = overseas, 14 = online
    if str(item.get("area")) in ("13", "14"):
        continue
    name = item.get("name", "").strip()
    if name and not name.startswith("らしんばん"):
        name = f"らしんばん {name}"
    addr = item.get("address", "").strip()
    hours = re.sub(r'\s+', ' ', item.get("opening_hour", "")).strip()
    if name and addr:
        lash_stores.append({"name": name, "address": addr, "hours": hours})

print(f"Fetched {len(lash_stores)} official Lashinbang stores in Japan!")
with open("scripts/official_lashinbang.json", "w", encoding="utf-8") as f:
    json.dump(lash_stores, f, ensure_ascii=False, indent=2)

# 2. Check Melonbooks address in melonbooks.html
with open("scripts/melonbooks.html", "r", encoding="utf-8") as f:
    m_txt = f.read()

units = m_txt.split('<div class="shopUnit">')[1:]
melon_stores = []
for u in units:
    nm = re.search(r'<p class="shopUnit__shopName"><a[^>]*>([^<]+)</a></p>', u)
    if not nm:
        continue
    name = nm.group(1).strip()
    # Find 〒 postal code and following text
    addr_m = re.search(r'〒\s*\d{3}-\d{4}\s*(?:<br\s*/?>)?\s*([^<\n]+)', u)
    addr = addr_m.group(1).strip() if addr_m else ""
    hours_m = re.search(r'営業時間</p>\s*<p[^>]*>(.*?)</p>', u, re.S)
    hours = re.sub(r'<[^>]+>', ' ', hours_m.group(1)).strip() if hours_m else ""
    hours = re.sub(r'\s+', ' ', hours)
    if name and addr:
        melon_stores.append({"name": name, "address": addr, "hours": hours})

print(f"Extracted {len(melon_stores)} official Melonbooks stores with addresses!")
with open("scripts/official_melonbooks.json", "w", encoding="utf-8") as f:
    json.dump(melon_stores, f, ensure_ascii=False, indent=2)
