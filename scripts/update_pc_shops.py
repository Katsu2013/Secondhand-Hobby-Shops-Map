"""PC・スマホ4チェーンの公式販売店舗と店舗別品目を更新する。

買取専用店・通販センター・工房の中古非販売店は一覧の段階で除外する。
店舗情報と品目を一緒に検証し、ページ欠落時はチェーン全体の前回値を維持する。
"""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs

from html_tools import Tree, Element
from pipeline_support import atomic_json_write
from update_assortments import fetch, normalize

INDEXES = {
    'iosys': 'https://iosys.co.jp/shop/',
    'janpara': 'https://www.janpara.co.jp/shopinfo',
    'pc_koubou': 'https://www.pc-koubou.jp/pc/used_shop_pckoubou.php',
    'inverse': 'https://www.shop-inverse.com/',
}
PREFIXES = {'iosys': 'イオシス', 'janpara': 'じゃんぱら', 'pc_koubou': 'パソコン工房', 'inverse': 'ショップインバース'}
# 列の意味は公式取扱表の画像内表記を確認。順序変更もファイル名で検出する。
JANPARA_ICONS = {6: 'スマホ', 4: 'タブレット', 15: 'ウェアラブル', 3: 'Mac', 2: 'ノートPC',
                 1: 'デスクトップPC', 7: 'PCパーツ', 12: 'ゲーム', 9: 'オーディオ', 8: 'カメラ'}


def children(node):
    """同じ行・定義リストの直接の要素を順序付きで取得する。"""
    return [child for child in node.children if isinstance(child, Element)]


def pairs(root):
    """th/td・dt/ddの見出しと値を対応付け、共通ナビを読まない。"""
    result = {}
    for parent in [root] + root.all():
        nodes = children(parent)
        for left, right in zip(nodes, nodes[1:]):
            if (left.tag, right.tag) in [('th', 'td'), ('dt', 'dd')]:
                result[normalize(left.text())] = right
    return result


def parse_index(kind, html):
    """公式の現行販売店一覧からURLを抽出する。URLの正規化後に重複を除く。"""
    root = Tree(html).root
    result = {}
    for link in root.all('a'):
        href, text = link.attrs.get('href', ''), link.text()
        path = urlparse(urljoin(INDEXES[kind], href)).path
        valid = False
        if kind == 'iosys':
            valid = bool(re.fullmatch(r'/shop/[\w]+\.html', path)) and '販売' in text
            text = re.sub(r'\s*(販売|買取)\s*', '', text)
        elif kind == 'janpara':
            valid = path == '/shopinfo/shop/' and bool(parse_qs(urlparse(href).query).get('shopcd')) and 'ECセンター' not in text
        elif kind == 'pc_koubou':
            valid = bool(re.fullmatch(r'/pc/used_shop_[\w-]+\.php', path)) and path != '/pc/used_shop_pckoubou.php'
        elif kind == 'inverse':
            valid = bool(re.fullmatch(r'/shop/[\w]+\.html', path)) and path not in ['/shop/close.html', '/shop/twitter.html']
            text = re.split(r'\s*(?:お買得情報|アクセス情報|アクセス|の セール情報|お買得)', text)[0].strip()
        if valid and text:
            url = urljoin(INDEXES[kind], href).split('#')[0]
            # 後続のキャンペーンリンクより、一覧先頭の正式名称を優先する。
            result.setdefault(url, text)
    if not result:
        raise ValueError(f'{kind}: 販売店舗一覧を解析できません')
    return result


def janpara_sales(html):
    """公式表の「販売」の○だけを採用し、後続の「買取」表を混ぜない。"""
    result, section = {}, None
    for node in Tree(html).root.all():
        if node.tag in ['h3', 'h4', 'h5'] and normalize(node.text()) in ['販売', '買取']:
            section = normalize(node.text())
        if node.tag != 'table' or section != '販売':
            continue
        rows = node.all('tr')
        if not rows: continue
        icons = []
        for image in rows[0].all('img'):
            match = re.search(r'clsicon120_(\d+)\.png', image.attrs.get('src', ''))
            if match: icons.append(int(match[1]))
        if set(icons) != set(JANPARA_ICONS) or len(icons) != len(JANPARA_ICONS):
            raise ValueError('じゃんぱらの販売取扱表の列構造が変わりました')
        for row in rows[1:]:
            headings, values = row.all('th'), row.all('td')
            if not headings: continue
            if len(values) != len(icons) or any(value.text() not in ['○', '-'] for value in values):
                raise ValueError('じゃんぱらの販売取扱表のセルが不正です')
            result[normalize(headings[0].text())] = [JANPARA_ICONS[icon] for icon, value in zip(icons, values) if value.text() == '○']
    if not result: raise ValueError('じゃんぱらの販売取扱表がありません')
    return result


