"""販売/買取・大分類/詳細分類を取り違えないことを確認する。"""
import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from update_assortments import parse_labels,classify_labels,parse_geo_index
from assortment_support import apply_assortment

class AssortmentTests(unittest.TestCase):
    def test_mobile_does_not_imply_games_and_pc_is_store_specific(self):
        html='<ul class="viewServiceList"><li>中古・新品携帯電話販売</li><li>携帯電話買取</li><li>携帯アクセサリー</li></ul>'
        cats,subs=classify_labels(parse_labels('geo',html))
        self.assertEqual(subs,['sub_smartphone']);self.assertEqual(cats,['pc_junk'])
        _,subs=classify_labels(parse_labels('geo',html.replace('</ul>','<li>中古パソコン</li></ul>')))
        self.assertEqual(subs,['sub_pc_junk','sub_smartphone'])

    def test_bookoff_uses_retail_tab_and_ignores_disabled_products_and_group_title(self):
        html='''<div id="tab-sell"><div class="tab-box"><h3>工具</h3></div></div>
        <div id="tab-buy"><div class="tab-box p02"><h3>音楽・映像・ゲーム</h3><p>CD、DVD<span class="no-handling">ゲームソフト、ゲーム機本体</span></p></div>
        <div class="tab-box no-handling"><h3>スマートフォン</h3><p>カメラ</p></div></div>'''
        cats,subs=classify_labels(parse_labels('bookoff',html))
        self.assertEqual(subs,['sub_cd_dvd']);self.assertNotIn('retro_game',cats)

    def test_furuichi_ignores_buyback_and_rental_only_columns(self):
        html='''<table class="shop-detail__product__table"><tr><th>スマホ・タブレット</th><td><span class="line"></span></td><td><span class="line"></span></td><td><span class="circle"></span></td><td><span class="circle"></span></td></tr>
        <tr><th>ゲーム</th><td><span class="circle"></span></td><td></td><td></td></tr></table>'''
        cats,subs=classify_labels(parse_labels('furuichi',html))
        self.assertEqual(cats,['retro_game']);self.assertEqual(subs,[])

    def test_otakarasouko_excludes_buyback_only_goods(self):
        html='''<section class="shop-commodity"><div class="nav-sell"><h3>販売・買取</h3><ul><li>フィギュア</li></ul></div>
        <div class="nav-sell"><h3>買取のみ</h3><ul><li>スマートフォン</li><li>お酒</li></ul></div></section>'''
        _,subs=classify_labels(parse_labels('otakarasouko',html))
        self.assertEqual(subs,['sub_figure'])

    def test_liquor_store_wine_and_sake_remain_searchable(self):
        cats, subs = classify_labels(['ワイン', 'シャンパン', '日本酒', '焼酎'])
        self.assertEqual(subs, ['sub_liquor'])
        self.assertEqual(cats, ['apparel_life'])

    def test_unknown_and_partial_are_not_inferred_from_brand(self):
        shop={'sourceIds':['a','b'],'categories':['tcg'],'subCategories':['sub_tcg_card']}
        evidence={'a':dict(categories=['pc_junk'],subCategories=['sub_smartphone'],status='confirmed',sources=[dict(url='https://example.com/a',checkedAt='2026-10-18',labels=['携帯電話販売'])])}
        apply_assortment(shop,evidence,{'a':{'name':'モバイル店','chain':'general_game'}})
        self.assertEqual(shop['subCategories'],['sub_smartphone']);self.assertEqual(shop['assortmentStatus'],'partial')
        self.assertEqual(shop['assortmentSources'][0]['name'],'モバイル店')
        apply_assortment(shop,{},{});self.assertEqual(shop['categories'],[]);self.assertEqual(shop['assortmentStatus'],'unverified')

    def test_changed_page_is_not_a_successful_empty_result(self):
        with self.assertRaises(ValueError):parse_labels('hardoff','<h1>メンテナンス</h1>')

    def test_current_geo_index_keeps_official_store_number(self):
        html='''<div class="areaBox clr"><h4 class="areaName">ゲオモバイルA店</h4><table><tr><th>住所</th><td>〒123-4567 東京都A区1-2</td></tr><tr><th>営業時間</th><td>10:00～20:00</td></tr></table><a href="/store/00418.html">詳細</a></div>'''
        shops=parse_geo_index(html);self.assertEqual(shops[0]['id'],'geo_off_00418');self.assertEqual(shops[0]['address'],'東京都A区1-2')

if __name__=='__main__':unittest.main()
