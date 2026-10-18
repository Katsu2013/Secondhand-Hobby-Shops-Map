import urllib.request
import urllib.parse
import ssl
import re
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

ctx = ssl._create_unverified_context()
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def fetch_url(url, timeout=20):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read().decode("utf-8", errors="ignore")

# ============================================================================
# 1. 駿河屋 公式サイト (リアルストア全店舗 + フレンドリーショップ) の取得
# ============================================================================
def fetch_all_surugaya():
    print("Fetching Surugaya official store list...")
    index_html = fetch_url("https://www.suruga-ya.jp/feature/shoplist/index.html")
    pref_links = sorted(list(set(re.findall(r'/feature/shoplist/[a-z0-9_-]+\.html', index_html))))
    pref_links = [p for p in pref_links if not p.endswith("index.html") and "taiwan" not in p]
    print(f"Found {len(pref_links)} Surugaya prefecture pages.")

    stores = []
    seen_names = set()

    def parse_pref_page(path):
        url = "https://www.suruga-ya.jp" + path
        try:
            html = fetch_url(url)
        except Exception as e:
            print(f"Error {url}: {e}")
            return []
        blocks = re.findall(r'<div class="[^"]*tenpo-info[^"]*">(.*?)</div>\s*</div>\s*</div>', html, re.S)
        # Better split by '<div class="tenpo-name">'
        parts = html.split('<div class="tenpo-name">')[1:]
        res = []
        for p in parts:
            name_m = re.search(r'>\s*([^<]+?)\s*</a>', p)
            if not name_m:
                name_m = re.search(r'^([^<]+)<', p)
            name = name_m.group(1).strip() if name_m else ""
            if not name or "台湾" in name:
                continue

            addr_m = re.search(r'<div class="tenpo-address">(.*?)</div>', p, re.S)
            addr_raw = addr_m.group(1) if addr_m else ""
            # Remove <a ...>Google Map</a> and tags
            addr_clean = re.sub(r'<a[^>]*>.*?</a>', '', addr_raw, flags=re.S)
            addr_clean = re.sub(r'<[^>]+>', ' ', addr_clean)
            addr_clean = re.sub(r'〒\s*\d{3}-\d{4}', '', addr_clean)
            addr_clean = re.sub(r'\s+', ' ', addr_clean).strip()

            # Hours
            clock_m = re.search(r'bi-clock.*?</div>\s*<div[^>]*>(.*?)</div>', p, re.S)
            hours_raw = clock_m.group(1) if clock_m else ""
            hours_clean = re.sub(r'<!--.*?-->', '', hours_raw, flags=re.S)
            hours_clean = re.sub(r'<[^>]+>', ' ', hours_clean)
            hours_clean = re.sub(r'\s+', ' ', hours_clean).strip()
            # Keep first time range if long
            hm = re.search(r'\d{1,2}:\d{2}\s*[～〜~\-]\s*\d{1,2}:\d{2}', hours_clean)
            hours = hm.group(0) if hm else hours_clean[:25]

            res.append({
                "name": name,
                "address": addr_clean,
                "hours": hours
            })
        return res

    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(parse_pref_page, p) for p in pref_links]
        for f in as_completed(futures):
            for s in f.result():
                if s["name"] not in seen_names and s["address"]:
                    seen_names.add(s["name"])
                    stores.append(s)

    print(f"Fetched {len(stores)} official Surugaya stores in Japan!")
    return stores

# ============================================================================
# 2. ハードオフグループ 公式サイト (全1,100+店舗) の取得
# ============================================================================
def fetch_all_hardoff():
    print("Fetching Hard Off Group official nationwide store list...")
    base_query = "a=100&w=&t1=on&t2=on&t3=on&t4=on&t5=on&t6=on&t8=on&t12=on&t13=on&t14=on&t15=on&t31=on&t41=on&t81=on"
    first_html = fetch_url(f"https://www.hardoff.co.jp/shop/list/?{base_query}")
    m_total = re.search(r'(\d+)件中', first_html)
    total_count = int(m_total.group(1)) if m_total else 1080
    total_pages = (total_count + 29) // 30
    print(f"Hard Off Group total stores: {total_count} ({total_pages} pages)")

    def parse_ho_page(pg):
        url = f"https://www.hardoff.co.jp/shop/list/?pg={pg}&{base_query}" if pg > 1 else f"https://www.hardoff.co.jp/shop/list/?{base_query}"
        try:
            html = fetch_url(url)
        except Exception as e:
            print(f"Error HO page {pg}: {e}")
            return []

        items = re.findall(r'<li><a href="/shop/detail/\?p=(\d+)">(.*?)</a></li>', html, re.S)
        res = []
        for shop_id, body in items:
            # Skip closed stores (閉店済み)
            if "store_close_icon_txt" in body or "閉店済み" in body:
                continue
            logo_m = re.search(r'store_list2_logo\s+([a-z0-9_]+)', body)
            logo_type = logo_m.group(1) if logo_m else "hard_off"

            ttl_m = re.search(r'<h3 class="store_list2_ttl">([^<]+)</h3>', body)
            name = ttl_m.group(1).strip() if ttl_m else ""

            data_m = re.search(r'<div class="store_list2_data">\s*<p>([^<]+)</p>', body)
            addr_raw = data_m.group(1).strip() if data_m else ""
            addr_clean = re.sub(r'^〒\s*\d{3}-\d{4}\s*', '', addr_raw).strip()

            park_m = re.search(r'<p>(駐車場：[^<]+)</p>', body)
            parking = park_m.group(1).strip() if park_m else ""

            if name and addr_clean:
                res.append({
                    "id": f"ho_{shop_id}",
                    "name": name,
                    "logo_type": logo_type,
                    "address": addr_clean,
                    "parking": parking
                })
        return res

    all_ho = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(parse_ho_page, pg) for pg in range(1, total_pages + 1)]
        for f in as_completed(futures):
            all_ho.extend(f.result())

    print(f"Fetched {len(all_ho)} active Hard Off Group stores!")
    return all_ho

if __name__ == "__main__":
    su = fetch_all_surugaya()
    ho = fetch_all_hardoff()
    with open("scripts/official_surugaya.json", "w", encoding="utf-8") as f:
        json.dump(su, f, ensure_ascii=False, indent=2)
    with open("scripts/official_hardoff.json", "w", encoding="utf-8") as f:
        json.dump(ho, f, ensure_ascii=False, indent=2)
    print("Saved official Surugaya and Hard Off JSON files!")
