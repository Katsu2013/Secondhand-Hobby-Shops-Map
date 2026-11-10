"""
@file scripts/scrape_volks.py
@description ボークス（VOLKS）公式サイトから全国のショールーム・ホビースクエア・ドール店舗一覧を取得するスクリプト。
"""

import json
import re
import unicodedata
import urllib.request
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


def parse_volks_page(url: str, html: str, default_name: str) -> dict:
    root = Tree(html).root
    title = root.all('title')[0].text().split('|')[0].strip() if root.all('title') else default_name
    title = clean_text(title)
    if "ボークス" not in title and "天使の" not in title:
        title = f"ボークス {title}"

    addr = ""
    hours = ""
    tel = ""

    shop_datas = root.all(cls='shop-data')
    if shop_datas:
        raw = clean_text(shop_datas[0].text())
        m_a = re.search(r'(\d{3}-\d{4}\s+.*?)(?=\s*GoogleMap|\s*TEL[：:]|\s*営業時間|\Z)', raw)
        if m_a:
            addr = m_a.group(1).strip()
        m_t = re.search(r'TEL[：:\s]*([0-9]{2,4}-[0-9]{2,4}-[0-9]{3,4})', raw)
        if m_t:
            tel = m_t.group(1).strip()
        m_h = re.search(r'営業時間[：:\s]*(.*?)(?=\s*定休日|\s*※|\s*TEL|\s*FAX|\Z)', raw)
        if m_h:
            hours = m_h.group(1).strip()

    if not addr or not hours:
        for dl in root.all('dl'):
            for dd in dl.all('dd'):
                t = clean_text(dd.text())
                if not addr and re.search(r'(?:東京都|北海道|大阪府|京都府|[一-龥]{2,3}県)', t) and re.search(r'\d', t):
                    addr = re.sub(r'GoogleMap.*$', '', t).strip()
                if not tel and 'TEL' in t:
                    m_t = re.search(r'([0-9]{2,4}-[0-9]{2,4}-[0-9]{3,4})', t)
                    if m_t:
                        tel = m_t.group(1)
                if not hours and ('営業時間' in t or re.search(r'\d{1,2}[:：]\d{2}', t)):
                    m_h = re.search(r'(?:営業時間\s*)?((?:平日|土日祝)?\s*\d{1,2}[:：]\d{2}.*)', t)
                    if m_h:
                        hours = re.split(r'定休日|※|TEL', m_h.group(1))[0].strip()

    if "hobbytengoku2" in url:
        addr = "101-0021 東京都千代田区外神田4丁目2-10"
        hours = "平日 11:00～20:00 / 土日祝 10:00～20:00"
        tel = "03-3254-1059"
    elif "tenshinomado" in url:
        addr = "150-0001 東京都渋谷区神宮前1-12-1"
        hours = "11:00～20:00"
        tel = "03-3401-3113"
    elif "tenshinosato" in url:
        addr = "616-8371 京都府京都市右京区嵯峨天龍寺若宮町12"
        hours = "11:00～17:00"
        tel = "075-872-3100"

    clean_addr = re.sub(r'^[〒\d\- ]+', '', addr).strip()
    clean_addr = clean_text(clean_addr)
    hours = clean_text(hours)

    return {
        "name": title,
        "chain": "volks",
        "chains": ["volks"],
        "brands": ["volks"],
        "url": url,
        "address": clean_addr,
        "clean_address": clean_addr,
        "tel": tel,
        "hours": hours,
        "categories": ["figure_hobby"],
        "subCategories": ["sub_plamo", "sub_figure", "sub_tool_diy", "sub_anime_goods"],
    }


def fetch_all_volks() -> list:
    print("Fetching Volks nationwide official stores...")
    base_url = "https://hobby.volks.co.jp/shop/"
    html = fetch_url(base_url)
    root = Tree(html).root

    shop_links = []
    for a in root.all('a'):
        href = a.attrs.get('href', '')
        if href.startswith('/shop/') and href != '/shop/' and not href.endswith(('otakara.html', 'event.html')):
            text = a.text().strip()
            full_url = urljoin(base_url, href)
            if full_url not in [x[1] for x in shop_links] and text:
                shop_links.append((text, full_url))

    shop_links.append(("天使の窓 原宿・表参道", "https://dollfie.volks.co.jp/shop/tenshinomado/"))
    shop_links.append(("天使の里 霞中庵", "https://dollfie.volks.co.jp/shop/tenshinosato/"))

    stores = []
    seen_urls = set()
    for label, url in shop_links:
        if url in seen_urls:
            continue
        seen_urls.add(url)
        try:
            page_html = fetch_url(url)
            store_data = parse_volks_page(url, page_html, label)
            stores.append(store_data)
        except Exception as e:
            print(f"[WARN] Volks fetch error for {label} ({url}): {e}")

    print(f"Fetched {len(stores)} official Volks stores.")
    return stores


if __name__ == '__main__':
    stores = fetch_all_volks()
    with open('scripts/official_volks.json', 'w', encoding='utf-8') as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
