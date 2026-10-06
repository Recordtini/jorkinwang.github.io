"""Recover remaining non-character presentation from the local retail dump."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'NPUA80137/USRDIR/data'
WHEEL = Path(__file__).resolve().parents[1]
OUT = WHEEL / 'assets/presentation'
QA = WHEEL / 'qa/source'
sys.path.insert(0, str(ROOT / 'jeopardy'))
import nif_to_glb as nif


def name(value):
    return nif.decode_name(value, '')


def value(v):
    if type(v).__name__ == 'Color3':
        return [float(v.r), float(v.g), float(v.b)]
    if type(v).__name__ == 'Quaternion':
        return [float(v.x), float(v.y), float(v.z), float(v.w)]
    return v.as_list() if hasattr(v, 'as_list') else float(v)


def keys(group):
    return dict(interpolation=int(group.interpolation), keys=[dict(
        time=float(k.time), value=value(k.value), **{
            n: value(getattr(k, n)) for n in ['forward', 'backward', 'tension', 'bias', 'continuity']
            if hasattr(k, n)}) for k in group.keys])


def animations():
    clips = {}
    counts = Counter()
    for path in sorted((GAME / 'models/sets/animation').rglob('*.kf.soe')):
        raw = nif.decode_soe(path)
        data = nif.NifFormat.Data()
        data.read(io.BytesIO(raw))
        seq = data.roots[0]
        tracks = []
        for link in seq.controlled_blocks:
            track = dict(node=name(link.node_name), controller=name(link.controller_type),
                         property=name(link.property_type), variable=name(link.variable_1))
            interp = link.interpolator
            if interp is None:
                continue
            counts[track['controller']] += 1
            if type(interp).__name__ == 'NiFloatInterpolator':
                track['constant'] = float(interp.float_value)
                track['scalar'] = keys(interp.data.data) if interp.data else None
            elif type(interp).__name__ == 'NiTransformInterpolator':
                track['rest'] = dict(translation=value(interp.translation),
                                     rotation=value(interp.rotation), scale=float(interp.scale))
                if interp.data:
                    d = interp.data
                    track.update(translation=keys(d.translations), scale=keys(d.scales),
                                 rotationType=int(d.rotation_type), xyz=[keys(g) for g in d.xyz_rotations],
                                 rotations=[dict(time=float(k.time), value=value(k.value)) for k in d.quaternion_keys])
            else:
                track['unsupported'] = type(interp).__name__
            tracks.append(track)
        actor = path.parent.name
        key = path.name.removesuffix('.kf.soe').removeprefix(actor + '_')
        clips.setdefault(actor, {})[key] = dict(name=name(seq.name), start=float(seq.start_time),
            stop=float(seq.stop_time), frequency=float(seq.frequency), cycle=int(seq.cycle_type),
            tracks=tracks, textKeys=[dict(time=float(k.time), value=name(k.value)) for k in seq.text_keys.text_keys],
            source=str(path.relative_to(ROOT)).replace('\\', '/'), decodedSha256=hashlib.sha256(raw).hexdigest())
    categories = {c.get('Name'): [dict(actor=a.get('Actor'), clip=a.get('Anim').removeprefix(a.get('Actor') + '_'), clamp=a.get('Clamp') == '1')
                                 for a in c.findall('AddProp')]
                  for c in ET.parse(GAME / 'models/sets/set_anim.xml').getroot()}
    # Flattened GLBs contain world-space vertices. Keep source bind matrices so
    # runtime controllers can be applied as deltas, never as a second placement.
    bindings = {}
    for path in sorted((GAME / 'models/sets/animation').rglob('*.nif.soe')):
        d = nif.NifFormat.Data()
        d.read(io.BytesIO(nif.decode_soe(path)))
        parents = nif.build_parent_lookup(d)
        nodes = {}
        for b in d.blocks:
            if not hasattr(b, 'get_transform'):
                continue
            nodes[name(b.name)] = dict(local=b.get_transform().as_list(), world=nif.world_matrix(b, parents, {}).tolist(),
                                      parent=name(parents[id(b)].name) if id(b) in parents else None)
            if type(b).__name__ == 'NiMesh':
                props = {type(p).__name__: p for p in b.properties if p}
                tex = props.get('NiTexturingProperty')
                slots = {}
                if tex:
                    for slot, attr in [('0', 'base_texture'), ('4', 'glow_texture')]:
                        if not getattr(tex, 'has_' + attr):
                            continue
                        desc = getattr(tex, attr)
                        slots[slot] = dict(translation=[float(desc.translation.u), float(desc.translation.v)],
                            scale=[float(desc.tiling.u), float(desc.tiling.v)] if desc.has_texture_transform else [1, 1],
                            center=[float(desc.center_offset.u), float(desc.center_offset.v)],
                            rotation=float(desc.w_rotation), enabled=bool(desc.has_texture_transform),
                            clamp=(int(desc.flags)>>12)&15 if d.version>=0x14010003 else int(desc.clamp_mode),
                            uvSet=nif.texture_desc_uv_set(desc,d.version))
                nodes[name(b.name)]['textures'] = slots
        bindings[path.parent.name] = nodes
    result = dict(clips=clips, categories=categories, bindings=bindings,
                  source='NPUA80137/USRDIR/data/models/sets/set_anim.xml')
    (OUT / 'animations.json').write_text(json.dumps(result, indent=2) + '\n')
    print('Animation clips', sum(len(v) for v in clips.values()), 'controllers', dict(counts), flush=True)
    for actor, group in clips.items():
        print(actor, [(key, round(clip['stop'], 3)) for key, clip in group.items()], flush=True)


def prepare_shell():
    import recover_presentation as r
    for movie in ['startshell','gameshell']:
        r.extract_scaleform(movie)
        source=QA / movie / (movie+'.gfx')
        r.ffdec('-swf2xml',source,QA / (movie+'.xml'))
        r.ffdec('-format','font:woff','-export','script,font',QA / (movie+'-export'),source)
    source=QA / 'gameshell/gameshell.gfx'
    r.ffdec('-export','text',QA / 'gameshell-text',source)
    r.ffdec('-selectid','10,14,17,20,23,26,30,33,36,39,42,45,48,51,54','-format','sprite:png','-export','sprite',QA / 'help-export',source)


def shell():
    folder = OUT / 'shell'
    folder.mkdir(exist_ok=True)
    catalog = {}
    for movie in ['startshell', 'gameshell', 'gui', 'wheel', 'puzzleboard']:
        xml = ET.parse(QA / f'{movie}.xml').getroot()
        sprites = []
        for tag in xml.find('tags'):
            if tag.get('type') == 'DefineSpriteTag':
                sprites.append(dict(id=int(tag.get('spriteId')), frames=int(tag.get('frameCount')),
                    labels=labels(tag.find('subTags'))))
        scripts = QA / f'{movie}-export/scripts'
        commands = Counter()
        functions = set()
        import re
        for path in scripts.rglob('*.as'):
            text = path.read_text(encoding='utf-8')
            commands.update(re.findall(r'fscommand\("([^"\n]+)"', text))
            functions.update(re.findall(r'function ([A-Za-z_][\w]*)\(', text))
        catalog[movie] = dict(fps=float(xml.get('frameRate')), sprites=sprites,
                             functions=sorted(functions), commands=dict(commands))
        if movie in ['startshell', 'gameshell']:
            shutil.copyfile(scripts / 'frame_1/DoAction.as', folder / f'{movie}.as.txt')
            fonts = folder / 'fonts'
            fonts.mkdir(exist_ok=True)
            for font in (QA / f'{movie}-export/fonts').glob('*.woff'):
                shutil.copyfile(font, fonts / f'{movie}-{font.name}')
            for image in (QA / movie).glob('*.png'):
                if image.name == 'avatar_setup.png':
                    continue
                shutil.copyfile(image, folder / image.name)
    strings = {k: v for tag in ET.parse(GAME / 'game/wof_str.xml').getroot() for k, v in tag.attrib.items()}
    catalog['strings'] = strings
    shutil.copyfile(QA / 'gameshell-export/scripts/__Packages/WoF_Data.as', folder / 'WoF_Data.as.txt')
    shutil.copyfile(QA / 'gameshell-export/scripts/__Packages/languages/WoF_English.as', folder / 'WoF_English.as.txt')
    help_pages = []
    for path in sorted((QA / 'help-export').glob('*'), key=lambda p:int(p.name.split('TextScreen')[-1])):
        index = int(path.name.split('TextScreen')[-1])
        dest = folder / f'help-{index}.png'
        shutil.copyfile(path / '1.png', dest)
        help_pages.append(dict(page=index, url='assets/presentation/shell/' + dest.name,
                               sourceSprite=int(path.name.split('_')[1])))
    catalog['help'] = help_pages
    help_text = '\n\n'.join((QA / f'gameshell-text/{i}.txt').read_text().replace('\n--- RECORDSEPARATOR ---\n', ' ') for i in [52,46,43,40,37,34,31,27,24,21,18,15,12,6] if (QA / f'gameshell-text/{i}.txt').exists())
    (folder / 'retail-help.txt').write_text(help_text, encoding='utf-8')
    (folder / 'shell.json').write_text(json.dumps(catalog, indent=2) + '\n')
    print('Shell and GUI catalog recovered', flush=True)


def labels(tags):
    frame = 1
    result = []
    for tag in tags:
        if tag.get('type') == 'FrameLabelTag':
            result.append(dict(frame=frame, name=tag.get('name')))
        if tag.get('type') == 'ShowFrameTag':
            frame += 1
    return result


def collectibles():
    import copy
    import os
    folder = OUT / 'collectibles'
    folder.mkdir(exist_ok=True)
    catalog = {}
    original = ET.parse(QA / 'wheel.xml')
    for target in ['iMillion', 'iWildCard', 'iFreeSpin']:
        doc = copy.deepcopy(original)
        tags = doc.getroot().find('tags')
        placement = next(t for t in tags if t.get('name') == target)
        sprite = next(t for t in tags if t.get('spriteId') == placement.get('characterId'))
        shown = next(l['frame'] for l in labels(sprite.find('subTags')) if l['name'] == 'lOn')
        # Keep its authoring coordinates on the 1024-square wheel stage.
        # Remove all other root instances, actions, and root timeline frames.
        for t in list(tags):
            if t.get('type') in ['PlaceObject2Tag', 'RemoveObject2Tag', 'DoActionTag', 'ShowFrameTag', 'EndTag', 'SetBackgroundColorTag']:
                tags.remove(t)
        tags.append(placement)
        for _ in range(shown):
            ET.SubElement(tags, 'item', {'type': 'ShowFrameTag'})
        ET.SubElement(tags, 'item', {'type': 'EndTag'})
        doc.getroot().set('frameCount', str(shown))
        xml = QA / f'{target}.xml'
        gfx = QA / 'wheel' / f'{target}.gfx'
        doc.write(xml, encoding='utf-8', xml_declaration=True)
        env = dict(os.environ, APPDATA=str(ROOT / 'wheel_web_tools/ffdec-home/AppData/Roaming'))
        command = ['C:/Program Files/Java/jdk-17/bin/java.exe', '-Djava.awt.headless=true', '-jar', str(ROOT / 'wheel_web_tools/ffdec/ffdec.jar')]
        subprocess.run(command + ['-xml2swf', str(xml), str(gfx)], env=env, check=True)
        subprocess.run(command + ['-select', str(shown), '-export', 'frame', str(QA / target), str(gfx)], env=env, check=True)
        image = Image.open(QA / target / f'{shown}.png').convert('RGBA').resize((1024, 1024), Image.Resampling.LANCZOS)
        image.save(folder / f'{target}.png')
        bbox = image.getbbox()
        import math
        x, y = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
        sector = round((math.atan2(x - 512, 512 - y) % (2 * math.pi)) * 24 / (2 * math.pi)) % 24
        catalog[target.removeprefix('i')] = dict(url=f'assets/presentation/collectibles/{target}.png', sector=sector, bbox=bbox,
                                               sourceSprite=int(sprite.get('spriteId')), state='lOn')
    (folder / 'collectibles.json').write_text(json.dumps(catalog, indent=2) + '\n')
    print('Native collectible wheel overlays', catalog, flush=True)


def power_meter():
    import copy
    import os
    doc = ET.parse(QA / 'gui.xml')
    tags = doc.getroot().find('tags')
    sprite = next(t for t in tags if t.get('spriteId') == '567')
    placement = copy.deepcopy(next(t for t in tags if t.get('name') == 'iPowerMeter'))
    frame, current, widths = 1, None, []
    for tag in sprite.find('subTags'):
        if tag.get('depth') == '5' and tag.find('matrix') is not None:
            current = float(tag.find('matrix').get('scaleX', '1'))
        if tag.get('type') == 'ShowFrameTag':
            if 73 <= frame <= 130:
                widths.append(current)
            frame += 1
    for tag in list(tags):
        if not tag.get('type').startswith('Define') and tag.get('type') not in ['ExporterInfo', 'FileAttributesTag']:
            tags.remove(tag)
    tags.append(placement)
    for _ in range(130):
        ET.SubElement(tags, 'item', {'type': 'ShowFrameTag'})
    doc.getroot().set('frameCount', '130')
    xml, gfx = QA / 'power-meter.xml', QA / 'gui/power-meter.gfx'
    doc.write(xml, encoding='utf-8', xml_declaration=True)
    env = dict(os.environ, APPDATA=str(ROOT / 'wheel_web_tools/ffdec-home/AppData/Roaming'))
    command = ['C:/Program Files/Java/jdk-17/bin/java.exe', '-Djava.awt.headless=true', '-jar', str(ROOT / 'wheel_web_tools/ffdec/ffdec.jar')]
    subprocess.run(command + ['-xml2swf', str(xml), str(gfx)], env=env, check=True)
    subprocess.run(command + ['-select', '73-130', '-export', 'frame', str(QA / 'power-meter'), str(gfx)], env=env, check=True)
    images = [Image.open(QA / 'power-meter' / f'{frame}.png').convert('RGBA') for frame in range(73,131)]
    boxes = [im.getbbox() for im in images]
    bbox = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    cell = (bbox[2]-bbox[0], bbox[3]-bbox[1])
    atlas = Image.new('RGBA', (cell[0]*8, cell[1]*8))
    for i, im in enumerate(images):
        atlas.paste(im.crop(bbox), (i%8*cell[0], i//8*cell[1]))
    atlas.save(OUT / 'power-meter.png', optimize=True)
    low, high = min(widths), max(widths)
    data = dict(url='assets/presentation/power-meter.png',width=cell[0],height=cell[1],columns=8,fps=30,
                frames=list(range(73,131)),levels=[round(10+90*(v-low)/(high-low)) for v in widths],
                source='gui.gfx/DefineSprite_567',nativeMinWidth=50,nativeMaxWidth=350)
    (OUT / 'power-meter.json').write_text(json.dumps(data, indent=2)+'\n')
    shutil.copyfile(QA / 'gui-export/scripts/frame_1/DoAction_2.as', OUT / 'source/gui-controls.as.txt')
    print('Native power meter', cell, widths[:4], flush=True)


def videos():
    folder = OUT / 'screens'
    for source in sorted((GAME / 'video').glob('*.bik')):
        dest = folder / (source.stem + '.mp4')
        if dest.exists():
            continue
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                        '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23',
                        '-movflags', '+faststart', str(dest)], check=True)
        print('Converted movie', source.stem, flush=True)


def notices():
    import copy
    import os
    catalog = {}
    command = ['C:/Program Files/Java/jdk-17/bin/java.exe', '-Djava.awt.headless=true', '-jar', str(ROOT / 'wheel_web_tools/ffdec/ffdec.jar')]
    env = dict(os.environ, APPDATA=str(ROOT / 'wheel_web_tools/ffdec-home/AppData/Roaming'))
    for target in ['mcNoMoreVowels', 'mcNoMoreConsonants']:
        doc = ET.parse(QA / 'gui.xml')
        tags = doc.getroot().find('tags')
        placement = copy.deepcopy(next(t for t in tags if t.get('name') == target))
        for t in list(tags):
            if not t.get('type').startswith('Define') and t.get('type') not in ['ExporterInfo','FileAttributesTag']:
                tags.remove(t)
        tags.append(placement)
        for _ in range(22):
            ET.SubElement(tags, 'item', {'type':'ShowFrameTag'})
        doc.getroot().set('frameCount', '22')
        xml, gfx = QA / (target+'.xml'), QA / 'gui' / (target+'.gfx')
        doc.write(xml, encoding='utf-8', xml_declaration=True)
        subprocess.run(command + ['-xml2swf', str(xml), str(gfx)], env=env, check=True)
        folder = QA / target
        subprocess.run(command + ['-select', '9-22', '-export','frame',str(folder),str(gfx)], env=env, check=True)
        images = [Image.open(folder / f'{f}.png').convert('RGBA') for f in range(9,23)]
        boxes = [im.getbbox() for im in images if im.getbbox()]
        box = (min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes))
        w,h = box[2]-box[0],box[3]-box[1]
        atlas = Image.new('RGBA',(w*8,h*2))
        for i,im in enumerate(images):
            atlas.paste(im.crop(box),(i%8*w,i//8*h))
        atlas.save(OUT / (target+'.png'), optimize=True)
        catalog[target] = dict(url='assets/presentation/'+target+'.png',width=w,height=h,columns=8,fps=30,frames=list(range(9,23)))
    (OUT / 'notices.json').write_text(json.dumps(catalog,indent=2)+'\n')


def mystery_wheel():
    import os
    doc = ET.parse(QA / 'wheel-browser.xml')
    tags = doc.getroot().find('tags')
    depths = {t.get('depth') for t in tags if t.get('name') in ['iMystery1','iMystery2']}
    for t in list(tags):
        if t.get('type') in ['PlaceObject2Tag','RemoveObject2Tag'] and t.get('depth') in depths:
            tags.remove(t)
    xml,gfx = QA / 'mystery-cleared.xml',QA / 'wheel/mystery-cleared.gfx'
    doc.write(xml,encoding='utf-8',xml_declaration=True)
    command = ['C:/Program Files/Java/jdk-17/bin/java.exe','-Djava.awt.headless=true','-jar',str(ROOT / 'wheel_web_tools/ffdec/ffdec.jar')]
    env = dict(os.environ,APPDATA=str(ROOT / 'wheel_web_tools/ffdec-home/AppData/Roaming'))
    subprocess.run(command+['-xml2swf',str(xml),str(gfx)],env=env,check=True)
    subprocess.run(command+['-select','57','-export','frame',str(QA / 'mystery-cleared'),str(gfx)],env=env,check=True)
    Image.open(QA / 'mystery-cleared/57.png').convert('RGBA').resize((1024,1024),Image.Resampling.LANCZOS).save(OUT / 'wheel-mystery-cleared.png')


def materials():
    result = {}
    texture_dir = OUT / 'materials'
    texture_dir.mkdir(exist_ok=True)
    for path in sorted((GAME / 'models/sets/mesh').glob('*.nif.soe')):
        # Atlas names are local to each NIF, not global across studios.
        decoder = nif.TextureStore(nif.GLTF2(), bytearray(), None)
        data = nif.NifFormat.Data()
        data.read(io.BytesIO(nif.decode_soe(path)))
        parents = nif.build_parent_lookup(data)
        for mesh in data.blocks:
            if type(mesh).__name__ != 'NiMesh':
                continue
            props, current, visited = {}, mesh, set()
            while current is not None and id(current) not in visited:
                visited.add(id(current))
                for p in getattr(current, 'properties', []):
                    if p:
                        props.setdefault(type(p).__name__, p)
                current = parents.get(id(current))
            m, tex, vertex = (props.get(k) for k in ['NiMaterialProperty', 'NiTexturingProperty', 'NiVertexColorProperty'])
            zbuffer, stencil = props.get('NiZBufferProperty'), props.get('NiStencilProperty')
            stage = path.name.removesuffix('.nif.soe')
            textures = {}
            for slot in ['base','dark','glow','gloss']:
                if not tex or not getattr(tex, 'has_'+slot+'_texture'):
                    continue
                desc = getattr(tex, slot+'_texture')
                entry = dict(source=name(desc.source.file_name), uvSet=nif.texture_desc_uv_set(desc, data.version))
                if slot in ['dark', 'glow']:
                    filename = stage + '_' + nif.sanitize_name(entry['source'], 'texture') + '.png'
                    image = decoder._decode_source_texture(desc.source).convert('RGBA')
                    pixel_hash = hashlib.sha256(image.tobytes()).hexdigest()
                    output = texture_dir / filename
                    existing_hash = hashlib.sha256(Image.open(output).convert('RGBA').tobytes()).hexdigest() if output.exists() else None
                    if existing_hash != pixel_hash:
                        image.save(output)
                    entry['url'] = 'assets/presentation/materials/' + filename
                    entry['pixelsSha256'] = pixel_hash
                    entry['size'] = list(image.size)
                textures[slot] = entry
            # Three.js removes these reserved binding characters from GLTF names.
            runtime_name = name(mesh.name).translate(str.maketrans('', '', '[] .:/')).replace(' ', '')
            result[stage + '/' + runtime_name] = dict(
                node=name(mesh.name),
                material=name(m.name) if m else '', alpha=float(m.alpha) if m else 1,
                diffuse=value(m.diffuse_color) if m else [1,1,1],
                ambient=value(m.ambient_color) if m else [1,1,1],
                emissive=value(m.emissive_color) if m else [0,0,0],
                specular=value(m.specular_color) if m else [0,0,0],
                gloss=float(m.glossiness) if m else 0,
                applyMode=int(tex.apply_mode) if tex and data.version <= 0x14000005 else None,
                vertexMode=int(vertex.vertex_mode) if vertex else None,
                lightingMode=int(vertex.lighting_mode) if vertex else None,
                zBufferFlags=int(zbuffer.flags) if zbuffer else None,
                stencilFlags=int(stencil.flags) if stencil else None,
                textures=textures)
        print('Material source', path.stem, flush=True)
    (OUT / 'materials.json').write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-shell', action='store_true')
    parser.add_argument('--skip-video', action='store_true')
    parser.add_argument('--collectibles', action='store_true')
    parser.add_argument('--materials', action='store_true')
    parser.add_argument('--power-meter', action='store_true')
    parser.add_argument('--notices', action='store_true')
    parser.add_argument('--mystery-wheel', action='store_true')
    parser.add_argument('--prepare-shell', action='store_true')
    args = parser.parse_args()
    animations()
    if args.prepare_shell:
        prepare_shell()
    if not args.skip_shell:
        shell()
    if not args.skip_video:
        videos()
    if args.collectibles:
        collectibles()
    if args.materials:
        materials()
    if args.power_meter:
        power_meter()
    if args.notices:
        notices()
    if args.mystery_wheel:
        mystery_wheel()
