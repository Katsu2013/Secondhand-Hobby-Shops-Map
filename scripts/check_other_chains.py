import urllib.request
import ssl
import re

ctx = ssl._create_unverified_context()
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
        return r.read().decode("utf-8", errors="ignore")

# 1. Inspect Furuichi (1MB HTML - likely has all store names, addresses, or lat/lng!)
furu_html = fetch("https://www.furu1.net/shop/")
with open("scripts/furuichi.html", "w", encoding="utf-8") as f:
    f.write(furu_html)

# 2. Inspect Otakarasouko
ota_html = fetch("https://www.otakarasouko.com/store/")
with open("scripts/otakarasouko.html", "w", encoding="utf-8") as f:
    f.write(ota_html)

# 3. Inspect Melonbooks
melon_html = fetch("https://www.melonbooks.co.jp/shop/")
with open("scripts/melonbooks.html", "w", encoding="utf-8") as f:
    f.write(melon_html)

# 4. Inspect Lashinbang
lashin_html = fetch("https://www.lashinbang.com/store/")
with open("scripts/lashinbang.html", "w", encoding="utf-8") as f:
    f.write(lashin_html)

print("Saved furuichi, otakarasouko, melonbooks, lashinbang HTMLs!")
