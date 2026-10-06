"""Build browser assets from the locally owned PS3 dump and existing exports."""
from __future__ import annotations

import hashlib
import argparse
import json
import shutil
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace', type=Path, default=Path(__file__).resolve().parents[3])
ROOT = parser.parse_args().workspace.resolve()
sys.path.insert(0, str(ROOT / "jeopardy"))
from soe_decryptor import decode_soe

GAME = ROOT / "NPUA80137/USRDIR"
OUT = Path(__file__).resolve().parents[1] / "assets"
STAGES = {
    "base": "Classic Studio", "ch": "Chicago", "da": "Dallas",
    "dn": "Denver", "fl": "Florida", "la": "Los Angeles",
    "lv": "Las Vegas", "no": "New Orleans", "ny": "New York",
    "ph": "Philadelphia", "px": "Phoenix", "sf": "San Francisco",
}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")


def build_puzzles():
    source = GAME / "data/content/wofpuzzles.txt.soe"
    raw = decode_soe(source)
    existing = (GAME / "data/content/wofpuzzles.txt").read_bytes()
    if raw.replace(b"\r\n", b"\n") != existing.replace(b"\r\n", b"\n"):
        raise ValueError("Decoded puzzle data does not match the extracted reference")
    puzzles = []
    for number, line in enumerate(raw.decode("utf-8-sig").splitlines()):
        category, *rows = line.split("*")
        if len(rows) != 4 or any(len(row) != 14 for row in rows):
            raise ValueError(f"Unexpected puzzle layout on line {number + 1}")
        clean_rows = [row.replace("%", " ") for row in rows]
        answer = " ".join(row.strip() for row in clean_rows if row.strip())
        puzzles.append({"id": number, "category": category.lstrip("~"),
                        "bonus": category.startswith("~"), "rows": clean_rows,
                        "answer": answer})
    write_json(OUT / "puzzles.json", puzzles)
    return len(puzzles)


def copy_models():
    models = []
    for source in sorted((ROOT / "wheel_of_fortune_glb").rglob("*.glb")):
        if source.stem.endswith("_debug"):
            continue
        relative = source.relative_to(ROOT / "wheel_of_fortune_glb")
        target = OUT / "models" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        models.append({"id": source.stem, "url": "assets/models/" + relative.as_posix(),
                       "bytes": source.stat().st_size})
    return models


def extract_audio():
    # FSB4 stores MPEG frames with even-byte padding. FFmpeg resynchronizes
    # those frames; duplicate subsounds reuse the preceding payload.
    entries = []
    destination = OUT / "audio"
    destination.mkdir(parents=True, exist_ok=True)
    for bank in (GAME / "data_ps3/audio").glob("*.fsb"):
        raw = bank.read_bytes()
        if raw[:4] != b"FSB4":
            raise ValueError(f"Unsupported sound bank: {bank}")
        count, headers_size, data_size = struct.unpack_from("<III", raw, 4)
        header_pos, data_pos = 48, 48 + headers_size
        for index in range(count):
            header_size = struct.unpack_from("<H", raw, header_pos)[0]
            name = raw[header_pos + 2:header_pos + 32].split(b"\0")[0].decode("ascii")
            samples, size, loop_start, loop_end, mode, rate = struct.unpack_from("<6I", raw, header_pos + 32)
            if mode & 0x8000:
                header_pos += header_size
                continue
            if not mode & 0x200:
                raise ValueError(f"Unexpected audio codec for {name}: {mode:#x}")
            name = Path(name).stem or f"{bank.stem}_{index}"
            payload = raw[data_pos:data_pos + size]
            mp3 = destination / (name + ".mp3")
            result = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                                     "-f", "mp3", "-i", "pipe:0", "-c:a", "libmp3lame",
                                     "-b:a", "128k", str(mp3)], input=payload,
                                    capture_output=True)
            if result.returncode:
                raise RuntimeError(f"Audio conversion failed for {name}: {result.stderr.decode()}")
            entries.append({"id": name, "url": "assets/audio/" + mp3.name,
                            "bank": bank.stem, "duration": samples / rate})
            data_pos += size
            header_pos += header_size
        if data_pos != 48 + headers_size + data_size:
            raise ValueError(f"Sound bank payload size mismatch: {bank}")
    return entries


def build_source_catalog():
    # Preserve scene, shader, and animation provenance without shipping the executable.
    catalog = []
    for source in sorted(GAME.rglob("*")):
        if source.is_file():
            catalog.append({"path": source.relative_to(GAME).as_posix(),
                            "bytes": source.stat().st_size,
                            "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
    write_json(OUT / "source-catalog.json", catalog)
    configs = {}
    for short in STAGES:
        source = GAME / f"data/wof_{short}.scx"
        root = ET.parse(source).getroot()
        spin = root.find("WheelSpin")
        configs[short] = {"spin": dict(spin.attrib) if spin is not None else {},
                          "actors": [dict(node.attrib) for node in root.findall("Actor")]}
    write_json(OUT / "scenes.json", configs)
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    count = build_puzzles()
    models = copy_models()
    audio = extract_audio()
    avatars, errors = [], []
    build_source_catalog()
    write_json(OUT / "manifest.json", {"game": "NPUA80137", "puzzleCount": count,
               "stages": [{"id": key, "name": value,
                           "url": f"assets/models/mesh/wof_{key}.glb"}
                          for key, value in STAGES.items()],
               "models": models, "avatars": avatars, "audio": audio,
               "conversionErrors": errors})
    print(f"Packaged {count} puzzles, {len(models)} set models, {len(avatars)} avatar parts, {len(audio)} sounds.")


if __name__ == "__main__":
    main()
