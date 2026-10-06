"""Catalog original cameras, controller keys, material flags and screen videos."""
from pathlib import Path
import hashlib
import io
import json
import math
import argparse
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'jeopardy'))
import nif_to_glb as nif

OUT = Path(__file__).resolve().parents[1] / 'assets/presentation'
GAME = ROOT / 'NPUA80137/USRDIR/data'


def value(v):
    if hasattr(v, 'as_list'):
        return v.as_list()
    return float(v)


def keys(group):
    return dict(interpolation=int(group.interpolation), keys=[
        dict(time=float(k.time), value=value(k.value),
             **{n: value(getattr(k, n)) for n in ['forward', 'backward'] if hasattr(k, n)})
        for k in group.keys])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-video', action='store_true')
    args = parser.parse_args()
    raw = nif.decode_soe(GAME / 'models/sets/mesh/wof_base.nif.soe')
    data = nif.NifFormat.Data()
    data.read(io.BytesIO(raw))
    parents = nif.build_parent_lookup(data)
    cameras, materials = [], {}
    for block in data.blocks:
        if type(block).__name__ == 'NiCamera':
            world = nif.world_matrix(block, parents, {})
            # Source WOF meshes already use Y up; browser units are centimetres / 100.
            position = (world[3, :3] * .01).tolist()
            basis = world[:3, :3]
            basis = basis / nif.np.linalg.norm(basis, axis=1)[:, None]
            # Gamebryo camera local axes are direction, up, right (not glTF -Z).
            forward, up = basis[0].tolist(), basis[1].tolist()
            chain, node = [], block
            while node is not None:
                controller = getattr(node, 'controller', None)
                interpolator = getattr(controller, 'interpolator', None)
                track = getattr(interpolator, 'data', None)
                if type(track).__name__ == 'NiTransformData':
                    chain.append(dict(node=nif.decode_name(node.name, ''),
                                      start=float(controller.start_time), stop=float(controller.stop_time),
                                      frequency=float(controller.frequency),
                                      translation=keys(track.translations), scale=keys(track.scales),
                                      rotationType=int(track.rotation_type),
                                      xyz=[keys(g) for g in track.xyz_rotations],
                                      restMatrix=node.get_transform().as_list()))
                node = parents.get(id(node))
            cameras.append(dict(name=nif.decode_name(block.name, ''), position=position,
                                forward=forward, up=up, worldMatrix=world.tolist(),
                                fov=math.degrees(2 * math.atan(float(block.frustum_top))),
                                aspect=float(block.frustum_right / block.frustum_top),
                                near=float(block.frustum_near)*.01,
                                far=float(block.frustum_far)*.01, tracks=chain))
        if type(block).__name__ == 'NiMesh':
            props = {type(p).__name__: p for p in block.properties if p is not None}
            alpha = props.get('NiAlphaProperty')
            materials[nif.decode_name(block.name, '')] = dict(
                alphaFlags=int(alpha.flags) if alpha else None,
                alphaThreshold=int(alpha.threshold) if alpha else None)
    model_paths = sorted((GAME / 'models/sets/mesh').glob('*.nif.soe'))
    model_paths += sorted((GAME / 'models/sets/animation').rglob('*.nif.soe'))
    for path in model_paths:
        if path.name == 'wof_base.nif.soe':
            continue
        stage = nif.NifFormat.Data()
        stage.read(io.BytesIO(nif.decode_soe(path)))
        for block in stage.blocks:
            if type(block).__name__ != 'NiMesh':
                continue
            props = {type(p).__name__: p for p in block.properties if p is not None}
            alpha = props.get('NiAlphaProperty')
            materials[path.name.removesuffix('.nif.soe') + '/' + nif.decode_name(block.name, '')] = dict(
                alphaFlags=int(alpha.flags) if alpha else None,
                alphaThreshold=int(alpha.threshold) if alpha else None)
        print('Read materials', path.name, flush=True)
    roles = {c.get('Name'): [a.get('Name') for a in c.findall('AddAnim')]
             for c in ET.parse(GAME / 'models/sets/camera_anim.xml').getroot()}
    result = dict(source='NPUA80137/USRDIR/data/models/sets/mesh/wof_base.nif.soe',
                  decodedSha256=hashlib.sha256(raw).hexdigest(), cameras=cameras,
                  roles=roles, materials=materials)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'cameras.json').write_text(json.dumps(result, indent=2) + '\n')
    if args.skip_video:
        print('Recovered cameras and source alpha flags.')
        return
    # Native screen movie, not a newly drawn imitation of its logo.
    video = OUT / 'screens'
    video.mkdir(exist_ok=True)
    for name in ['game_logo', 'jackpot_intro', 'mystery_intro', 'fireworks']:
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i',
                        str(GAME / f'video/{name}.bik'), '-an', '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart',
                        str(video / f'{name}.mp4')], check=True)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', '6.8',
                    '-i', str(GAME / 'video/game_logo.bik'), '-frames:v', '1',
                    str(video / 'game_logo.png')], check=True)
    print('Recovered', len(cameras), 'cameras;', len(roles), 'roles; original screen movies.')
    for camera in cameras:
        print(camera['name'], camera['position'], camera['forward'], camera['fov'])
    print('Alpha properties', {n: m for n, m in materials.items() if m['alphaFlags'] is not None})


if __name__ == '__main__':
    main()
