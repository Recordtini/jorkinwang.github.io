"""Export category-scroll timing and artwork from the recovered retail Flash UI."""
import json
from pathlib import Path
import shutil
import subprocess
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE.parents[1]


def timeline(root, sprite_id, depth):
    sprite = root.find(f".//item[@spriteId='{sprite_id}']")
    frame = 1
    labels = {}
    frames = []
    x = 0
    alpha = 1
    for item in sprite.find('subTags'):
        kind = item.get('type')
        if kind == 'FrameLabelTag':
            labels[item.get('name')] = frame
        if item.get('depth') == str(depth):
            matrix = item.find('matrix')
            color = item.find('colorTransform')
            if matrix is not None:
                x = int(matrix.get('translateX', '0')) / 38400
            if color is not None:
                alpha = int(color.get('alphaMultTerm', '256')) / 256
        if kind == 'ShowFrameTag':
            frames.append(dict(x=x, alpha=alpha))
            frame += 1
    return dict(labels=labels, frames=frames)


def recover():
    source = BASE / 'qa/source/gui'
    root = ET.parse(source / 'gui.xml').getroot()
    data = dict(source='gui.gfx sprites 15/16', fps=float(root.get('frameRate')),
                screen=timeline(root, 16, 1), graphic=timeline(root, 15, 5),
                callbacks=dict(playIn=63, fadeIn=109, text=60))
    dest = BASE / 'assets/presentation/gui'
    (dest / 'category-timeline.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    shapes = source / 'shapes'
    subprocess.run(['C:/Program Files/Java/jdk-17/bin/java.exe', '-Djava.awt.headless=true',
                    '-jar', str(ROOT / 'wheel_web_tools/ffdec/ffdec.jar'), '-export', 'shape',
                    str(shapes), str(source / 'gui.gfx')], check=True, stdout=subprocess.DEVNULL)
    for shape, name in [('3.svg', 'category-background.svg'), ('12.svg', 'category-border.svg')]:
        shutil.copy2(shapes / shape, dest / name)
    podium_source = BASE / 'qa/source/podiums'
    podium = ET.parse(podium_source / 'podiums.xml').getroot()
    lights = []
    bar = podium.find(".//item[@spriteId='35']/subTags")
    for item in bar:
        if item.get('characterId') != '34':
            continue
        name = item.get('name', 'iTimerLightR0')
        matrix = item.find('matrix')
        lights.append(dict(level=int(name[-1]), x=int(matrix.get('translateX')) / 20,
                           y=int(matrix.get('translateY')) / 20, scaleX=float(matrix.get('scaleX', '1'))))
    bounds = podium.find(".//item[@shapeId='33']/shapeBounds")
    data = dict(source='podiums.gfx sprites 34/35 and UpdateTimerBar', scale=.23495483,
                lights=lights, width=(int(bounds.get('Xmax'))-int(bounds.get('Xmin'))) / 20,
                height=(int(bounds.get('Ymax'))-int(bounds.get('Ymin'))) / 20)
    podium_dest = BASE / 'assets/presentation/podiums'
    (podium_dest / 'timer-layout.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    subprocess.run(['C:/Program Files/Java/jdk-17/bin/java.exe', '-Djava.awt.headless=true',
                    '-jar', str(ROOT / 'wheel_web_tools/ffdec/ffdec.jar'), '-export', 'shape',
                    str(podium_source / 'shapes'), str(podium_source / 'podiums.gfx')], check=True, stdout=subprocess.DEVNULL)
    shutil.copy2(podium_source / 'shapes/33.svg', podium_dest / 'timer-light.svg')
    print('Recovered category-scroll artwork and 30 Hz timeline')


if __name__ == '__main__':
    recover()
