"""Render retail podium clips in fixed SWF stage coordinates, not sprite bounds."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace', type=Path, default=Path(__file__).resolve().parents[3])
parser.add_argument('--java', default='C:/Program Files/Java/jdk-17/bin/java.exe')
parser.add_argument('--reuse-exports', action='store_true')
args = parser.parse_args()
ROOT = args.workspace.resolve()
QA = Path(__file__).resolve().parents[1] / 'qa/source'
OUT = Path(__file__).resolve().parents[1] / 'assets/presentation/podiums'
sys.path.insert(0, str(ROOT / 'jeopardy'))
from soe_decryptor import decode_soe


def ffdec(*argv):
    home = ROOT / 'wheel_web_tools/ffdec-home/AppData/Roaming'
    subprocess.run([args.java, '-Djava.awt.headless=true', '-jar',
                    str(ROOT / 'wheel_web_tools/ffdec/ffdec.jar'), *map(str, argv)],
                   env=dict(os.environ, APPDATA=str(home), LOCALAPPDATA=str(home)), check=True)


def matrix(x=0, y=0, scale=1):
    return ET.Element('matrix', dict(type='MATRIX', hasRotate='false', hasScale='true',
        nRotateBits='0', nScaleBits='32', nTranslateBits='32', scaleX=str(scale),
        scaleY=str(scale), translateX=str(round(x*20)), translateY=str(round(y*20))))


def place(character, depth=1, x=0, y=0, scale=1):
    tag = ET.Element('item', dict(type='PlaceObject2Tag', characterId=str(character),
        depth=str(depth), placeFlagHasCharacter='true', placeFlagHasMatrix='true',
        placeFlagMove='false', forceWriteAsLong='false'))
    tag.append(matrix(x, y, scale))
    return tag


def document():
    root = copy.deepcopy(ET.parse(QA / 'podiums.xml').getroot())
    tags = root.find('tags')
    for tag in list(tags):
        if not tag.get('type').startswith('Define') and tag.get('type') not in ['ExporterInfo', 'FileAttributesTag']:
            tags.remove(tag)
    return root, tags


def render(name, root, select):
    xml = QA / f'podiums-{name}.xml'
    gfx = QA / f'podiums/podiums-{name}.gfx'
    ET.ElementTree(root).write(xml, encoding='utf-8', xml_declaration=True)
    ffdec('-xml2swf', xml, gfx)
    ffdec('-select', select, '-export', 'frame', QA / f'podiums-{name}', gfx)


def export():
    source = ROOT / 'NPUA80137/USRDIR/data/swf/podiums'
    decoded = QA / 'podiums'
    decoded.mkdir(parents=True, exist_ok=True)
    for file in source.glob('*.soe'):
        (decoded / file.name.removesuffix('.soe')).write_bytes(decode_soe(file))
    ffdec('-swf2xml', decoded / 'podiums.gfx', QA / 'podiums.xml')
    ffdec('-format', 'font:woff', '-export', 'script,font', QA / 'podiums-export', decoded / 'podiums.gfx')
    root, tags = document()
    root.set('frameCount', '1')
    tags.append(place(4)); tags.append(ET.Element('item', type='ShowFrameTag'))
    render('body', root, '1')
    for name, character, count, select, scale in [
        ('backgrounds', 23, 24, '4,12,24', 1),
        ('turn', 34, 34, '13-34', .23495483),
        ('lose', 71, 49, '13-49', 1),
        ('bankrupt', 113, 151, '12-151', 1),
    ]:
        root, tags = document()
        root.set('frameCount', str(count))
        tags.append(place(character, scale=scale))
        for _ in range(count): tags.append(ET.Element('item', type='ShowFrameTag'))
        render(name, root, select)
    # Rasterize the embedded font with its actual Scaleform text bounds,
    # horizontal compression, black shadow and glow filters intact.
    root, tags = document()
    definitions = {int(t.get('characterID', t.get('spriteId', '0'))): t for t in tags}
    glyphs = '$,0123456789'
    for i, char in enumerate(glyphs):
        base = 2000 + i*3
        for old, new in [(26, base), (27, base+1), (28, base+2)]:
            tag = copy.deepcopy(definitions[old])
            if old == 28:
                tag.set('spriteId', str(new))
                for p in tag.find('subTags'):
                    if p.get('characterId') in ['26', '27']:
                        p.set('characterId', str(base + int(p.get('characterId'))-26))
            else:
                tag.set('characterID', str(new))
                tag.set('initialText', tag.get('initialText').replace('>2<', f'>{char}<'))
            tags.append(tag)
    root.set('frameCount', str(len(glyphs)))
    for i in range(len(glyphs)):
        if i: tags.append(ET.Element('item', type='RemoveObject2Tag', depth='1'))
        tags.append(place(2000+i*3+2, x=50, y=50))
        tags.append(ET.Element('item', type='ShowFrameTag'))
    render('glyphs', root, f'1-{len(glyphs)}')


def atlas(name, frames, cell=(300, 225)):
    columns = min(8, len(frames))
    image = Image.new('RGBA', (columns*cell[0], ((len(frames)+columns-1)//columns)*cell[1]))
    for i, frame in enumerate(frames):
        tile = Image.open(QA / f'podiums-{name}/{frame}.png').convert('RGBA').crop((0, 0, *cell))
        image.paste(tile, ((i % columns)*cell[0], (i//columns)*cell[1]))
    image.save(OUT / f'{name}.png', optimize=True)
    return dict(url=f'assets/presentation/podiums/{name}.png', frames=frames,
                columns=columns, width=cell[0], height=cell[1])


def digit_keys():
    root = ET.parse(QA / 'podiums.xml').getroot()
    sprite = next(t for t in root.find('tags') if t.get('spriteId') == '30')
    keys, current = [], dict(matrix=[1, 0, 0, 1, 0, 0], alpha=1, visible=False)
    for tag in sprite.find('subTags'):
        if tag.get('depth') == '1':
            if tag.get('type').startswith('RemoveObject'): current['visible'] = False
            elif tag.get('type').startswith('PlaceObject'):
                current['visible'] = True
                m, c = tag.find('matrix'), tag.find('colorTransform')
                if m is not None:
                    current['matrix'] = [float(m.get(k, d)) for k, d in [
                        ('scaleX', '1'), ('rotateSkew0', '0'), ('rotateSkew1', '0'), ('scaleY', '1'),
                        ('translateX', '0'), ('translateY', '0')]]
                    current['matrix'][4] /= 20; current['matrix'][5] /= 20
                if c is not None: current['alpha'] = int(c.get('alphaMultTerm', '256'))/256
                elif tag.get('placeFlagMove') != 'true': current['alpha'] = 1
        if tag.get('type') == 'ShowFrameTag': keys.append(copy.deepcopy(current))
    return keys


if __name__ == '__main__':
    QA.mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
    if not args.reuse_exports: export()
    shutil.copyfile(QA / 'podiums-body/1.png', OUT / 'body.png')
    shutil.copyfile(next((QA / 'podiums-export/fonts').glob('25_*.woff')), OUT / 'univers-extrablack.woff')
    data = dict(fps=30, width=1024, height=512, slots=[0,362,724], font='Univers ExtraBlack',
        fontUrl='assets/presentation/podiums/univers-extrablack.woff',
        body='assets/presentation/podiums/body.png', backgrounds=atlas('backgrounds', [4,12,24]),
        turn=atlas('turn', list(range(13,35))), lose=atlas('lose', list(range(13,50))),
        bankrupt=atlas('bankrupt', list(range(12,152))), glyphs=atlas('glyphs', list(range(1,13)), (144,144)),
        characters='$,0123456789', glyphOrigin=[-50,-50], digitKeys=digit_keys(),
        widths={'$':27, ',':13, '1':17, '2':25, '3':27, '4':27, '5':24, '6':27,
                '7':25, '8':26, '9':25, '0':26},
        scoreFrames=49, finalFrames=61,
        source='NPUA80137/USRDIR/data/swf/podiums/podiums.gfx.soe',
        decodedSha256=hashlib.sha256((QA / 'podiums/podiums.gfx').read_bytes()).hexdigest(),
        exporter='JPEXS FFDec 26.3.0; fixed 1024x512 root-stage frames')
    (OUT / 'podiums.json').write_text(json.dumps(data, indent=2)+'\n')
    shutil.copyfile(QA / 'podiums-export/scripts/frame_1/DoAction.as', OUT / 'podiums.as.txt')
    print('Packaged source podiums:', OUT, flush=True)
