"""原本を残したまま、看板用のSVG表示範囲・反転配色を再生成する。"""
import hashlib
import json
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

from pipeline_support import atomic_json_write

# 手動生成だけで使う依存。通常のフロントエンド・データ更新には不要。
TOOL_DIR = Path(__file__).resolve().parent / 'research-cache' / 'brand-tools'
if TOOL_DIR.exists():
    sys.path.insert(0, str(TOOL_DIR))
import vtracer
from PIL import Image

ASSET_DIR = Path(__file__).resolve().parents[1] / 'public' / 'brands'
SVG_NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG_NS)


def rgba_pixels(image):
    """Pillowの旧版・新版の双方から同じRGBA画素列を得る。"""
    return list(image.get_flattened_data()) if hasattr(image, 'get_flattened_data') else list(image.getdata())


def build_displays():
    """原本のパス形状と画素を保持し、UIで指定された表示用SVGだけを書き出す。"""
    manifest = json.loads((ASSET_DIR / 'sources.json').read_text(encoding='utf-8'))

    def save(brand, data, description):
        """加工内容と表示用ハッシュを原本の出典とは分けて記録する。"""
        file = brand + '-display.svg'
        encoded = data.encode('utf-8')
        (ASSET_DIR / file).write_bytes(encoded)
        manifest[brand].update(displayFile=file, displaySha256=hashlib.sha256(encoded).hexdigest(), displayTransform=description)

    # JPは独立パス。日本語3文字の形状を残し、背景に合わせて白抜きにする。
    root = ET.fromstring((ASSET_DIR / 'surugaya.svg').read_text(encoding='utf-8'))
    group = root.find(f'{{{SVG_NS}}}g')
    if group is None or len(group) != 4 or not group[1].get('d', '').startswith('M427.1,74.6'):
        raise ValueError('駿河屋の原本構造が変わりました。JPの位置を再確認してください。')
    group.remove(group[1])
    root.set('viewBox', '0 0 354 132')
    root.find(f'{{{SVG_NS}}}style').text = '.st0{fill:#ffffff;}'
    save('surugaya', ET.tostring(root, encoding='unicode'), '独立したJPパスを除去。日本語3文字を白抜きで表示。')

    # マスコットと独立している正式な文字パスを使用。黄色のi全体も維持する。
    root = ET.fromstring((ASSET_DIR / 'animate.svg').read_text(encoding='utf-8'))
    root.set('viewBox', '63 0 194 51')
    for style in root.iter(f'{{{SVG_NS}}}style'):
        style.text = style.text.replace('#385eaa', '#ffffff').replace('#f9be00', '#fcc900')
    outer = root.find(f'{{{SVG_NS}}}g')
    container = outer.find(f'{{{SVG_NS}}}g')
    for mascot in list(container)[1:]:
        container.remove(mascot)
    save('animate', ET.tostring(root, encoding='unicode'), '正式な文字パスを白に、iを#fcc900に。独立したマスコットを除外。')

    def trace_ink(brand, crop, color, predicate, source_file=None):
        """原本から文字の輪郭を取り、埋込画像を含まない曲線パスに変換する。"""
        original = Image.open(ASSET_DIR / (source_file or manifest[brand]['file'])).convert('RGBA')
        image = original.crop(crop)
        pixels = [(0, 0, 0, 255) if predicate(*p) else (255, 255, 255, 255) for p in rgba_pixels(image)]
        svg = vtracer.convert_pixels_to_svg(pixels, image.size, colormode='binary', mode='spline', filter_speckle=1, corner_threshold=60, length_threshold=3.5, splice_threshold=45, path_precision=3)
        traced = ET.fromstring(svg)
        traced.set('viewBox', f'0 0 {image.width} {image.height}')
        traced.attrib.pop('width', None)
        traced.attrib.pop('height', None)
        for path in traced.iter(f'{{{SVG_NS}}}path'):
            path.set('fill', color)
        save(brand, ET.tostring(traced, encoding='unicode'), f'参照原本の印字範囲{crop}を曲線パス化。文字色{color}。ラスター埋込なし。')

    # 指定された看板パネル・SB・PLUSと同じ輪郭を使い、JPEGノイズや画素の階段を除く。
    palette = {
        'hardoff': ((0, 64, 152), '#fff000'), 'offhouse': ((0, 116, 64), '#ffffff'),
        'hobbyoff': ((229, 0, 18), '#fff100'), 'modeoff': ((229, 0, 18), '#ffffff'),
        'liquoroff': ((167, 38, 66), '#ffffff'), 'garageoff': ((0, 64, 152), '#fff000'),
        'bookoff': ((255, 240, 0), '#003894'), 'bookoff_sb': ((239, 122, 0), '#043459'),
        'bookoff_plus': ((238, 122, 0), '#043459'),
    }
    for brand, (background, ink) in palette.items():
        x, y, w, h = manifest[brand]['viewport']
        trace_ink(brand, (x, y, x + w, y + h), ink, lambda r, g, b, a, bg=background: a > 127 and sum((c - base) ** 2 for c, base in zip((r, g, b), bg)) > 24000)
    trace_ink('melonbooks', (0, 0, 268, 84), '#18bd67', lambda r, g, b, a: a > 127)
    trace_ink('lashinbang', (0, 16, 264, 93), '#ffffff', lambda r, g, b, a: a > 127 and r < 80 and g > 130 and b > 180)
    trace_ink('furuichi', (1, 17, 185, 67), '#e50024', lambda r, g, b, a: a > 127 and r > 150 and g < 100 and b < 130)

    # 多色の公式画像も輪郭をパス化する。高精細の原本を残すので再調整できる。
    for brand in ['mandarake', 'geo_mobile', 'furuiti', 'torekapark']:
        image = Image.open(ASSET_DIR / manifest[brand]['file']).convert('RGBA')
        svg = vtracer.convert_pixels_to_svg(rgba_pixels(image), image.size, colormode='color', hierarchical='stacked', mode='spline', filter_speckle=2, color_precision=5, layer_difference=32, corner_threshold=60, length_threshold=3.5, splice_threshold=45, path_precision=3)
        traced = ET.fromstring(svg)
        traced.set('viewBox', f'0 0 {image.width} {image.height}')
        traced.attrib.pop('width', None)
        traced.attrib.pop('height', None)
        if brand == 'mandarake':
            # 量子化で生じた近似色を指定された赤・黒へ揃える。
            for path in traced.iter(f'{{{SVG_NS}}}path'):
                fill = path.get('fill', '')
                if len(fill) == 7 and fill.startswith('#'):
                    r, g, b = (int(fill[i:i + 2], 16) for i in (1, 3, 5))
                    if r > 150 and g < 80 and b < 80:
                        path.set('fill', '#fe0000')
                    elif max(r, g, b) < 100:
                        path.set('fill', '#000000')
        save(brand, ET.tostring(traced, encoding='unicode'), '公式原本の多色輪郭を曲線パス化。ラスター埋込なし。')

    # 系列共通の正式な幾何学マークを高解像度の公式モバイル原本から取得。
    # 手描きの折れ線では中央の接続や角度が変わるため、同一の輪郭を使う。
    trace_ink('geo', (0, 0, 180, 69), '#192a59', lambda r, g, b, a: a > 127 and r < 190 and g > 100 and b < 100, manifest['geo_mobile']['file'])
    manifest['geo']['displayTransform'] = '通常GEOの原本と形状を照合し、系列共通の公式GEOマークをモバイル原本から曲線パス化。マークと文字#192a59、背景#fed600。'
    manifest['geo']['displaySource'] = {key: manifest['geo_mobile'][key] for key in ['file', 'url', 'sha256']}
    for key in ['viewport', 'sourceWidth', 'sourceHeight']:
        manifest['geo'].pop(key, None)

    atomic_json_write(ASSET_DIR / 'sources.json', manifest)


if __name__ == '__main__':
    build_displays()
