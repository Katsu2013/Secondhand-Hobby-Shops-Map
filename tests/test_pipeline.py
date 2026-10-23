"""公開前のDB検証、安定ID、クリーン環境でのDB再生成を通信なしで検証する。"""
import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from pipeline_support import identity_key, stable_shop_id, validate_database


class PipelineTests(unittest.TestCase):
    def test_ids_do_not_depend_on_order_and_preserve_existing_ids(self):
        shop = {"name": "店舗 A", "address": "東京都千代田区1-1"}
        registry = {"version": 1, "entries": {identity_key("surugaya", shop): "surugaya_off_2"}}
        self.assertEqual(stable_shop_id("surugaya", shop, registry), "surugaya_off_2")
        other = {"name": "店舗 B", "address": "東京都千代田区2-1"}
        before = {s["name"]: stable_shop_id("surugaya", s, registry) for s in (shop, other)}
        after = {s["name"]: stable_shop_id("surugaya", s, registry) for s in (other, shop)}
        self.assertEqual(before, after)

    def test_database_rejects_duplicate_ids_invalid_coordinates_and_large_loss(self):
        with open(ROOT / "data/shops.json", encoding="utf-8") as handle:
            shops = json.load(handle)
        validate_database(shops)
        with self.assertRaises(ValueError):
            validate_database([shops[0], shops[0]])
        invalid = copy.deepcopy(shops[0])
        invalid["lat"] = float("nan")
        with self.assertRaises(ValueError):
            validate_database([invalid])
        with self.assertRaises(ValueError):
            validate_database([shops[0]], 2514)

    def test_atomic_replace_retries_temporary_windows_sharing_lock(self):
        import pipeline_support
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'data.json'
            target.write_text('[]', encoding='utf-8')
            original = pipeline_support.os.replace
            calls = []
            def locked_once(source, destination):
                calls.append(destination)
                if len(calls) == 1:
                    error = PermissionError('temporary sharing lock')
                    error.winerror = 32
                    raise error
                return original(source, destination)
            with patch('pipeline_support.os.replace', side_effect=locked_once), patch('pipeline_support.time.sleep'):
                pipeline_support.atomic_json_write(target, [{'id': 'a'}])
            self.assertEqual(json.loads(target.read_text(encoding='utf-8')), [{'id': 'a'}])
            self.assertEqual(len(calls), 2)
            self.assertFalse(Path(str(target) + '.tmp').exists())

    def test_clean_checkout_build_uses_only_tracked_snapshots(self):
        import geocode_and_build as builder
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            (work / "scripts").mkdir()
            (work / "data").mkdir()
            inputs = list((ROOT / "scripts").glob("official_*.json")) + [ROOT / "scripts/gsi_geocode_cache.json",
                ROOT / "scripts/assortment_evidence.json", ROOT / "scripts/shop_id_registry.json", ROOT / "scripts/osm_supplement.json", ROOT / "scripts/furuichi.html"]
            for source in inputs:
                (work / "scripts" / source.name).write_bytes(source.read_bytes())
            (work / "data/shops.json").write_bytes((ROOT / "data/shops.json").read_bytes())
            previous = Path.cwd()
            try:
                os.chdir(work)
                with patch.dict(os.environ, {"REUSE_MAP_OFFLINE": "1"}), patch("urllib.request.urlopen", side_effect=AssertionError("外部通信禁止")):
                    builder.build_master_database()
                self.assertEqual((work / "data/shops.json").read_bytes(), (work / "public/data/shops.json").read_bytes())
                with open(work / "data/shops.json", encoding="utf-8") as handle:
                    rebuilt = json.load(handle)
                    validate_database(rebuilt)
                with open(ROOT / "data/shops.json", encoding="utf-8") as handle:
                    original = json.load(handle)
                self.assertEqual({shop["id"] for shop in original}, {shop["id"] for shop in rebuilt})
            finally:
                os.chdir(previous)

    def test_bookoff_stores_have_hours_and_merge_preserves_hours(self):
        """ブックオフ各店舗および併設・複合店で営業時間が空文字にならず保持されていることを検証する。"""
        import re
        with open(ROOT / "data/shops.json", encoding="utf-8") as handle:
            shops = json.load(handle)
        bo_shops = [s for s in shops if "bookoff" in s.get("chains", []) or s.get("chain") == "bookoff"]
        self.assertGreater(len(bo_shops), 500)
        missing_hours = [s for s in bo_shops if not s.get("hours")]
        self.assertEqual(missing_hours, [], f"営業時間が未取得のブックオフ店舗が存在します: {missing_hours}")
        for shop in bo_shops:
            self.assertTrue(re.search(r"\d{1,2}:\d{2}", shop["hours"]), f"不正な営業時間表記: {shop['id']} {shop['name']} {shop['hours']}")


if __name__ == "__main__":
    unittest.main()
