"""通常ゲオの販売欄と、ゲオモバイルのサービス欄を区別する。"""
import re
import unicodedata
from html_tools import Tree, Element


def compact(text):
    """公式一覧と詳細ページの店舗名を表記ゆれだけ除いて比較する。"""
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text))


def walk(node, blocked=False):
    """非取扱・非表示の親要素を子にも引き継ぎ、無効な品目を拾わない。"""
    classes = set(node.attrs.get('class', '').split())
    blocked = blocked or bool(classes & {'off', 'disabled', 'is-disabled', 'no-handling', 'not-handling'}) or 'hidden' in node.attrs or node.attrs.get('aria-disabled') == 'true' or 'display:none' in node.attrs.get('style', '').replace(' ', '')
    yield node, blocked
    for child in node.children:
        if isinstance(child, Element):
            yield from walk(child, blocked)


def parse_geo_online_sales(html, expected_name):
    """「お取扱い品目」内の新品販売・中古販売だけを、条件書き付きで抽出する。

    実サイトが復旧するまでDOMの完全な実機確認はできないため、構造が異なる応答を
    成功扱いしない。近隣店・通販ナビ・レンタル・買取は対象外。
    """
    root = Tree(html).root
    if compact(expected_name) not in {compact(h.text()) for h in root.all('h1')}:
        raise ValueError('GEO store identity mismatch or maintenance page')
    active = False
    section = None
    found = set()
    saw_items = False
    records = []
    for node, blocked in walk(root):
        title = compact(node.text()) if node.tag in ('h2', 'h3', 'h4', 'dt') else ''
        if node.tag == 'h2':
            if active:
                break
            active = bool(re.fullmatch(r'お?取扱い?品目', title))
            continue
        if not active:
            continue
        if node.tag in ('h3', 'h4', 'dt') and title in ('新品販売', '中古販売', 'レンタル', '買取'):
            section = title
            if title in ('新品販売', '中古販売'):
                found.add(title)
        elif node.tag in ('h3', 'h4'):
            section = None
        if section in ('新品販売', '中古販売') and node.tag == 'li' and not node.all('li'):
            saw_items = True
            if blocked:
                continue
            label = node.text() or ' '.join(img.attrs.get('alt', '') for img in node.all('img'))
            if label and compact(label) not in ('なし', '取扱なし', 'お取扱いなし'):
                records.append((section, label))
    if found != {'新品販売', '中古販売'} or not saw_items:
        raise ValueError('GEO official sales structure not confirmed')
    return records


def classify_geo_sales(records):
    """SIM開通だけ・AVアクセサリーだけを、端末や生活家電の販売へ拡張しない。"""
    from update_assortments import classify_labels
    categories, sub_categories = set(), set()
    for section, label in records:
        text = compact(label)
        if '携帯電話' in text and 'のみ' in text and ('SIM' in text.upper() or '開通' in text):
            continue
        if text.startswith('家電') and 'のみ' in text:
            categories.add('pc_junk')  # 大分類まで。生活家電・音響機器の詳細は保証しない。
            continue
        converted = '携帯電話販売' if text == '携帯電話' else label
        parents, subs = classify_labels([converted])
        categories.update(parents)
        sub_categories.update(subs)
    return sorted(categories), sorted(sub_categories)


def is_full_geo_evidence(entry):
    """取得障害時に保持すべき、店舗全体の過去の公式販売情報かを判定する。"""
    return bool(entry and entry.get('status') == 'confirmed' and any(re.fullmatch(r'https://geo-online\.co\.jp/store/\d+/', source.get('url', '')) for source in entry.get('sources', [])))


def refresh_geo_assortment(item, fetch_page, previous=None, online_available=True):
    """通常店はGEO Onlineを優先し、障害時のモバイル情報を全体の確認済みにしない。"""
    from update_assortments import parse_labels, classify_labels
    number = item['id'].removeprefix('geo_off_').zfill(5)
    mobile_only = 'ゲオモバイル' in compact(item['name'])
    if not mobile_only and online_available:
        try:
            url = f'https://geo-online.co.jp/store/{number}/'
            html, checked = fetch_page(url)
            records = parse_geo_online_sales(html, item['name'])
            cats, subs = classify_geo_sales(records)
            return dict(categories=cats, subCategories=subs, status='confirmed', sources=[dict(url=url, checkedAt=checked, labels=[f'{section}：{label}' for section, label in records])])
        except Exception:
            pass
    if not mobile_only and is_full_geo_evidence(previous):
        return previous  # 確認日を偽って更新せず、全体の情報を狭い部門情報で消さない。
    url = f'https://geo-mobile.jp/store/{number}.html'
    html, checked = fetch_page(url)
    root = Tree(html).root
    if not any(compact(h.text()).startswith(compact(item['name'])) for h in root.all('h1')):
        raise ValueError('GEO mobile store identity mismatch')
    labels = parse_labels('geo', html)
    cats, subs = classify_labels(labels)
    return dict(categories=cats, subCategories=subs, status='confirmed' if mobile_only else 'partial', sources=[dict(url=url, checkedAt=checked, labels=labels)])
