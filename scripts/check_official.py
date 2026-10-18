import urllib.request
import ssl
import re

ctx = ssl._create_unverified_context()
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# 1. Surugaya Chiba page
req1 = urllib.request.Request("https://www.suruga-ya.jp/feature/shoplist/chiba.html", headers=headers)
with urllib.request.urlopen(req1, timeout=20, context=ctx) as r:
    su_chiba = r.read().decode("utf-8", errors="ignore")
with open("scripts/su_chiba.html", "w", encoding="utf-8") as f:
    f.write(su_chiba)
print("Surugaya chiba.html len:", len(su_chiba))

# 2. Hard Off Chiba list with checkboxes on
ho_url = "https://www.hardoff.co.jp/shop/list/?a=12&w=&t1=on&t3=on&t8=on&t5=on&t4=on&t6=on&t2=on&t12=on&t13=on&t14=on&t15=on&t31=on&t41=on&t81=on"
req2 = urllib.request.Request(ho_url, headers=headers)
with urllib.request.urlopen(req2, timeout=20, context=ctx) as r:
    ho_chiba = r.read().decode("utf-8", errors="ignore")
with open("scripts/ho_chiba.html", "w", encoding="utf-8") as f:
    f.write(ho_chiba)
print("Hard Off chiba list len:", len(ho_chiba))
