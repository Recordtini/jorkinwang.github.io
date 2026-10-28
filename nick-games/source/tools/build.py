#!/usr/bin/env python3
"""Build a self-contained, subdirectory-safe GitHub Pages artifact."""
import argparse, hashlib, json, os, shutil, subprocess, sys, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--native',action='store_true');p.add_argument('--package',action='store_true');args=p.parse_args()
cargo=shutil.which('cargo') or str(Path.home()/'.cargo/bin/cargo')
def run(*cmd): subprocess.run(cmd,cwd=ROOT,check=True)
run(sys.executable,str(ROOT/'tools/pack_assets.py'))
run(cargo,'test','--locked','--lib','--tests')
run(cargo,'build','--locked','--release','--target','wasm32-unknown-unknown')
engine=ROOT/'target/wasm32-unknown-unknown/release/nick-rust.wasm';shutil.copy2(engine,ROOT/'web/engine.wasm')
metadata=json.loads(subprocess.check_output([cargo,'metadata','--locked','--format-version','1'],cwd=ROOT))
quad=next(x for x in metadata['packages'] if x['name']=='macroquad')
source=Path(quad['manifest_path']).parent
# Upstream's bundled quad-net plug-in assigns this variable in strict mode.
(ROOT/'web/runtime.js').write_text('var register_plugin;\n'+(source/'js/mq_js_bundle.js').read_text())
digest=hashlib.sha256(engine.read_bytes()).hexdigest()
for game in ['runaway-bus','stupor-highway']:
 page=ROOT/'web'/game/'index.html';text=page.read_text()
 import re
 text=re.sub(r' data-engine="[^"]*"','',text)
 text=text.replace('<body ',f'<body data-engine="../engine.wasm?build={digest[:12]}" ',1)
 text=re.sub(r'src="../bridge.js(?:\?[^" ]*)?"',f'src="../bridge.js?build={digest[:12]}"',text)
 page.write_text(text)
(ROOT/'web/build.json').write_text(json.dumps({'engine_sha256':digest,'crate':'nick-rust','macroquad':quad['version'],'games':['runaway-bus','stupor-highway']},indent=2)+'\n')
(ROOT/'web/.nojekyll').touch()
# Keep dependency notices with the deployable build.
shutil.copy2(ROOT/'THIRD_PARTY.md',ROOT/'web/THIRD_PARTY.md')
notices=ROOT/'web/licenses';notices.mkdir(exist_ok=True)
for package in metadata['packages']:
 folder=Path(package['manifest_path']).parent
 for license in folder.glob('*'):
  if license.is_file() and license.name.upper().startswith(('LICENSE','COPYING')):
   shutil.copy2(license,notices/(package['name']+'-'+license.name))
if args.native: run(cargo,'build','--locked','--release')
if args.package:
 dist=ROOT/'dist';dist.mkdir(exist_ok=True)
 with zipfile.ZipFile(dist/'nick-games-web.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9,strict_timestamps=False) as archive:
  for file in sorted((ROOT/'web').rglob('*')):
   if file.is_file():archive.write(file,Path('nick-games')/file.relative_to(ROOT/'web'))
 print('Deploy:',dist/'nick-games-web.zip')
print('Engine SHA-256:',digest)
