"""公表された販売品目だけを最終DBへ反映する。"""


def apply_assortment(shop, evidence, source_details):
    """未確認を取扱なしと区別し、複合店では確認できた構成店の情報を合算する。"""
    entries = [evidence.get(sid) for sid in shop['sourceIds']]
    known = [entry for entry in entries if entry]
    shop['categories'] = sorted({cat for entry in known for cat in entry['categories']})
    shop['subCategories'] = sorted({cat for entry in known for cat in entry['subCategories']})
    sources = {}
    for sid in shop['sourceIds']:
        entry = evidence.get(sid)
        if not entry: continue
        for source in entry['sources']:
            sources[source['url']] = dict(source, **source_details[sid], categories=entry['categories'], subCategories=entry['subCategories'])
    shop['assortmentSources'] = [sources[url] for url in sorted(sources)]
    shop['assortmentStatus'] = ('unverified' if not known else
        'partial' if len(known) < len(entries) or any(entry['status'] == 'partial' for entry in known) else 'confirmed')


def correct_brand(shop):
    """専門店を系列の看板へ置換しない。分類は取扱商品の証拠とは別に管理する。"""
    name = shop['name']
    if '万代書店' in name:
        shop['brands'] = ['mandaishoten' if b == 'mandai' else b for b in shop['brands']]
    if 'ゲオモバイル' in name:
        shop['brands'] = ['geo_mobile' if b == 'geo' else b for b in shop['brands']]
        shop['subBrand'] = 'ゲオモバイル'
    for original, replacements in (
        ('furuichi', [('トレカパーク', 'torekapark'), ('ふるいち', 'furuiti')]),
        ('otakarasouko', [('プレイズ', 'preyz'), ('エコツール', 'ecotool'), ('おじゃま館', 'ojamakan'), ('メディオ', 'medio')]),
    ):
        for keyword, brand in replacements:
            if keyword in name and original in shop['brands']:
                shop['brands'] = [brand if b == original else b for b in shop['brands']]
                break