def parse_detail(kind, html, label, url, sales=None, location_html=None):
    """住所・営業情報と、店舗に限定された販売品目を返す。"""
    root = Tree(html).root
    fields = pairs(root)
    if kind == 'pc_koubou':
        fields = pairs(Tree(location_html or '').root)
    if kind == 'inverse':
        scope = next((node for node in root.all() if node.attrs.get('id') == 'access'), None)
        if scope is None: raise ValueError('インバースのアクセス欄がありません')
        fields = pairs(scope)
    address = fields.get('住所') or fields.get('所在地')
    if address is None: raise ValueError(f'{kind} {label}: 住所欄がありません')
    address = re.split(r'\[?\s*Google\s*マップ|■店舗までの道順', address.text())[0].strip()
    address = re.sub(r'^〒?\s*\d{3}-?\d{4}\s*', '', address)
    if not re.match(r'.{2,3}[都道府県]', address): raise ValueError('国内住所を確認できません: ' + address)
    hours = fields.get('営業時間')
    labels = []
    name = label if label.startswith(PREFIXES[kind]) else PREFIXES[kind] + ' ' + label
    if kind == 'iosys':
        for parent in root.all():
            nodes = children(parent)
            if any(n.tag == 'h3' and normalize(n.text()) == '販売ジャンル一覧' for n in nodes):
                for node in nodes:
                    if node.tag == 'div': labels.extend(n.text() for n in node.all('li'))
    elif kind == 'janpara':
        labels = (sales or {}).get(normalize(label), [])
    elif kind == 'inverse':
        product = fields.get('お取り扱い商品')
        if product:
            labels = [node.text() for node in product.all('li')] or [product.text()]
    else:
        title = next((node.text() for node in root.all('h1') if node.attrs.get('id') == 'products--anchor'), '')
        name = re.sub(r'の中古パソコン\s*$', '', title).strip()
        if normalize(label) not in normalize(name): raise ValueError('工房の店舗名が一致しません')
        scopes = root.all(cls='used-shop-area-left')
        if not scopes: raise ValueError('工房の店舗別中古商品説明がありません')
        description = scopes[0].text()
        # 全店共通説明と通販ナビは採用しない。店名付き冒頭と「当店舗」の明記だけ。
        labels = [description.split('全国で')[0]]
        local = re.search(r'当店舗では、(.+?)を取り扱っております', description)
        if local: labels.append(local[1])
    if not labels: raise ValueError(f'{kind} {label}: 販売品目欄がありません')
    key = parse_qs(urlparse(url).query).get('shopcd', [None])[0] or Path(urlparse(url).path).stem
    return dict(id=f'{kind}_{key}', name=name, address=address, hours=hours.text() if hours else '', url=url, labels=labels)


def update_pc_shops():
    """公式一覧・全詳細が検証を通ったチェーンだけを保存し、失敗時は旧情報を保持する。"""
    evidence_path = Path('scripts/assortment_evidence.json')
    evidence = json.loads(evidence_path.read_text(encoding='utf-8'))
    for kind, index_url in INDEXES.items():
        path = Path(f'scripts/official_{kind}.json')
        try:
            html, index_date = fetch(index_url)
            links = parse_index(kind, html)
            sales = janpara_sales(html) if kind == 'janpara' else None
            def detail(item):
                url, label = item
                body, checked = fetch(url)
                location = None
                if kind == 'pc_koubou':
                    links = [urljoin(url, a.attrs['href']) for a in Tree(body).root.all('a')
                             if re.fullmatch(r'/shopinfo/map/[\w-]+\.php', a.attrs.get('href', ''))]
                    if not links: raise ValueError('工房の実店舗情報リンクがありません')
                    location, location_date = fetch(links[0])
                    checked = min(checked, location_date)
                row = parse_detail(kind, body, label, url, sales, location)
                row['checkedAt'] = min(checked, index_date) if kind == 'janpara' else checked
                return row
            with ThreadPoolExecutor(max_workers=4) as pool:
                stores = list(pool.map(detail, links.items()))
            old = json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
            minimum = {'iosys': 8, 'janpara': 45, 'pc_koubou': 40, 'inverse': 5}[kind]
            if len(stores) < max(minimum, len(old) * .85): raise ValueError('販売店舗件数が不足しています')
            if len({row['id'] for row in stores}) != len(stores): raise ValueError('店舗IDが重複しています')
            for row in stores:
                cats, subs = classify_pc_labels(row['labels'])
                evidence[row['id']] = dict(categories=cats, subCategories=subs, status='confirmed',
                    sources=[dict(url=index_url + '#sales' if kind == 'janpara' else row['url'], checkedAt=row['checkedAt'], labels=row['labels'])])
            atomic_json_write(path, sorted(stores, key=lambda row: row['id']))
            print(f'PC retail {kind}: {len(stores)} stores', flush=True)
        except Exception as error:
            print(f'[WARN] PC retail {kind}: {error}; previous snapshot retained', flush=True)
            if not path.exists(): raise
    atomic_json_write(evidence_path, dict(sorted(evidence.items())))


def classify_pc_labels(labels):
    """公式欄のPC・スマホの略記にも対応する。ジャンクの語だけでPCとは判断しない。"""
    text = normalize(' '.join(labels))
    subs = set()
    if re.search(r'パソコン|(?:ノート|デスクトップ)?pc|mac|ssd|hdd|メモリ|ディスプレイ|モニタ|pc周辺機器', text):
        subs.add('sub_pc_junk')
    if re.search(r'スマホ|スマートフォン|携帯電話|タブレット|iphone|ipad', text):
        subs.add('sub_smartphone')
    if 'オーディオ' in text: subs.add('sub_audio')
    if 'カメラ' in text: subs.add('sub_camera')
    from geocode_and_build import derive_parent_categories
    parents = set(derive_parent_categories(subs))
    if 'ゲーム' in text: parents.add('retro_game')
    return sorted(parents), sorted(subs)


if __name__ == '__main__':
    update_pc_shops()
