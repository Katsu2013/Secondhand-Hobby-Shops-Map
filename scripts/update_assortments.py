"""店舗別の公式販売品目を記録する。系列名、買取品目、レンタルから販売を推測しない。"""
import hashlib
import json
import re
import time
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
from urllib.error import HTTPError, URLError

from html_tools import Tree
from pipeline_support import atomic_json_write, stable_shop_id

CACHE = Path('scripts/research-cache')
EVIDENCE = Path('scripts/assortment_evidence.json')
HEADERS = {'User-Agent': 'Secondhand-Hobby-Shops-Map/1.0 (public store assortment verification)'}


def fetch(url):
    """検証済みTLS通信。7日以内のキャッシュで公式サイトへの負荷を抑える。"""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.html')
    if path.exists() and time.time() - path.stat().st_mtime < 7 * 86400:
        return path.read_text(encoding='utf-8'), datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).date().isoformat()
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as response:
        raw = response.read()
        encoding = response.headers.get_content_charset() or 'utf-8'
        html = raw.decode(encoding, errors='replace')
    if len(html) < 40: raise ValueError('empty response')
    if 'メンテナンス中' in html or 'maintenance/index.html' in html:
        raise ValueError('maintenance page')
    path.write_text(html, encoding='utf-8')
    time.sleep(0.2)
    return html, datetime.now(timezone.utc).date().isoformat()


def normalize(text):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text)).lower()


def classify_labels(labels):
    """明記された品目だけを分類。汎用のゲーム/ホビーは親分類に留める。"""
    text = ' ' + ' '.join(labels) + ' '
    rules = {
        'sub_retro_game': r'レトロゲーム|ファミコン|スーパーファミコン|セガサターン',
        'sub_modern_game': r'PS[45]|Switch|スイッチ|現行ゲーム',
        'sub_tcg_card': r'トレカ|トレーディングカード',
        'sub_board_game': r'ボードゲーム|TRPG',
        'sub_figure': r'フィギュア|フィギア',
        'sub_plamo': r'プラモデル|ガンプラ|プラモ',
        'sub_minicar_rail': r'ミニカー|鉄道模型',
        'sub_retro_toy': r'レトロ玩具|レトロおもちゃ|ブリキ|ソフビ|特撮|超合金',
        # PCソフトだけの取扱いはPC本体・ジャンクの根拠にならない。
        'sub_pc_junk': r'パソコン(?![\s・]*ソフト)|PC本体|ジャンク',
        'sub_smartphone': r'携帯電話販売|携帯電話・スマホ|スマホ・タブレット|スマートフォン|スマホ.*ケータイ',
        'sub_camera': r'カメラ', 'sub_tool_diy': r'工具|DIY',
        'sub_home_appliance': r'生活家電|デジタル家電|(?<!デジタル)家電|テレビ・映像製品',
        'sub_audio': r'オーディオ|音響機器', 'sub_instrument': r'楽器',
        'sub_vinyl_record': r'レコード|アナログ盤',
        'sub_comic_book': r'書籍|コミック|漫画|マンガ|まんが|ムック|^本$| 本 ',
        'sub_doujin': r'同人', 'sub_anime_goods': r'アニメグッズ|アニメ雑貨|キャラクター|キャラグッズ|缶バッジ|タペストリー',
        'sub_otome_goods': r'乙女|女性向け', 'sub_cd_dvd': r'CD|DVD|ブルーレイ|Blu-ray',
        'sub_apparel': r'古着|衣料|アパレル|ファッション|洋服',
        'sub_luxury_brand': r'ブランドバッグ|ハイブランド|貴金属|腕時計',
        'sub_outdoor_sport': r'アウトドア|スポーツ|ゴルフ|釣具',
        'sub_car_bike': r'カー用品|バイク|自転車|自動車',
        'sub_liquor': r'お酒|酒類|ワイン|シャンパン|ブランデー|ウィスキー|ウイスキー|ビール|日本酒|焼酎|リキュール', 'sub_furniture_zakka': r'家具|インテリア|生活雑貨|食器',
    }
    subs = sorted(key for key, pattern in rules.items() if re.search(pattern, text, re.I))
    from geocode_and_build import derive_parent_categories
    parents = set(derive_parent_categories(subs))
    if re.search(r'ゲーム', text): parents.add('retro_game')
    if re.search(r'ホビー|おもちゃ|玩具', text): parents.add('figure_hobby')
    return sorted(parents), subs


