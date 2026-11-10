"""
@file scripts/scrape_jungle.py
@description ジャングル（JUNGLE）公式サイトから全国の店舗一覧（住所、電話番号、営業時間）を取得するスクリプト。
"""

import json
import re
import unicodedata
import urllib.request
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


def fetch_all_jungle() -> list:
    print("Fetching Jungle nationwide official stores...")
    url = "https://jungle-scs.co.jp/?page_id=21"
    html = fetch_url(url)

    matches = re.findall(r'<h[2-4][^>]*>(.*?)</h[2-4]>(.*?)(?=<h[2-4]|\Z)', html, re.S)
    stores = []

    for h, raw_body in matches:
        title = clean_text(h)
        if not any(k in title for k in ['ジャングル', 'JUNGLE', 'メカストア']):
            continue
        if 'Cafe' in title or '休業' in title:
            continue

        if "JUNGLE AKIBA" in title:
            title = "ジャングル 秋葉原2号店 (JUNGLE AKIBA)"
        elif "ジャングル" not in title:
            title = f"ジャングル {title}"

        body = clean_text(raw_body)

        m_a = re.search(r'住所\s*(?:〒?\s*\d{3}-\d{4})?\s*([一-龥ぁ-んァ-ヶa-zA-Z0-9_\- 丁目番地号]+?(?:都|道|府|県)[^TELFAX営業時間]+)', body)
        raw_addr = ""
        if m_a:
            raw_addr = m_a.group(1).strip()
            raw_addr = re.split(r'TEL|FAX|営業時間|定休日', raw_addr)[0].strip()

        if not raw_addr:
            m_a2 = re.search(r'(?:〒?\s*\d{3}-\d{4})?\s*([一-龥ぁ-んァ-ヶa-zA-Z0-9_\- 丁目番地号]+?(?:東京都|北海道|大阪府|愛知県|福岡県)[^TELFAX営業時間]+)', body)
            if m_a2:
                raw_addr = re.split(r'TEL|FAX|営業時間|定休日', m_a2.group(1))[0].strip()

        if "大阪日本橋店" in title:
            raw_addr = "大阪府大阪市浪速区日本橋3-7-5"
        elif "メカストア" in title:
            raw_addr = "大阪府大阪市浪速区日本橋3-4-16"

        clean_addr = re.sub(r'^[〒\d\- ]+', '', raw_addr).strip()
        clean_addr = re.sub(r'@\w+.*$', '', clean_addr).strip()

        hm = re.findall(r'(?:平日|土日祝)?\s*[:：]?\s*\d{1,2}[:：]\d{2}\s*[～〜~-]\s*\d{1,2}[:：]\d{2}', body)
        hours = " / ".join(hm) if hm else "平日 12:00～20:00 / 土日祝 11:00～20:00"

        m_t = re.search(r'TEL[：:\.\s]*([0-9]{2,4}-[0-9]{2,4}-[0-9]{3,4})', body)
        tel = m_t.group(1).strip() if m_t else ""

        stores.append({
            "name": title,
            "chain": "jungle",
            "chains": ["jungle"],
            "brands": ["jungle"],
            "url": "https://jungle-scs.co.jp/?page_id=21",
            "address": raw_addr,
            "clean_address": clean_addr,
            "tel": tel,
            "hours": hours,
            "categories": ["figure_hobby"],
            "subCategories": ["sub_retro_toy", "sub_figure", "sub_plamo"],
        })

    print(f"Fetched {len(stores)} official Jungle stores.")
    return stores


if __name__ == '__main__':
    stores = fetch_all_jungle()
    with open('scripts/official_jungle.json', 'w', encoding='utf-8') as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
