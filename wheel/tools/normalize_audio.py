"""Measure and level the recovered sound bank without changing cue timing."""
from pathlib import Path
import hashlib
import json
import math
import re
import shutil
import subprocess

WHEEL = Path(__file__).resolve().parents[1]


def measure(path):
    run = subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),
        '-af','loudnorm=I=-20:TP=-2:LRA=11:print_format=json,volumedetect',
        '-f','null','-'], capture_output=True, text=True, check=True)
    report = json.loads(re.search(r'\{\s*"input_i".*?\}', run.stderr, re.S).group())
    return {k:float(report[k]) for k in ['input_i','input_tp','input_lra']}


def main():
    original = WHEEL / 'qa/audio-original'
    original.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((WHEEL / 'assets/manifest.json').read_text())
    report = {}
    prior_path = WHEEL / 'assets/audio/levels.json'
    prior = json.loads(prior_path.read_text()) if prior_path.exists() else {}
    for entry in manifest['audio']:
        path = WHEEL / entry['url']
        master = original / path.name
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        # Re-running on already normalized output must not normalize it again.
        if checksum != prior.get(entry['id'], {}).get('outputSha256') or not master.exists():
            shutil.copy2(path, master)
        source = measure(master)
        music = entry['id'] in ['tossup','Wof8BarTheme']
        target = -22 if music else -20
        integrated = source['input_i']
        gain = min(36, target-integrated if math.isfinite(integrated) else 0, -2-source['input_tp'])
        temp = path.with_suffix('.normalized.mp3')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(master),
            '-af',f'volume={gain:.6f}dB','-c:a','libmp3lame','-b:a','192k',str(temp)], check=True)
        temp.replace(path)
        output = measure(path)
        if output['input_tp'] > -1:
            raise ValueError(f'{entry["id"]} exceeded true-peak headroom: {output}')
        report[entry['id']] = dict(targetLUFS=target,gainDB=round(gain,3),source=source,output=output,
            sourceSha256=hashlib.sha256(master.read_bytes()).hexdigest(),
            outputSha256=hashlib.sha256(path.read_bytes()).hexdigest())
        print(entry['id'], 'gain', round(gain,2), 'output', output, flush=True)
    prior_path.write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')


if __name__ == '__main__':
    main()
