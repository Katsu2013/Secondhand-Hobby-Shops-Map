"""公式の販売情報の範囲と、新規PC専門店の公開DBへの反映を検証する。"""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from update_pc_shops import parse_index, janpara_sales, parse_detail, classify_pc_labels, JANPARA_ICONS


class PcShopsTests(unittest.TestCase):
    def test_buyback_centers_and_closed_inverse_pages_are_not_retail(self):
        links = parse_index('iosys', '<a href="/shop/shop.html">中央店 販売 買取</a>'
            '<a href="/shop/buy.html">買取センター 買取</a>')
        self.assertEqual(list(links.values()), ['中央店'])
        links = parse_index('inverse', '<a href="/shop/akihabara.html">秋葉原1号店</a>'
            '<a href="/shop/close.html">閉店店舗</a><a href="/shop/twitter.html">SNS</a>')
        self.assertEqual(len(links), 1)

    def test_janpara_uses_sale_columns_and_never_buyback_columns(self):
        header = '<tr><th></th>' + ''.join(f'<th><img src="clsicon120_{icon}.png"></th>' for icon in JANPARA_ICONS) + '</tr>'
        sale = '<tr><th>秋葉原本店</th>' + '<td>○</td>' * 3 + '<td>-</td>' * 7 + '</tr>'
        buy = '<tr><th>秋葉原本店</th>' + '<td>○</td>' * 10 + '</tr>'
        result = janpara_sales('<h5>販売</h5><table>' + header + sale + '</table><h5>買取</h5><table>' + header + buy + '</table>')
        self.assertEqual(result['秋葉原本店'], ['スマホ', 'タブレット', 'ウェアラブル'])
        self.assertEqual(classify_pc_labels(result['秋葉原本店']), (['pc_junk'], ['sub_smartphone']))
        with self.assertRaises(ValueError): janpara_sales('<h5>販売</h5><table><tr><th>新しい構造</th></tr></table>')

    def test_mobile_peripherals_do_not_imply_pc_or_junk(self):
        self.assertEqual(classify_pc_labels(['中古スマホ・iPhone', 'スマホ・タブレット周辺機器']), (['pc_junk'], ['sub_smartphone']))
        self.assertEqual(classify_pc_labels(['スマホ ジャンク']), (['pc_junk'], ['sub_smartphone']))
        self.assertEqual(classify_pc_labels(['ノートPC', 'Mac', 'PCパーツ']), (['pc_junk'], ['sub_pc_junk']))

    def test_inverse_scopes_items_to_branch_access_section(self):
        html = '<div><h2>共通保証</h2>スマホ カメラ</div><div id="access"><table>'
        html += '<tr><th>住所</th><td>〒101-0021 東京都千代田区外神田3-4-10</td></tr>'
        html += '<tr><th>営業時間</th><td>11:00～19:00</td></tr>'
        html += '<tr><th>お取り扱い商品</th><td><ul><li>ジャンクノートパソコン</li></ul></td></tr></table></div>'
        row = parse_detail('inverse', html, '秋葉原1号店', 'https://www.shop-inverse.com/shop/akihabara.html')
        self.assertEqual(row['labels'], ['ジャンクノートパソコン'])
        self.assertEqual(row['id'], 'inverse_akihabara')

    def test_iosys_and_koubou_ignore_common_navigation_and_buyback(self):
        address = '<dl><dt>住所</dt><dd>東京都千代田区外神田3-14-9</dd><dt>営業時間</dt><dd>11:00～20:00</dd></dl>'
        iosys = '<nav>パソコン カメラ</nav>' + address
        iosys += '<div><h3>販売<span>ジャンル一覧</span></h3><div><ul><li>スマホ</li></ul></div></div>'
        iosys += '<div><h3>買取<span>ジャンル一覧</span></h3><div><ul><li>パソコン</li></ul></div></div>'
        row = parse_detail('iosys', iosys, '中央店', 'https://iosys.co.jp/shop/central.html')
        self.assertEqual(row['labels'], ['スマホ'])
        koubou = '<nav>カメラ オーディオ</nav><h1 id="products--anchor">パソコン工房 本店の中古パソコン</h1>'
        koubou += '<div class="used-shop-area-left">パソコン工房 本店では中古パソコンを多数ご用意しております。全国で専門店を運営。当店舗では、中古iPhoneを取り扱っております。</div>'
        row = parse_detail('pc_koubou', koubou, '本店', 'https://www.pc-koubou.jp/pc/used_shop_main.php', location_html=address)
        self.assertEqual(classify_pc_labels(row['labels']), (['pc_junk'], ['sub_pc_junk', 'sub_smartphone']))

    def test_public_database_contains_every_new_official_retail_store(self):
        shops = json.loads((ROOT / 'data/shops.json').read_text(encoding='utf-8'))
        for kind in ['iosys', 'janpara', 'pc_koubou', 'inverse']:
            snapshot = json.loads((ROOT / f'scripts/official_{kind}.json').read_text(encoding='utf-8'))
            published = [shop for shop in shops if shop['chain'] == kind]
            self.assertEqual({shop['id'] for shop in published}, {shop['id'] for shop in snapshot})
            for shop in published:
                self.assertEqual(shop['assortmentStatus'], 'confirmed')
                self.assertTrue(shop['assortmentSources'])
                self.assertTrue(24 < shop['lat'] < 46 and 122 < shop['lng'] < 147)
        mobile = next(shop for shop in shops if shop['id'] == 'inverse_nipponbasi2')
        self.assertEqual(mobile['subCategories'], ['sub_smartphone'])
        janpara = next(shop for shop in shops if shop['id'] == 'janpara_60')
        self.assertEqual(janpara['subCategories'], ['sub_audio', 'sub_smartphone'])


if __name__ == '__main__': unittest.main()
