"""参照元のロゴ原本を保存し、看板用SVGを再生成する手動更新用ツール。"""
import hashlib,json,re,urllib.request
from pathlib import Path
from datetime import datetime, timezone, timedelta
from urllib.parse import urljoin,urlparse
from update_assortments import fetch
from html_tools import Tree
from pipeline_support import atomic_json_write
from build_brand_displays import build_displays

def main():
    manifest=json.loads(Path('public/brands/sources.json').read_text(encoding='utf-8')) if Path('public/brands/sources.json').exists() else {}
    assets = {
        'iosys': ('イオシス','https://iosys.co.jp/common_img/logo-pc.svg'),
        'janpara': ('じゃんぱら','https://www.janpara.co.jp/common/images/logo/logo01.png'),
        'pc_koubou': ('パソコン工房','https://www.pc-koubou.jp/user_data/packages/default/_asset/img/common/logo.svg'),
        'inverse': ('ショップインバース','https://www.shop-inverse.com/imgs/common/logo_footer.png'),
        'geo_mobile': ('ゲオモバイル','https://geo-mobile.jp/common/e621f500000000am-img/hed_logo.png'),
        'geo': ('ゲオ','https://2nd-rtl.com/wp-content/themes/2ndRETAILING/assets/img/sp/top/group_logo02.png'),
        'bookoff': ('BOOKOFF','https://www.bookoff.co.jp/buy/images/love-used-unit-img01.gif'),
        'bookoff_plus': ('BOOKOFF PLUS','https://www.bookoff.co.jp/buy/images/love-used-unit-img02.gif'),
        'bookoff_sb': ('BOOKOFF SUPER BAZAAR','https://www.bookoff.co.jp/buy/images/love-used-unit-img03.gif'),
        'furuichi': ('古本市場','https://www.furu1.net/assets/img/shop/furuhonitiba.png'),
        'furuiti': ('ふるいち','https://www.furu1.net/assets/img/shop/furuiti.png'),
        'torekapark': ('トレカパーク','https://www.furu1.net/assets/img/shop/torekapark.png'),
        'otakarasouko': ('お宝創庫','https://www.otakarasouko.com/otawp/wp-content/themes/otakara/img/common/logo.svg'),
        'preyz': ('プレイズ','https://www.otakarasouko.com/otawp/wp-content/themes/otakara/img/common/flogo_02.svg'),
        'ecotool': ('エコツール','https://www.ecotool.jp/new/wp-content/themes/ectool/img/logo.svg'),
        'ojamakan': ('おじゃま館','https://www.otakarasouko.com/otawp/wp-content/themes/otakara/img/common/flogo_05.svg'),
        'medio': ('メディオ！','https://www.otakarasouko.com/otawp/wp-content/themes/otakara/img/common/flogo_06.svg'),
        'lashinbang': ('らしんばん','https://www.lashinbang.com/wp-content/themes/lashinbang/img/header_logo.png'),
        'surugaya': ('駿河屋','https://www.suruga-ya.jp/pics_webp/common/pc/logo-surugaya.svg.webp'),
        'mandarake': ('まんだらけ','https://www.mandarake.co.jp/img/global/logo.png'),
        'melonbooks': ('メロンブックス','https://www.melonbooks.co.jp/user_data/packages/responsive/img/logo.png'),
        'animate': ('アニメイト','https://www.animate.co.jp/assets/img/svg/logo.svg'),
        'mandai': ('万代','https://shop.mandai-s.jp/images/logo.svg'),
    }
    brands={'hard_off':('hardoff','ハードオフ'),'off_house':('offhouse','オフハウス'),'hobby_off':('hobbyoff','ホビーオフ'),'mode_off':('modeoff','モードオフ'),'garage_off':('garageoff','ガレージオフ'),'liquor_off':('liquoroff','リカーオフ')}
    stores=json.loads(Path('scripts/official_hardoff.json').read_text(encoding='utf-8'))
    for kind,(brand,name) in brands.items():
        if manifest.get(brand, {}).get('pinned'):
            assets[brand]=(name, manifest[brand]['url'])
            continue
        store=next(s for s in stores if s['logo_type']==kind)
        html,_=fetch('https://www.hardoff.co.jp/shop/detail/?p='+store['id'][3:])
        scopes=Tree(html).root.all(cls='detail_line_logo')
        assets[brand]=(name,urljoin('https://www.hardoff.co.jp/',scopes[0].all('img')[0].attrs['src']))
    out=Path('public/brands');out.mkdir(exist_ok=True)
    downloaded={}
    for brand,(name,url) in assets.items():
        try:
            previous=manifest.get(brand, {})
            if previous.get('pinned'): url=previous['url']
            if url not in downloaded:
                with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as response:
                    downloaded[url]=(response.read(), response.headers.get_content_type())
            data,content_type=downloaded[url]
            if not content_type.startswith('image/') or len(data)<40: raise ValueError(content_type)
            ext='.svg' if content_type == 'image/svg+xml' or b'<svg' in data[:2000] else Path(urlparse(url).path).suffix
            file=previous['file'] if previous.get('pinned') else brand+ext
            (out/file).write_bytes(data)
            manifest[brand]=dict(previous,name=name,file=file,url=url,checkedAt=datetime.now(timezone(timedelta(hours=9))).date().isoformat(),sha256=hashlib.sha256(data).hexdigest())
            print('LOGO',brand,len(data))
        except Exception as error: print('LOGO FAILED',brand,str(error))
    atomic_json_write('public/brands/sources.json',manifest)
    build_displays()
    from build_pc_brand_displays import build_pc_displays
    build_pc_displays()

if __name__=='__main__':main()
