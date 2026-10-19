import urllib.request
import re
import json
import html

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

req = urllib.request.Request('https://yellowsubmarine.co.jp/', headers=headers)
h = urllib.request.urlopen(req, timeout=10).read().decode('utf-8', errors='ignore')

shop_urls = []
for m in re.finditer(r'href=[\'"](https://yellowsubmarine\.co\.jp/shop/[^\'"]+)[\'"]', h):
    u = m.group(1)
    if u != 'https://yellowsubmarine.co.jp/shop/' and u not in shop_urls:
        shop_urls.append(u)

print(f"Scraping {len(shop_urls)} Yellow Submarine stores...")

ys_shops = []
for u in shop_urls:
    try:
        req = urllib.request.Request(u, headers=headers)
        page_html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8', errors='ignore')
        
        # Title
        title_m = re.search(r'<title>(.*?)</title>', page_html, re.I)
        raw_title = title_m.group(1) if title_m else ""
        name = raw_title.split('|')[0].split('-')[0].strip()
        if not name.startswith("イエローサブマリン"):
            name = f"イエローサブマリン {name}"

        # th/td pairs
        trs = re.findall(r'<tr.*?>(.*?)</tr>', page_html, flags=re.DOTALL | re.I)
        data = {}
        for tr in trs:
            th = re.search(r'<th.*?>(.*?)</th>', tr, flags=re.DOTALL | re.I)
            td = re.search(r'<td.*?>(.*?)</td>', tr, flags=re.DOTALL | re.I)
            if th and td:
                th_text = re.sub(r'<[^>]+>', '', th.group(1)).strip()
                td_text = re.sub(r'<br\s*/?>', ' / ', td.group(1))
                td_text = re.sub(r'<[^>]+>', ' ', td_text).strip()
                td_text = ' '.join(td_text.split())
                data[th_text] = html.unescape(td_text)

        addr = data.get('所在地', '')
        hours = data.get('営業時間', '')
        tel = data.get('電話番号', '') or data.get('連絡先', '')

        # Fallback for address if not in table
        if not addr:
            m_addr = re.search(r'(&#12306;[^\n<]+(?:都|道|府|県)[^\n<]+)', page_html)
            if m_addr:
                addr = html.unescape(re.sub(r'<[^>]+>', ' ', m_addr.group(1)).strip())

        # Clean address
        addr_clean = re.sub(r'^[〒\d\- ]+', '', addr).strip()

        # Categories
        # Yellow Submarine typically handles TCG, Board games, Plamo, Figures
        categories = ['tcg', 'figure_hobby']
        sub_categories = ['sub_tcg_card', 'sub_board_game']
        if any(w in page_html for w in ['プラモデル', 'スケールモデル', 'ガンプラ', 'プラモ']):
            sub_categories.append('sub_plamo')
        if any(w in page_html for w in ['フィギュア', 'トイ', 'キャラクター']):
            sub_categories.append('sub_figure')

        shop_obj = {
            "name": name,
            "chain": "yellowsubmarine",
            "chains": ["yellowsubmarine"],
            "brands": ["yellowsubmarine"],
            "url": u,
            "address": addr,
            "clean_address": addr_clean,
            "tel": tel,
            "hours": hours,
            "categories": categories,
            "subCategories": sorted(list(set(sub_categories)))
        }
        ys_shops.append(shop_obj)
        print(f"OK: {name} | {addr_clean} | {hours}")
    except Exception as e:
        print(f"Err {u}: {e}")

print(f"Total Yellow Submarine shops scraped: {len(ys_shops)}")
with open('scripts/official_yellowsubmarine.json', 'w', encoding='utf-8') as f:
    json.dump(ys_shops, f, ensure_ascii=False, indent=2)
