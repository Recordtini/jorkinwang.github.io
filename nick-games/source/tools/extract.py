#!/usr/bin/env python3
"""Reproducible export of ProjectorRays chunk dumps; never executes Windows code."""
from pathlib import Path
import json, re, struct, collections, hashlib, wave, io
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
ORIGINALS=ROOT.parent/'originals'
def read_json(p):
    return json.loads(re.sub(r'\\(?!["\\/bfnrtu])',r'\\\\',p.read_text()))
def unpackbits(b, expected):
    out=bytearray();i=0
    while i<len(b) and len(out)<expected:
        n=b[i];i+=1
        if n<128:out+=b[i:i+n+1];i+=n+1
        elif n>128:
            if i>=len(b):break
            out+=bytes([b[i]])*(257-n);i+=1
    return bytes(out[:expected]).ljust(expected,b'\0')
def png_image(data,specific,palette):
    pitch=struct.unpack_from('>H',specific)[0]&0x3fff
    top,left,bottom,right=struct.unpack_from('>hhhh',specific,2);w=right-left;h=bottom-top
    depth=specific[23] if len(specific)>23 and specific[0]&128 else 1
    if not (0<w<=4096 and 0<h<=4096):raise ValueError(f'invalid bitmap {w}x{h}')
    if data[:2]==b'\xff\xd8':return Image.open(io.BytesIO(data)).convert('RGBA')
    expected=pitch*h;raw=data[:expected] if len(data)>=expected else unpackbits(data,expected)
    direct=len(data)>=expected;pixels=[]
    for y in range(h):
        row=raw[y*pitch:(y+1)*pitch]
        for x in range(w):
            if depth<=8:
                n=(row[x*depth//8]>>(8-depth-(x*depth%8)))&((1<<depth)-1)
                color=palette[n] if depth==8 else ((255,255,255) if n==0 else (0,0,0))
            elif depth==16:
                n=struct.unpack_from('>H',row,x*2)[0] if direct else (row[x]<<8)|row[x+pitch//2];color=((n>>10&31)*255//31,(n>>5&31)*255//31,(n&31)*255//31)
            elif depth==32:
                stride=pitch//4
                color=tuple(row[x*4+i] if direct else row[x+i*stride] for i in [1,2,3])
            else:raise ValueError(f'unsupported depth {depth}')
            pixels.append((*color,255))
    im=Image.new('RGBA',(w,h));im.putdata(pixels);return im
def xmed_text(data):
    """Director styled-text sections: ASCII-hex headers and uncompressed text runs."""
    at=0;sections={};runs=[]
    while at+20<=len(data):
        header=data[at:at+20]
        if not all(chr(c) in '0123456789abcdefABCDEF' for c in header):break
        key=int(header[:4],16);size=int(header[4:12],16);at+=20
        payload=data[at:at+size];at+=size
        if len(payload)!=size:raise ValueError('Truncated XMED section')
        if key in (2,3):
            comma=payload.find(b',',1,10)
            if comma<0:continue
            raw=payload[comma+1:]
            if raw.endswith(b'\x03'):raw=raw[:-1]
            raw=raw.split(b'\x00',1)[0]
            text=raw.decode('cp1252').replace('\r','\n')
            if key==2:runs.append(text)
            else:sections[3]=text
    return ''.join(runs) if runs else sections.get(3,'')

# Classic Macintosh system palette: 6x6x6 cube excluding black, then
# ten intermediate levels for red, green, blue and gray, followed by black.
levels=[255,204,153,102,51,0]
macpal=[(r,g,b) for r in levels for g in levels for b in levels][:-1]
ramps=[238,221,187,170,136,119,85,68,34,17]
macpal += [(v,0,0) for v in ramps]+[(0,v,0) for v in ramps]+[(0,0,v) for v in ramps]+[(v,v,v) for v in ramps]+[(0,0,0)]
assert len(macpal)==256

def export(game,source):
    chunks=ORIGINALS/source/'chunks';dest=ROOT/'assets'/game;dest.mkdir(parents=True,exist_ok=True)
    lookup=collections.defaultdict(dict)
    for k in read_json(next(chunks.glob('KEY*.json')))['entries']:lookup[k['castID']][k['fourCC']]=k['sectionID']
    palette=macpal
    # Prefer an embedded color table when a source contains one.
    pals=list(chunks.glob('CLUT-*.bin'))
    if pals:
        b=pals[0].read_bytes()
        if len(b)>=1536:
            palette=[tuple(b[i+j] for j in [0,2,4]) for i in range(len(b)-1536,len(b),6)]
    manifest={'game':game,'models':{},'textures':{},'texts':{},'sounds':{},'warnings':[],'source_sha256':hashlib.sha256((ORIGINALS/(source+'.dcr')).read_bytes()).hexdigest()}
    for p in sorted(chunks.glob('CASt-*.json')):
        meta=read_json(p);member=int(p.stem.split('-')[1]);name=meta.get('info',{}).get('name','');links=lookup[member]
        if not name:continue
        basename=re.sub(r'[^\w.\-]',lambda m:'_%02x'%ord(m[0]),name)
        raw=(chunks/(p.stem+'.bin')).read_bytes();typ,info_len,specific_len=struct.unpack_from('>III',raw)
        specific=raw[12+info_len:12+info_len+specific_len]
        try:
            if typ==1:
                if 'ediM' in links:
                    med=(chunks/f"ediM-{links['ediM']}.bin").read_bytes();at=med.find(b'\xff\xd8\xff')
                else:med=b'';at=-1
                if at>=0:im=Image.open(io.BytesIO(med[at:])).convert('RGBA')
                elif 'BITD' in links:im=png_image((chunks/f"BITD-{links['BITD']}.bin").read_bytes(),specific,palette)
                else:raise ValueError('No bitmap payload')
                path='textures/'+basename+'.png';(dest/'textures').mkdir(exist_ok=True);im.save(dest/path)
                manifest['textures'][name.lower()]={'file':path,'width':im.width,'height':im.height}
            elif typ==3 and 'STXT' in links:
                b=(chunks/f"STXT-{links['STXT']}.bin").read_bytes();off,n=struct.unpack_from('>II',b)
                text=b[off:off+n].decode('mac_roman').replace('\r','\n');manifest['texts'][name.lower()]=text
            elif typ==15 and 'XMED' in links:
                b=(chunks/f"XMED-{links['XMED']}.bin").read_bytes()
                if b[:4]==b'3DGM':
                    path='models/'+basename.lower();(dest/'models').mkdir(exist_ok=True);(dest/path).write_bytes(b)
                    manifest['models'][name.lower()]={'file':path,'bytes':len(b)}
                else:
                    if b.startswith(b'FFFF'):manifest['texts'][name.lower()]=xmed_text(b)
                    # Keep every original rich text / intro payload for later reconstruction.
                    (dest/'media').mkdir(exist_ok=True);(dest/'media'/basename).write_bytes(b)
            elif typ==6 and 'snd ' in links:
                b=(chunks/f"snd -{links['snd ']}.bin").read_bytes();fmt=struct.unpack_from('>H',b)[0];o=4
                if fmt==1:o+=struct.unpack_from('>H',b,2)[0]*6
                count=struct.unpack_from('>H',b,o)[0];o+=2+8*count
                ptr,num,rate,loop0,loop1=struct.unpack_from('>IIIII',b,o);enc=b[o+20]
                if enc==0:channels=1;bits=8;samples=num;start=o+22
                elif enc==255:
                    channels=num;samples=struct.unpack_from('>I',b,o+22)[0];bits=struct.unpack_from('>H',b,o+48)[0];start=o+64
                else:raise ValueError('compressed snd encoding '+str(enc))
                sample=b[start:start+samples*channels*(bits//8)]
                if bits==16:sample=b''.join(sample[i:i+2][::-1] for i in range(0,len(sample),2))
                path='sounds/'+basename.lower()+'.wav';(dest/'sounds').mkdir(exist_ok=True)
                with wave.open(str(dest/path),'wb') as wav:wav.setnchannels(channels);wav.setsampwidth(bits//8);wav.setframerate(rate>>16);wav.writeframes(sample)
                manifest['sounds'][name.lower()]={'file':path,'rate':rate>>16,'channels':channels,'bits':bits,'looped':(meta.get('info',{}).get('flags',0)&16)==0}
        except Exception as e:manifest['warnings'].append({'member':name,'error':str(e)})
    (dest/'manifest.json').write_text(json.dumps(manifest,indent=2))
    print(game,{k:len(manifest[k]) for k in ['models','textures','texts','sounds','warnings']})
    for w in manifest['warnings'][:8]:print(' ',w)
    import shutil
    shutil.copytree(ORIGINALS/source/'casts',ROOT/'reference'/game,dirs_exist_ok=True)
    return manifest
if __name__=='__main__':
    export('runaway-bus','runaway-bus/movie')
    export('stupor-highway','stupor-highway/foprace0')