def parse_labels(kind, html):
    """ページの販売対象セクションだけを抽出し、構造変更時は失敗させる。"""
    root = Tree(html).root
    if kind == 'hardoff':
        scopes = root.all(cls='item_list')
        labels = [node.text() for scope in scopes for node in scope.all(cls='item_list_name')]
    elif kind == 'bookoff':
        # 「買いたい」= 店頭販売。「売りたい」= 店舗の買取対象。
        scopes = [node for node in root.all() if node.attrs.get('id') == 'tab-buy']
        labels = []
        for scope in scopes:
            for box in scope.all(cls='tab-box'):
                if box.has_class('no-handling'): continue
                details = [p.text() for p in box.all('p') if p.text()]
                labels.extend(details or [h.text() for h in box.all('h3') if h.text()])
    elif kind == 'geo':
        scopes = root.all(cls='viewServiceList')
        labels = [node.text() for scope in scopes for node in scope.all('li')
                  if not any(word in node.attrs.get('class', '') for word in ('off', 'disabled'))]
        # 買取・アクセサリー・設定サービスを商品販売として数えない。
        labels = [label for label in labels if '携帯電話販売' in label or '中古パソコン' in label]
    elif kind == 'furuichi':
        scopes = root.all(cls='shop-detail__product__table')
        labels = []
        for scope in scopes:
            for row in scope.all('tr'):
                cells = row.all('td')
                headings = row.all('th')
                if headings and any(cell.all(cls='circle') for cell in cells[:2]):
                    labels.append(headings[0].text())
    elif kind == 'otakarasouko':
        scopes = root.all(cls='shop-commodity')
        labels = [group.text() for scope in scopes for group in scope.all(cls='nav-sell') if any(h.text() in ('販売・買取', '販売のみ', '販売') for h in group.all('h3'))]
    else:
        raise ValueError(kind)
    if not scopes:
        raise ValueError('official assortment section not found')
    if kind not in ('geo', 'otakarasouko') and not labels:
        raise ValueError('empty official sales assortment')
    return labels


def index_links(html, base, pattern):
    """店舗名付きリンクを返す。既存スナップショットとの名前照合に使う。"""
    return [(normalize(a.text()), urljoin(base, a.attrs['href']))
            for a in Tree(html).root.all('a') if re.search(pattern, a.attrs.get('href', ''))]


def parse_geo_index(html):
    """地域別の旧URLに依存せず、現行一覧の店舗カードを抽出する。"""
    result={}
    for card in Tree(html).root.all(cls='areaBox'):
        names=card.all(cls='areaName')
        links=[a.attrs['href'] for a in card.all('a') if re.search(r'/store/\d+\.html$',a.attrs.get('href',''))]
        if not names or not links:continue
        fields={}
        for row in card.all('tr'):
            heads=row.all('th');cells=row.all('td')
            if heads and cells:fields[heads[0].text()]=cells[0].text()
        address=re.sub(r'〒?\s*\d{3}-?\d{4}\s*','',fields.get('住所','')).strip()
        if not address:continue
        sid='geo_off_'+re.search(r'(\d+)\.html$',links[0]).group(1)
        result[sid]=dict(id=sid,name=names[0].text(),address=address,hours=fields.get('営業時間',''))
    return list(result.values())


