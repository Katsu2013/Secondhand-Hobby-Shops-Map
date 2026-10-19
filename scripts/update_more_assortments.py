"""駿河屋の品目欄と、補完店舗の公式フロア/取扱カテゴリを確認する。"""
import json,re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
from urllib.parse import urljoin,urlparse
from html_tools import Tree,Element
from pipeline_support import stable_shop_id

def definition_labels(root):
    labels=[]
    for dl in root.all('dl'):
        active=False
        for node in dl.children:
            if not isinstance(node,Element):continue
            if node.tag=='dt':active=bool(re.fullmatch('取扱[い]?商品',node.text()))
            elif node.tag=='dd' and active:labels.append(node.text())
    return labels

def parse_more(kind,html):
    root=Tree(html).root
    if kind=='surugaya':return definition_labels(root)
    if kind=='melonbooks':
        return [cell.text() for row in root.all('tr') if any(h.text()=='取扱カテゴリ' for h in row.all('th')) for cell in row.all('td')]
    if kind=='animate':
        # 説明内の作品名を商品種類と誤認しないよう、売場の見出しに限定する。
        return [re.sub(r'ゲーム作品|ゲーム系書籍','',node.text()).replace('オーディオ・ビジュアル','CD・DVD') for node in root.all(cls='shopFloorCardTitle')]
    if kind=='mandarake':
        descriptions=[node.attrs.get('content','') for node in root.all('meta') if node.attrs.get('name')=='description']
        return [s for s in descriptions if '取扱' in s or '取り扱' in s]
    return []

def update_more_assortments(result):
    from update_assortments import fetch,normalize,classify_labels
    registry=json.loads(Path('scripts/shop_id_registry.json').read_text(encoding='utf-8'))
    jobs=[]
    # 一覧の店舗名と詳細URLを厳密照合し、系列共通の通販ナビを根拠にしない。
    for kind,index in [('surugaya','https://www.suruga-ya.jp/feature/shoplist/index.html'),('surugaya','https://www.suruga-ya.jp/feature/shoplist-friendly/index.html')]:
        try:
            html,_=fetch(index)
            # 一覧サイドバーだけに依存すると新店舗の詳細ページを取りこぼすため、地域一覧も確認する。
            paths=sorted(set(re.findall(r'/feature/shoplist(?:-friendly)?/[a-z0-9_-]+\.html',html)))
            paths=[path for path in paths if not path.endswith(('index.html','taiwan.html'))]
            def get_region(path):
                try:return fetch(urljoin(index,path))[0]
                except Exception:return ''
            with ThreadPoolExecutor(max_workers=4) as regions:
                html += ''.join(regions.map(get_region,paths))
            root=Tree(html).root
            links=[(normalize(a.text().replace('駿河屋','')),urljoin(index,a.attrs['href'])) for a in root.all('a') if re.search(r'/feature/(?:realstore/)?[^/]+/(?:index\.html)?$',a.attrs.get('href',''))]
            for item in json.loads(Path('scripts/official_surugaya'+('_friendly' if 'friendly' in index else '')+'.json').read_text(encoding='utf-8')):
                key=normalize(item['name'].replace('駿河屋',''))
                matches=[url for label,url in links if key==label and label]
                if matches:jobs.append((stable_shop_id('surugaya',item,registry),kind,matches[0]))
        except Exception as error:print('[WARN] assortment index',index,str(error),flush=True)
    elements=json.loads(Path('scripts/osm_supplement.json').read_text(encoding='utf-8'))['elements']
    domains={'www.animate.co.jp':'animate','www.melonbooks.co.jp':'melonbooks','www.mandarake.co.jp':'mandarake'}
    for el in elements:
        tags=el.get('tags',{});url=tags.get('website') or tags.get('contact:website') or ''
        parsed=urlparse(url);kind=domains.get(parsed.netloc)
        if not kind:continue
        if kind=='animate' and re.fullmatch('/shop/[a-zA-Z0-9_-]+/?',parsed.path):url=url.rstrip('/')+'/floor/'
        elif kind=='melonbooks' and '/shop/shop.php' in parsed.path:pass
        elif kind=='mandarake' and re.match('/dir/[^/]+/',parsed.path):pass
        else:continue
        jobs.append((f"osm_{el.get('type','n')[0]}_{el['id']}",kind,url))
    def execute(job):
        sid,kind,url=job;html,checked=fetch(url);labels=parse_more(kind,html)
        if not labels:raise ValueError('no store-specific assortment')
        cats,subs=classify_labels(labels)
        if not cats:raise ValueError('no supported assortment categories')
        return sid,dict(categories=cats,subCategories=subs,status='partial' if kind in ('animate','mandarake') else 'confirmed',sources=[dict(url=url,checkedAt=checked,labels=labels)])
    failures=0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(execute,job) for job in jobs]
        for future in as_completed(futures):
            try:sid,entry=future.result();result[sid]=entry
            except Exception:failures+=1
    print(f'Additional assortments: {len(jobs)-failures}/{len(jobs)} official pages confirmed',flush=True)
