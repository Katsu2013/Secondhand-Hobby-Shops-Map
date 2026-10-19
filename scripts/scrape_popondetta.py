import urllib.request
import re
import json
import html

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
url = 'https://popondetta.com/map.html'
req = urllib.request.Request(url, headers=headers)
page_html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8', errors='ignore')

tables = re.findall(r'<table.*?</table>', page_html, flags=re.DOTALL | re.I)
table0 = tables[0]
rows = re.findall(r'<tr.*?</tr>', table0, flags=re.DOTALL | re.I)

current_pref = ""
popon_shops = []

for r in rows:
    tds = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, flags=re.DOTALL | re.I)
    cells = []
    for td in tds:
        val = re.sub(r'<[^>]+>', ' ', td).strip()
        val = ' '.join(val.split())
        cells.append(html.unescape(val))

    if not cells:
        continue
    if len(cells) == 1:
        continue
    if any('店舗名' in c for c in cells):
        continue

    if len(cells) >= 6:
        current_pref = cells[0]
        name = cells[1]
        addr = cells[2]
        tel = cells[3]
        hours = cells[4]
    elif len(cells) == 5:
        name = cells[0]
        addr = cells[1]
        tel = cells[2]
        hours = cells[3]
    else:
        continue

    # Clean name
    name = name.strip()
    full_name = f"ポポンデッタ {name}" if not name.startswith("ポポンデッタ") else name

    # Clean address
    addr_clean = re.sub(r'^[〒\d\- ]+', '', addr).strip()

    popon_shops.append({
        "name": full_name,
        "chain": "popondetta",
        "chains": ["popondetta"],
        "brands": ["popondetta"],
        "pref": current_pref,
        "address": addr,
        "clean_address": addr_clean,
        "tel": tel,
        "hours": hours,
        "url": "https://popondetta.com/map.html",
        "categories": ["figure_hobby"],
        "subCategories": ["sub_minicar_rail"]
    })

print(f"Extracted {len(popon_shops)} Popondetta shops.")
with open('scripts/official_popondetta.json', 'w', encoding='utf-8') as f:
    json.dump(popon_shops, f, ensure_ascii=False, indent=2)
