from pathlib import Path
import json,struct,zlib
root=Path(__file__).resolve().parents[1]
files=sorted(p for p in (root/'assets').rglob('*') if p.is_file())
if not files:
 if (root/'assets.pak').is_file():
  print('Using bundled assets.pak (no loose asset exports)')
  raise SystemExit(0)
 raise SystemExit('Missing assets.pak and loose asset exports')
index={};payload=bytearray()
for p in files:
 b=p.read_bytes();index[p.relative_to(root/'assets').as_posix()]=[len(payload),len(b)];payload+=b
header=json.dumps(index,separators=(',',':')).encode();out=root/'assets.pak';raw=b'NICKPAK1'+struct.pack('<I',len(header))+header+payload
data=b'NICKZ001'+struct.pack('<I',len(raw))+zlib.compress(raw,9)
if not out.exists() or out.read_bytes()!=data:out.write_bytes(data)
print(len(files),'assets,',out.stat().st_size,'bytes')
