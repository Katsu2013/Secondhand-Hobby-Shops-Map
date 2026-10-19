"""PC専門店の公式ロゴを同一看板枠用のSVGに整える。原本形状・縦横比を保つ。"""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from build_brand_displays import ASSET_DIR, SVG_NS, rgba_pixels
from pipeline_support import atomic_json_write
from PIL import Image
import vtracer

# 添付された看板の代表色。写真の全余白を表示せず、配色だけを公式の輪郭へ適用する。
PC_REFERENCE_BLUE = '#1d78be'
INVERSE_BACKGROUND = '#0080cb'


def build_pc_displays():
    """公式SVGは表示範囲を分け、PNGは透明余白を詰めた輪郭パスへ変換する。"""
    manifest = json.loads((ASSET_DIR / 'sources.json').read_text(encoding='utf-8'))
    for brand, viewbox in [('iosys', '0 0 460 136.4'), ('pc_koubou', '0 0 153 24'), ('goodwill', '169 0 88.24 24')]:
        source = 'pc_koubou' if brand == 'goodwill' else brand
        root = ET.fromstring((ASSET_DIR / manifest[source]['file']).read_text(encoding='utf-8'))
        root.set('viewBox', viewbox)
        root.attrib.pop('width', None); root.attrib.pop('height', None)
        if brand == 'iosys':
            # 独立した「けっこう安い。」を除外し、マークと店名の既存パスを保持する。
            for node in list(root):
                if node.tag == f'{{{SVG_NS}}}path' and node.get('class') in [None, 'st5']: root.remove(node)
        else:
            # 原本は白抜き版。工房は青文字、GoodWillは青カプセル＋白い抜き文字へ反転する。
            for style in root.iter(f'{{{SVG_NS}}}style'):
                style.text = style.text.replace('fill:#fff;', f'fill:{PC_REFERENCE_BLUE};')
        manifest[brand] = dict(manifest[source], name='グッドウィル' if brand == 'goodwill' else manifest[source]['name'])
        description = ('公式SVGのパス・配色を保持。' if brand == 'iosys' else
                       f'公式SVGの輪郭を保持し、添付参照画像の代表色{PC_REFERENCE_BLUE}へ変更。白背景。')
        save(brand, ET.tostring(root, encoding='unicode'), manifest, description + '表示範囲: ' + viewbox)
    for brand, color in [('janpara', '#0b308e')]:
        original = Image.open(ASSET_DIR / manifest[brand]['file']).convert('RGBA')
        # 透明または白い外周だけを除く。文字・マーク内の空間は残す。
        mask = Image.new('L', original.size)
        mask.putdata([255 if a > 100 and min(r, g, b) < 180 else 0 for r, g, b, a in rgba_pixels(original)])
        box = mask.getbbox()
        if box is None: raise ValueError('公式ロゴの印字範囲がありません: ' + brand)
        image = original.crop(box)
        pixels = [(0, 0, 0, 255) if a > 100 and min(r, g, b) < 180 else (255, 255, 255, 255)
                  for r, g, b, a in rgba_pixels(image)]
        svg = vtracer.convert_pixels_to_svg(pixels, image.size, colormode='binary', mode='spline',
            filter_speckle=1, corner_threshold=60, length_threshold=3.5, splice_threshold=45, path_precision=3)
        root = ET.fromstring(svg)
        root.set('viewBox', f'0 0 {image.width} {image.height}')
        root.attrib.pop('width', None); root.attrib.pop('height', None)
        for path in root.iter(f'{{{SVG_NS}}}path'): path.set('fill', color)
        save(brand, ET.tostring(root, encoding='unicode'), manifest, f'公式PNGの印字範囲{box}を曲線パス化。ラスター埋込なし。')
    build_inverse_display(manifest)
    atomic_json_write(ASSET_DIR / 'sources.json', manifest)


def build_inverse_display(manifest):
    """ピンの濃淡と白い画面を保ち、店名だけを青地用の白抜きSVGへ変換する。"""
    original = Image.open(ASSET_DIR / manifest['inverse']['file']).convert('RGBA')
    # 公式原本のマークと文字の間には透明な隙間がある。変更時は領域を再確認する。
    if original.size != (450, 50) or original.crop((70, 0, 74, 50)).getchannel('A').getextrema()[1] > 100:
        raise ValueError('インバースのマークと文字の位置が変わりました。原本を再確認してください。')
    box = original.getbbox()
    if box is None: raise ValueError('インバースのロゴが空です')
    left, top, right, bottom = box
    root = ET.Element(f'{{{SVG_NS}}}svg', viewBox=f'0 0 {right-left} {bottom-top}')
    for is_mark, bounds in [(True, (0, 0, 72, 50)), (False, (72, 0, 450, 50))]:
        region = original.crop(bounds)
        ink = region.getbbox()
        if ink is None: raise ValueError('インバースのロゴ領域が空です')
        region = region.crop(ink)
        if is_mark:
            # アルファと多色の輪郭を利用し、青いピンを白文字と一緒に単色化しない。
            svg = vtracer.convert_pixels_to_svg(rgba_pixels(region), region.size, colormode='color',
                hierarchical='stacked', mode='spline', filter_speckle=1, color_precision=6,
                layer_difference=8, corner_threshold=60, length_threshold=3.5, splice_threshold=45, path_precision=3)
        else:
            pixels = [(0, 0, 0, 255) if a > 100 else (255, 255, 255, 255) for r, g, b, a in rgba_pixels(region)]
            svg = vtracer.convert_pixels_to_svg(pixels, region.size, colormode='binary', mode='spline',
                filter_speckle=1, corner_threshold=60, length_threshold=3.5, splice_threshold=45, path_precision=3)
        traced = ET.fromstring(svg)
        group = ET.SubElement(root, f'{{{SVG_NS}}}g', transform=f'translate({bounds[0]+ink[0]-left} {ink[1]-top})')
        for node in list(traced):
            if not is_mark and node.tag == f'{{{SVG_NS}}}path': node.set('fill', '#ffffff')
            group.append(node)
    save('inverse', ET.tostring(root, encoding='unicode'), manifest,
         f'添付看板に合わせ背景{INVERSE_BACKGROUND}・白文字。公式PNGの多色ピンと白いPC画面を曲線パス化。ラスター埋込なし。')


def save(brand, svg, manifest, transform):
    """変換内容とハッシュを記録し、公式原本と表示用SVGを区別する。"""
    file = brand + '-display.svg'
    data = svg.encode('utf-8')
    (ASSET_DIR / file).write_bytes(data)
    manifest[brand].update(displayFile=file, displaySha256=hashlib.sha256(data).hexdigest(), displayTransform=transform)


if __name__ == '__main__': build_pc_displays()
