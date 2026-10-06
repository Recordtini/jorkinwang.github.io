"""Recover the retail Scaleform images and animation data without altering the dump."""
from __future__ import annotations

import argparse
import io
import json
import struct
import sys
import hashlib
import os
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace', type=Path, default=Path(__file__).resolve().parents[3])
parser.add_argument('--ffdec', type=Path)
parser.add_argument('--java', default='C:/Program Files/Java/jdk-17/bin/java.exe')
parser.add_argument('--reuse-exports', action='store_true')
args = parser.parse_args()
ROOT = args.workspace.resolve()
sys.path.insert(0, str(ROOT / 'jeopardy'))
from soe_decryptor import decode_soe

GAME = ROOT / 'NPUA80137/USRDIR/data'
QA = Path(__file__).resolve().parents[1] / 'qa/source'
OUT = Path(__file__).resolve().parents[1] / 'assets/presentation'
FFDEC = args.ffdec or ROOT / 'wheel_web_tools/ffdec/ffdec.jar'


def swf_tags(data, offset):
    while offset + 2 <= len(data):
        header = struct.unpack_from('<H', data, offset)[0]
        offset += 2
        code, size = header >> 6, header & 63
        if size == 63:
            size = struct.unpack_from('<I', data, offset)[0]
            offset += 4
        yield code, data[offset:offset + size]
        offset += size
        if code == 0:
            break


