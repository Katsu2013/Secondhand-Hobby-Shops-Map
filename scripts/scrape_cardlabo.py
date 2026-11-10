"""
@file scripts/scrape_cardlabo.py
@description カードラボ（Card Labo）公式サイトから全国の店舗一覧（住所、電話番号、営業時間）を取得するスクリプト。
"""

import json
import re
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin
from html_tools import Tree

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"
    )
}


def clean_text(text: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', text)
    text = unicodedata.normalize('NFKC', text)
    text = text.replace('&emsp;', ' ').replace('&nbsp;', ' ')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def fetch_url(url: str, timeout: int = 15) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def fetch_all_cardlabo() -> list:
    print("Fetching Card Labo nationwide official stores...")
    base_url = "https://www.c-labo.jp/shop/"
    html = fetch_url(base_url)
    root = Tree(html).root

    shop_links = []
    for a in root.all('a'):
        href = a.attrs.get('href', '')
        if re.search(r'/shop/[a-z0-9_-]+/?$', href) and not href.endswith('/shop/'):
            text = clean_text(a.text())
            full_url = urljoin(base_url, href)
            if full_url not in [x[1] for x in shop_links] and text:
                shop_links.append((text, full_url))

    def parse_cardlabo_store(item):
        label, url = item
        try:
            store_html = fetch_url(url)
            s_root = Tree(store_html).root

            h1 = s_root.all('h1')
            title = clean_text(h1[0].text()) if h1 else label
            if not title:
                title = label
            if "カードラボ" not in title:
                title = f"カードラボ {title}"

            addr = ""
            hours = ""
            tel = ""

            for tr in s_root.all('tr'):
                ths = tr.all('th')
                tds = tr.all('td')
                if ths and tds:
                    th_txt = clean_text(ths[0].text())
                    td_txt = clean_text(tds[0].text())
                    if '所在地' in th_txt or '住所' in th_txt:
                        addr = td_txt
                    elif '営業時間' in th_txt:
                        hours = td_txt
                    elif 'TEL' in th_txt or '電話' in th_txt:
                        tel = td_txt

            clean_addr = re.sub(r'^[〒\d\- ]+', '', addr).strip()

            return {
                "name": title,
                "chain": "cardlabo",
                "chains": ["cardlabo"],
                "brands": ["cardlabo"],
                "url": url,
                "address": addr,
                "clean_address": clean_addr,
                "tel": tel,
                "hours": hours,
                "categories": ["tcg"],
                "subCategories": ["sub_tcg_card", "sub_anime_goods"],
            }
        except Exception as e:
            print(f"[WARN] Card Labo fetch error for {label} ({url}): {e}")
            return None

    stores = []
    # Use ThreadPoolExecutor to speed up 42 pages
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(parse_cardlabo_store, item) for item in shop_links]
        for f in as_completed(futures):
            res = f.result()
            if res and res["clean_address"]:
                stores.append(res)

    print(f"Fetched {len(stores)} official Card Labo stores.")
    return stores


if __name__ == '__main__':
    stores = fetch_all_cardlabo()
    with open('scripts/official_cardlabo.json', 'w', encoding='utf-8') as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