def update_assortments():
    registry = json.loads(Path('scripts/shop_id_registry.json').read_text(encoding='utf-8'))
    result = json.loads(EVIDENCE.read_text(encoding='utf-8')) if EVIDENCE.exists() else {}
    jobs = []
    # 通常ゲオは店舗全体の公式販売欄を使う。共通障害時に全店へ同じ失敗リクエストを送らない。
    from geo_assortments import parse_geo_online_sales, refresh_geo_assortment
    geo_items = {item['id']: item for item in json.loads(Path('scripts/official_geo.json').read_text(encoding='utf-8'))}
    geo_online_available = False
    probe = next((item for item in geo_items.values() if 'ゲオモバイル' not in item['name']), None)
    if probe:
        try:
            html, _ = fetch('https://geo-online.co.jp/store/' + probe['id'].removeprefix('geo_off_').zfill(5) + '/')
            parse_geo_online_sales(html, probe['name'])
            geo_online_available = True
        except Exception as error:
            # 1店舗の閉店・名称変更・404だけで、他の全店舗の取得を止めない。
            common_outage = (isinstance(error, HTTPError) and error.code in (403, 429, 500, 502, 503, 504)) or (isinstance(error, URLError) and not isinstance(error, HTTPError)) or str(error) == 'maintenance page'
            geo_online_available = not common_outage
            print(f'[WARN] GEO sales probe failed; common_outage={common_outage}, department fallback remains partial: {error}', flush=True)
    for kind in ('hardoff', 'bookoff', 'geo'):
        items = json.loads(Path(f'scripts/official_{kind}.json').read_text(encoding='utf-8'))
        for item in items:
            if kind == 'hardoff':
                sid = item['id']; url = 'https://www.hardoff.co.jp/shop/detail/?p=' + sid.removeprefix('ho_')
            elif kind == 'bookoff':
                if item.get('store_category') not in ('BOOKOFF', 'BOOKOFF PLUS', 'BOOKOFF SUPER BAZAAR') or '閉店' in item.get('title', ''): continue
                sid = 'bookoff_off_' + str(item['id']); url = urljoin('https://www.bookoff.co.jp/shop/', item['url'])
            else:
                sid = item['id']; url = 'https://geo-mobile.jp/store/' + sid.removeprefix('geo_off_').zfill(5) + '.html'
            jobs.append((sid, kind, url))
    for kind, base, pattern in (
        ('furuichi', 'https://www.furu1.net/shop/', r'/shop/shop\d+\.html'),
        ('otakarasouko', 'https://www.otakarasouko.com/shop/', r'/store/[^/]+/?$'),
    ):
        try:
            # 正式な一覧の階層カードから、名称と詳細URLを対応付ける。
            actual_base = 'https://www.otakarasouko.com/store/' if kind == 'otakarasouko' else base
            html, _ = fetch(actual_base)
            root = Tree(html).root
            if kind == 'furuichi':
                links = []
                for card in root.all(cls='shop__display__content'):
                    names = card.all(cls='shop__display__content__title__name__text')
                    urls = index_links_from_node(card, base, pattern)
                    if names and urls: links.append((normalize(names[0].text()), urls[0]))
            else:
                links = index_links(html, actual_base, pattern)
            for item in json.loads(Path(f'scripts/official_{kind}.json').read_text(encoding='utf-8')):
                name = normalize(item['name'])
                matches = [url for label, url in links if name == label or (kind == 'otakarasouko' and label.startswith(name))]
                if matches: jobs.append((stable_shop_id(kind, item, registry), kind, matches[0]))
        except Exception as error:
            print(f'[WARN] {kind} index: {error}', flush=True)
    # APIが公表する店舗別productsのみ使用。pr/guideは全店共通の商品案内が混ざる。
    try:
        url = 'https://api.lashinbang.com/api/get_store'
        html, checked = fetch(url)
        items = json.loads(html)['items']
        by_name = {normalize(item['name']): item for item in items}
        for old in json.loads(Path('scripts/official_lashinbang.json').read_text(encoding='utf-8')):
            item = by_name.get(normalize(old['name'])) or by_name.get(normalize(old['name'].removeprefix('らしんばん')))
            if not item: continue
            labels = [Tree(item.get('products') or '').root.text()]
            if not labels[0]: continue
            cats, subs = classify_labels(labels)
            result[stable_shop_id('lashinbang', old, registry)] = dict(categories=cats, subCategories=subs,
                sources=[dict(url=item.get('guide_page_url') or url, checkedAt=checked, labels=labels)], status='confirmed')
    except Exception as error:
        print(f'[WARN] lashinbang: {error}', flush=True)
    def execute(job):
        sid, kind, url = job
        if kind == 'geo':
            return sid, refresh_geo_assortment(geo_items[sid], fetch, result.get(sid), geo_online_available)
        html, checked = fetch(url)
        labels = parse_labels(kind, html)
        cats, subs = classify_labels(labels)
        entry = dict(categories=cats, subCategories=subs,
                     sources=[dict(url=url, checkedAt=checked, labels=labels)],
                     status='confirmed')
        return sid, entry
    failures = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(execute, job): job for job in jobs}
        for count, future in enumerate(as_completed(futures), 1):
            try:
                sid, entry = future.result(); result[sid] = entry
            except Exception as error:
                # 取得失敗を「取扱なし」で上書きしない。過去の確認日をそのまま残す。
                failures += 1
                if failures <= 10:
                    print(f'[WARN] assortment {futures[future][0]} {futures[future][2]}: {error}', flush=True)
            if count % 100 == 0:
                atomic_json_write(EVIDENCE, dict(sorted(result.items())))
                print(f'Assortments: {count}/{len(jobs)}, evidence={len(result)}, failures={failures}', flush=True)
    from update_more_assortments import update_more_assortments
    normal_ids = [sid for sid, item in geo_items.items() if 'ゲオモバイル' not in item['name']]
    full = sum(result.get(sid, {}).get('status') == 'confirmed' for sid in normal_ids)
    partial = sum(result.get(sid, {}).get('status') == 'partial' for sid in normal_ids)
    print(f'GEO normal stores: full={full}, department_only={partial}, unverified={len(normal_ids)-full-partial}', flush=True)
    update_more_assortments(result)
    atomic_json_write(EVIDENCE, dict(sorted(result.items())))
    print(f'Assortments complete: evidence={len(result)}, failures={failures}', flush=True)


def index_links_from_node(node, base, pattern):
    return [urljoin(base, a.attrs['href']) for a in node.all('a') if re.search(pattern, a.attrs.get('href', ''))]


if __name__ == '__main__':
    update_assortments()