def extract_scaleform(name):
    source = GAME / 'swf' / name
    output = QA / name
    output.mkdir(parents=True, exist_ok=True)
    gfx = decode_soe(source / f'{name}.gfx.soe')
    (output / f'{name}.gfx').write_bytes(gfx)
    rect_size = ((gfx[8] >> 3) * 4 + 5 + 7) // 8
    tags = list(swf_tags(gfx, 8 + rect_size + 4))
    images = []
    for item in source.glob('*.dds.soe'):
        data = decode_soe(item)
        (output / item.name.removesuffix('.soe')).write_bytes(data)
        image = Image.open(io.BytesIO(data)).convert('RGBA')
        image.save(output / (item.name.removesuffix('.dds.soe') + '.png'))
        images.append((item.stem, image))
    sheet = Image.new('RGB', (400 * 4, 420 * ((len(images) + 3) // 4)), '#343434')
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(images):
        thumb = image.copy()
        thumb.thumbnail((390, 380))
        x, y = (index % 4) * 400, (index // 4) * 420
        sheet.paste(thumb, (x + (400 - thumb.width) // 2, y + 30), thumb)
        draw.text((x + 8, y + 8), f'{label} {image.size}', fill='white')
    if images:
        sheet.save(QA / f'{name}-images.png')
    print(name, 'tags', dict(Counter(code for code, _ in tags)),
          'images', [(label, image.size) for label, image in images], flush=True)


def ffdec(*arguments):
    # Isolate FFDec's Windows configuration from the user's installed copy.
    home = ROOT / 'wheel_web_tools/ffdec-home/AppData/Roaming'
    home.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, APPDATA=str(home), LOCALAPPDATA=str(home))
    subprocess.run([args.java, '-Djava.awt.headless=true', '-jar', str(FFDEC),
                    *map(str, arguments)], env=env, check=True)


def prepare_exports():
    for name in ['wheel', 'puzzleboard', 'gui']:
        source = QA / name / f'{name}.gfx'
        ffdec('-swf2xml', source, QA / f'{name}.xml')
        ffdec('-format', 'font:woff', '-export', 'script,font',
              QA / f'{name}-export', source)
    # Dynamic category text is supplied by the native game. Export the original
    # timeline without its authoring placeholder, then draw real categories live.
    gui = ET.parse(QA / 'gui.xml')
    for tag in gui.getroot().find('tags'):
        if tag.get('type') == 'DefineEditTextTag' and tag.get('characterID') == '293':
            tag.set('initialText', '')
    gui.write(QA / 'gui-browser.xml', encoding='utf-8', xml_declaration=True)
    ffdec('-xml2swf', QA / 'gui-browser.xml', QA / 'gui/gui-browser.gfx')
    ffdec('-selectid', '366,295', '-format', 'sprite:png', '-export', 'sprite',
          QA / 'category-clean', QA / 'gui/gui-browser.gfx')
    ffdec('-selectid', '15', '-format', 'sprite:png', '-export', 'sprite',
          QA / 'tile-export', QA / 'puzzleboard/puzzleboard.gfx')
    # These collectible overlays are intentionally hidden (the original
    # setWedgeState(..., 0) state), not replaced with invented graphics/rules.
    wheel = ET.parse(QA / 'wheel.xml')
    tags = wheel.getroot().find('tags')
    depths = {t.get('depth') for t in tags
              if t.get('name') in ['iMillion', 'iWildCard', 'iFreeSpin']}
    for tag in list(tags):
        if tag.get('type') in ['PlaceObject2Tag', 'RemoveObject2Tag'] and tag.get('depth') in depths:
            tags.remove(tag)
    wheel.write(QA / 'wheel-browser.xml', encoding='utf-8', xml_declaration=True)
    ffdec('-xml2swf', QA / 'wheel-browser.xml', QA / 'wheel/wheel-browser.gfx')
    ffdec('-select', '34,45,57,84', '-export', 'frame',
          QA / 'wheel-clean', QA / 'wheel/wheel-browser.gfx')


def atlas(folder, frames, destination, cell, crop=None):
    columns = min(8, len(frames))
    sheet = Image.new('RGBA', (columns * cell[0], ((len(frames)+columns-1)//columns) * cell[1]))
    for i, frame in enumerate(frames):
        image = Image.open(folder / f'{frame}.png').convert('RGBA')
        if crop:
            image = image.crop(crop)
        image = image.resize(cell, Image.Resampling.LANCZOS)
        sheet.paste(image, ((i % columns)*cell[0], (i//columns)*cell[1]))
    sheet.save(OUT / destination)
    return dict(url=f'assets/presentation/{destination}', columns=columns,
                width=cell[0], height=cell[1], frames=frames)


def package():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, destination in [('puzzleboard', 'board.woff'), ('gui', 'category.woff')]:
        prefix = '11_' if name == 'puzzleboard' else '19_'
        font = next((QA / f'{name}-export/fonts').glob(prefix + '*.woff'))
        shutil.copyfile(font, OUT / destination)
    tile = atlas(QA / 'tile-export/DefineSprite_15', list(range(3,39)),
                 'tiles.png', (128,160))
    gui_xml = ET.parse(QA / 'gui.xml').getroot()
    category = next(t for t in gui_xml.find('tags') if t.get('spriteId') == '366')
    frame, text_keys, current = 1, [], dict(scale=1, alpha=1)
    for t in category.find('subTags'):
        if t.get('type').startswith('PlaceObject') and t.get('depth') == '15':
            m, c = t.find('matrix'), t.find('colorTransform')
            if m is not None: current['scale'] = float(m.get('scaleX','1'))
            if c is not None: current['alpha'] = int(c.get('alphaMultTerm','256'))/256
        if t.get('type') == 'ShowFrameTag':
            if 10 <= frame <= 34: text_keys.append(dict(current))
            frame += 1
    # Fixed sprite coordinates preserve its authored masking and text placement.
    reveal = atlas(QA / 'category-clean/DefineSprite_366', list(range(10,35)),
                   'category.png', (640,100), crop=(0,200,640,300))
    reveal['text'] = text_keys
    reveal['fps'] = float(gui_xml.get('frameRate'))
    wheels = []
    for frame in [34,45,57,84]:
        image = Image.open(QA / f'wheel-clean/{frame}.png').convert('RGBA')
        image = image.resize((1024,1024), Image.Resampling.LANCZOS)
        image.save(OUT / f'wheel-{len(wheels)+1}.png')
        wheels.append(f'assets/presentation/wheel-{len(wheels)+1}.png')
    source = (QA / 'puzzleboard-export/scripts/frame_1/DoAction.as').read_text()
    timing = {name: float(re.search(rf'{name} = ([\d.]+);', source).group(1))*1000
              for name in ['mTimeBetweenLetters','mTimeBetweenBlueLetters',
                           'mTimeBetweenClearLetters','mTimeAfterBlue']}
    provenance = []
    for name in ['wheel','puzzleboard','gui']:
        raw = decode_soe(GAME / f'swf/{name}/{name}.gfx.soe')
        provenance.append(dict(source=f'NPUA80137/USRDIR/data/swf/{name}/{name}.gfx.soe',
                               decodedSha256=hashlib.sha256(raw).hexdigest()))
    data = dict(wheels=wheels, tile=tile, category=reveal, timing=timing,
                fonts=dict(board='assets/presentation/board.woff', category='assets/presentation/category.woff'),
                provenance=provenance, exporter='JPEXS FFDec 26.3.0',
                hiddenCollectibles=['Million','Wildcard','FreeSpin'])
    (OUT / 'presentation.json').write_text(json.dumps(data, indent=2) + '\n')
    reference = OUT / 'source'
    reference.mkdir(exist_ok=True)
    for name in ['wheel','puzzleboard','gui']:
        shutil.copyfile(QA / f'{name}-export/scripts/frame_1/DoAction.as', reference / f'{name}.as.txt')
    print('Packaged original Flash presentation:', OUT, flush=True)


if __name__ == '__main__':
    QA.mkdir(parents=True, exist_ok=True)
    for name in ['wheel', 'puzzleboard', 'podiums', 'gui']:
        extract_scaleform(name)
    if not args.reuse_exports:
        prepare_exports()
    package()
