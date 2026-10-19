"""通常ゲオの全体販売情報とモバイル部門・レンタルを混同しない回帰検証。"""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from geo_assortments import parse_geo_online_sales, classify_geo_sales, refresh_geo_assortment

# 公式の表示済み見出し・項目に基づく意味構造のfixture。復旧後の実DOM確認は別途必要。
SALES = '''<nav><li>DVD</li><li>スマートフォン</li></nav><h1>ゲオ試験店</h1>
<h2>お取扱い品目</h2><h3>レンタル</h3><ul><li>DVD/ブルーレイ</li><li>本※コミックのみ</li></ul>
<h3>新品販売</h3><ul><li>ゲーム</li><li>携帯電話 ※格安SIM即日開通のみ</li><li>家電 ※AV機器・アクセサリのみ</li><li>トレカ</li><li class="off">プラモデル</li></ul>
<h3>中古販売</h3><ul><li>ゲーム</li><li>携帯電話</li><li>パソコン</li></ul>
<h3>買取</h3><ul><li>本</li><li>衣料</li><li>DVD/ブルーレイ</li></ul>
<h2>近隣店舗</h2><h3>新品販売</h3><ul><li>フィギュア</li></ul>'''
MOBILE = '<h1>ゲオ試験店 GEO ONLINE</h1><ul class="viewServiceList"><li>中古・新品携帯電話販売</li><li>中古パソコン</li><li>携帯電話買取</li></ul>'


class GeoAssortmentTests(unittest.TestCase):
    def test_only_store_sales_not_rental_buyback_navigation_or_neighbors(self):
        records = parse_geo_online_sales(SALES, 'ゲオ試験店')
        cats, subs = classify_geo_sales(records)
        self.assertEqual(cats, ['pc_junk', 'retro_game', 'tcg'])
        self.assertEqual(subs, ['sub_pc_junk', 'sub_smartphone', 'sub_tcg_card'])
        self.assertNotIn('sub_cd_dvd', subs)
        self.assertNotIn('sub_modern_game', subs)  # 「ゲーム」だけで機種を断定しない。

    def test_qualifiers_do_not_imply_handsets_or_household_appliances(self):
        cats, subs = classify_geo_sales([('新品販売', '携帯電話 ※格安SIM即日開通のみ'), ('新品販売', '家電 ※AV機器・アクセサリのみ')])
        self.assertEqual(cats, ['pc_junk'])
        self.assertEqual(subs, [])

    def test_identity_and_section_changes_fail_closed(self):
        for html in [SALES.replace('ゲオ試験店', 'ゲオ別店舗'), SALES.replace('中古販売', '中古品'), '<h1>メンテナンス</h1>']:
            with self.assertRaises(ValueError):
                parse_geo_online_sales(html, 'ゲオ試験店')

    def test_full_sales_preferred_without_mobile_merge(self):
        calls = []
        def fetch(url):
            calls.append(url)
            return SALES, '2026-10-19'
        entry = refresh_geo_assortment(dict(id='geo_off_1', name='ゲオ試験店'), fetch)
        self.assertEqual(calls, ['https://geo-online.co.jp/store/00001/'])
        self.assertEqual(entry['status'], 'confirmed')
        self.assertIn('retro_game', entry['categories'])

    def test_outage_preserves_full_evidence_and_check_date(self):
        previous = dict(status='confirmed', categories=['retro_game'], subCategories=[], sources=[dict(url='https://geo-online.co.jp/store/00001/', checkedAt='2026-10-01')])
        def unavailable(url):
            raise ValueError('maintenance')
        self.assertIs(refresh_geo_assortment(dict(id='geo_off_1', name='ゲオ試験店'), unavailable, previous), previous)

    def test_department_fallback_is_partial_and_mobile_store_is_separate(self):
        calls = []
        def fetch(url):
            calls.append(url)
            return MOBILE, '2026-10-19'
        entry = refresh_geo_assortment(dict(id='geo_off_1', name='ゲオ試験店'), fetch, online_available=False)
        self.assertEqual(entry['status'], 'partial')
        self.assertEqual(entry['categories'], ['pc_junk'])
        self.assertEqual(calls, ['https://geo-mobile.jp/store/00001.html'])
        entry = refresh_geo_assortment(dict(id='geo_off_2', name='ゲオモバイル試験店'), lambda url: (MOBILE.replace('ゲオ試験店', 'ゲオモバイル試験店'), '2026-10-19'))
        self.assertEqual(entry['status'], 'confirmed')


if __name__ == '__main__':
    unittest.main()
