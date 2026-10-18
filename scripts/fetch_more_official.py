import urllib.request
import ssl
import re
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

ctx = ssl._create_unverified_context()
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def fetch_url(url, timeout=20):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read().decode("utf-8", errors="ignore")

# Check Surugaya Friendly Shops
html = fetch_url("https://www.suruga-ya.jp/feature/shoplist-friendly/index.html")
pref_links = sorted(list(set(re.findall(r'/feature/shoplist-friendly/[a-z0-9_-]+\.html', html))))
pref_links = [p for p in pref_links if not p.endswith("index.html")]
print("Surugaya friendly pref links:", len(pref_links))

friendly_stores = []
for p in pref_links:
    try:
        p_html = fetch_url("https://www.suruga-ya.jp" + p)
        parts = p_html.split('<div class="tenpo-name">')[1:]
        for part in parts:
            name_m = re.search(r'>\s*([^<]+?)\s*</a>', part) or re.search(r'^([^<]+)<', part)
            name = name_m.group(1).strip() if name_m else ""
            addr_m = re.search(r'<div class="tenpo-address">(.*?)</div>', part, re.S)
            addr_raw = addr_m.group(1) if addr_m else ""
            addr_clean = re.sub(r'<a[^>]*>.*?</a>', '', addr_raw, flags=re.S)
            addr_clean = re.sub(r'<[^>]+>', ' ', addr_clean)
            addr_clean = re.sub(r'〒\s*\d{3}-\d{4}', '', addr_clean)
            addr_clean = re.sub(r'\s+', ' ', addr_clean).strip()
            if name and addr_clean:
                if "駿河屋" not in name:
                    name = f"{name} (駿河屋FS)"
                friendly_stores.append({"name": name, "address": addr_clean, "hours": ""})
    except Exception:
        pass

print(f"Fetched {len(friendly_stores)} Surugaya friendly shops!")
with open("scripts/official_surugaya_friendly.json", "w", encoding="utf-8") as f:
    json.dump(friendly_stores, f, ensure_ascii=False, indent=2)
