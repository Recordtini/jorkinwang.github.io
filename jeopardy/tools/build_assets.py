"""Recover the local Jeopardy PS3 assets without modifying the retail dump."""
import hashlib
import io
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET
from PIL import Image

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parents[1]/'assets'
QA=Path(__file__).resolve().parents[1]/'qa/source'
GAME=ROOT/'NPUA80227/USRDIR'
sys.path.insert(0,str(ROOT/'jeopardy'))
import nif_to_glb as nif
from soe_decryptor import decode_soe

def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=True,separators=(',',':')),encoding='utf-8')

def content():
    raw=decode_soe(GAME/'data/game/content.txt.soe')
    categories=[];title=[];clues=[]
    for line in raw.decode('utf-8-sig').splitlines()+['END']:
        line=line.strip()
        if not line:continue
        if '|' in line:
            parts=[p.strip() for p in line.split('|')]
            if len(parts)!=6:raise ValueError('Unexpected clue fields: '+line)
            clues.append(dict(question=parts[0],prefix=parts[1],answer=parts[2],options=parts[2:]))
        else:
            if clues:
                categories.append(dict(id=len(categories),name=' '.join(title),clues=clues))
                title=[];clues=[]
            title.append(line)
    write(OUT/'content.json',categories)
    return dict(categories=len(categories),clues=sum(len(c['clues']) for c in categories),sha256=hashlib.sha256(raw).hexdigest())

def stage():
    source=GAME/'data/models/sets/stage5/stage5.nif.soe'
    target=OUT/'stage5.glb';target.parent.mkdir(parents=True,exist_ok=True)
    # The exported retail NIF is already Y-up, unlike its GSA authoring scene.
    nif.export_nif_to_glb(source,target,axis_mode='blender_z_up',ambient_scale=0,ambient_tint_strength=0,dark_texture_mode='occlusion')
    data=nif.load_nif_data(source);parents=nif.build_parent_lookup(data);axis=nif.np.eye(3)
    cameras=[];surfaces=[]
    for block in data.blocks:
        name=nif.decode_name(getattr(block,'name',None),'')
        if type(block).__name__=='NiCamera':
            world=nif.world_matrix(block,parents,{})
            basis=world[:3,:3]@axis.T
            basis=basis/nif.np.linalg.norm(basis,axis=1)[:,None]
            cameras.append(dict(name=name,position=(world[3,:3]@axis.T).tolist(),forward=basis[0].tolist(),up=basis[1].tolist(),fov=math.degrees(2*math.atan(float(block.frustum_top))),near=float(block.frustum_near),far=float(block.frustum_far)))
        if type(block).__name__=='NiMesh':
            props={type(p).__name__:p for p in block.properties if p}
            alpha=props.get('NiAlphaProperty');tex=props.get('NiTexturingProperty')
            textures={}
            if tex:
                for slot in ['base','dark','glow']:
                    if getattr(tex,'has_'+slot+'_texture'):
                        desc=getattr(tex,slot+'_texture');textures[slot]=dict(name=nif.decode_name(desc.source.file_name,''),uv=nif.texture_desc_uv_set(desc,data.version))
            surfaces.append(dict(name=name,textures=textures,alphaFlags=int(alpha.flags) if alpha else None))
    write(OUT/'scene.json',dict(cameras=cameras,surfaces=surfaces,source=source.relative_to(ROOT).as_posix(),axis='native_y_up',scale=1))
    return len(cameras)

def flash():
    java='C:/Program Files/Java/jdk-17/bin/java.exe'
    ffdec=ROOT/'wheel_web_tools/ffdec/ffdec.jar'
    for movie in ['tileboard','cluecard','podiums','gui','gameshell']:
        folder=QA/movie;folder.mkdir(parents=True,exist_ok=True)
        source=GAME/'data/swf'/movie
        gfx=folder/(movie+'.gfx');gfx.write_bytes(decode_soe(source/(movie+'.gfx.soe')))
        dest=OUT/'presentation'/movie;dest.mkdir(parents=True,exist_ok=True)
        for path in source.glob('*.dds.soe'):
            Image.open(io.BytesIO(decode_soe(path))).convert('RGBA').save(dest/(path.name.removesuffix('.dds.soe')+'.png'))
        for arguments in [['-swf2xml',str(gfx),str(folder/(movie+'.xml'))],['-format','font:woff','-export','script,font',str(folder/'export'),str(gfx)]]:
            subprocess.run([java,'-Djava.awt.headless=true','-jar',str(ffdec),*arguments],check=True,stdout=subprocess.DEVNULL)
        for path in (folder/'export/fonts').glob('*.woff'):shutil.copy2(path,dest/path.name)
        scripts=[]
        for path in (folder/'export/scripts').rglob('*.as'):
            if path.name.startswith('DoAction') and 'frame_1' in str(path):scripts.append(path.read_text(encoding='utf-8'))
        (dest/'source.as.txt').write_text('\n'.join(scripts),encoding='utf-8')
        if movie in ['cluecard','tileboard']:
            subprocess.run([java,'-Djava.awt.headless=true','-jar',str(ffdec),'-export','shape',str(folder/'shapes'),str(gfx)],check=True,stdout=subprocess.DEVNULL)
            shape,target=('7.svg','clue-background.svg') if movie=='cluecard' else ('10.svg','tile-bevel.svg')
            shutil.copy2(folder/'shapes'/shape,dest/target)

def audio():
    entries=[];dest=OUT/'audio';dest.mkdir(parents=True,exist_ok=True)
    for bank in (GAME/'data_ps3/audio').glob('*.fsb'):
        raw=bank.read_bytes();count,headers,size=struct.unpack_from('<III',raw,4)
        if raw[:4]!=b'FSB4':raise ValueError('Unsupported bank')
        h=48;p=48+headers
        for i in range(count):
            hs=struct.unpack_from('<H',raw,h)[0];name=raw[h+2:h+32].split(b'\0')[0].decode('ascii')
            samples,n,_,_,mode,rate=struct.unpack_from('<6I',raw,h+32)
            h+=hs
            if mode&0x8000:continue
            if not mode&0x200:raise ValueError('Unsupported codec '+name)
            name=Path(name).stem;target=dest/(name+'.mp3')
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','mp3','-i','pipe:0','-af','loudnorm=I=-20:TP=-3:LRA=11','-c:a','libmp3lame','-b:a','128k',str(target)],input=raw[p:p+n],check=True)
            entries.append(dict(id=name,url='assets/audio/'+target.name,duration=samples/rate));p+=n
        if p!=48+headers+size:raise ValueError('Bank accounting mismatch')
    return entries

if __name__=='__main__':
    info=content();cameras=stage();flash();sounds=audio()
    from recover_cameras import recover
    recover()
    write(OUT/'manifest.json',dict(game='NPUA80227',content=info,cameras=cameras,audio=sounds))
    print('Recovered',info,'cameras',cameras,'sounds',len(sounds),flush=True)
