import re

with open("scripts/patterns_out3.txt", "w", encoding="utf-8") as out:
    with open("scripts/lashinbang.html", "r", encoding="utf-8") as f:
        txt = f.read()
    idx = txt.find("store.url")
    out.write("=== lashinbang around store.url ===\n" + txt[max(0, idx-800):min(len(txt), idx+1500)] + "\n")

    with open("scripts/melonbooks.html", "r", encoding="utf-8") as f:
        txt = f.read()
    idx = txt.find("メロンブックス秋葉原1号店")
    out.write("=== melonbooks wider ===\n" + txt[idx:idx+2500] + "\n")
