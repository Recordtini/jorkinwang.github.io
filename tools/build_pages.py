"""Build smaller Pages assets without overwriting the recovered originals in Git."""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import pathlib
import re
import shutil
import struct
import subprocess
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSION = "20261026-webp-q85"
POLICY = "q85-alpha100-data-ui-lossless-v1"
DATA_NAME = re.compile(r"normal|roughness|occlusion|lightingmap|(?:^|_)dark|gloss|_nrm|_mask|tileboard|shadow", re.I)


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def read_glb(data):
    magic, version, length = struct.unpack_from("<4sII", data)
    assert magic == b"glTF" and version == 2 and length == len(data)
    document, binary = None, b""
    at = 12
    while at < length:
        size, kind = struct.unpack_from("<I4s", data, at)
        chunk = data[at + 8:at + 8 + size]
        if kind == b"JSON":
            document = json.loads(chunk)
        elif kind == b"BIN\0":
            binary = chunk
        else:
            raise ValueError(f"Unsupported GLB chunk: {kind!r}")
        at += size + 8
    return document, binary


def write_glb(document, binary):
    encoded = compact(document)
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    chunks = struct.pack("<I4s", len(encoded), b"JSON") + encoded
    if binary:
        chunks += struct.pack("<I4s", len(binary), b"BIN\0") + binary
    return struct.pack("<4sII", b"glTF", 2, len(chunks) + 12) + chunks


def view_bytes(document, binary, index):
    view = document["bufferViews"][index]
    assert view.get("buffer", 0) == 0
    offset = view.get("byteOffset", 0)
    payload = binary[offset:offset + view["byteLength"]]
    assert len(payload) == view["byteLength"]
    return payload


class Encoder:
    def __init__(self, cache):
        self.cache = cache
        self.counts = {"lossy": 0, "lossless": 0, "alpha_verified": 0}

    def encode(self, payload, lossless):
        source = Image.open(io.BytesIO(payload)).convert("RGBA")
        key = hashlib.sha256(payload + f"{POLICY}:{lossless}".encode()).hexdigest()
        cached = self.cache / (key + ".webp")
        if cached.exists():
            encoded = cached.read_bytes()
        else:
            output = io.BytesIO()
            source.save(output, format="WEBP", quality=100 if lossless else 85,
                        lossless=lossless, method=4, exact=True, alpha_quality=100)
            encoded = output.getvalue()
            cached.write_bytes(encoded)
        decoded = Image.open(io.BytesIO(encoded)).convert("RGBA")
        assert decoded.size == source.size
        assert decoded.getchannel("A").tobytes() == source.getchannel("A").tobytes(), "Alpha changed"
        if lossless:
            assert decoded.tobytes() == source.tobytes(), "Lossless image changed"
        self.counts["lossless" if lossless else "lossy"] += 1
        self.counts["alpha_verified"] += 1
        return encoded


def repack_glb(data, encoder):
    source, binary = read_glb(data)
    document = copy.deepcopy(source)
    images = document.get("images", [])
    if not images:
        return data
    protected = set()
    for material in document.get("materials", []):
        slots = [material.get("normalTexture"), material.get("occlusionTexture"),
                 material.get("pbrMetallicRoughness", {}).get("metallicRoughnessTexture")]
        for slot in filter(None, slots):
            texture = document["textures"][slot["index"]]
            if "source" in texture:
                protected.add(texture["source"])
    replaced = {}
    image_views = {image["bufferView"] for image in images}
    for index, image in enumerate(images):
        view = image["bufferView"]
        lossless = index in protected or bool(DATA_NAME.search(image.get("name", "")))
        # If aliases share an image buffer, the strongest preservation policy wins.
        lossless = lossless or any(other["bufferView"] == view and
                                  (i in protected or DATA_NAME.search(other.get("name", "")))
                                  for i, other in enumerate(images))
        if view not in replaced:
            replaced[view] = encoder.encode(view_bytes(source, binary, view), lossless)
        image["mimeType"] = "image/webp"
    rebuilt = bytearray()
    for index, view in enumerate(document["bufferViews"]):
        rebuilt.extend(b"\0" * (-len(rebuilt) % 4))
        payload = replaced.get(index)
        if payload is None:
            payload = view_bytes(source, binary, index)
        view["byteOffset"], view["byteLength"] = len(rebuilt), len(payload)
        rebuilt.extend(payload)
    document["buffers"][0]["byteLength"] = len(rebuilt)
    for texture in document.get("textures", []):
        if "source" in texture:
            texture.setdefault("extensions", {})["EXT_texture_webp"] = {"source": texture.pop("source")}
    for field in ["extensionsUsed", "extensionsRequired"]:
        if "EXT_texture_webp" not in document.setdefault(field, []):
            document[field].append("EXT_texture_webp")
    output = write_glb(document, bytes(rebuilt))
    verified, verified_binary = read_glb(output)
    # Geometry, UVs, transforms, materials, native extras and animation are not optimized.
    for index in range(len(source["bufferViews"])):
        if index not in image_views:
            assert view_bytes(source, binary, index) == view_bytes(verified, verified_binary, index)
    for field in ["accessors", "nodes", "meshes", "materials", "animations", "scenes", "scene", "extras"]:
        assert source.get(field) == verified.get(field), f"GLB {field} changed"
    return output


def rewrite_runtime(text):
    # Every standalone PNG in these two game namespaces gets a WebP counterpart.
    # This also covers dynamically assembled atlas paths such as name + '.png'.
    text = text.replace(".png", ".webp")
    return re.sub(r"([?&]v=)[A-Za-z0-9_-]+", rf"\g<1>{VERSION}", text)


def rewrite_json_refs(value):
    if isinstance(value, str):
        return rewrite_runtime(value)
    if isinstance(value, list):
        return [rewrite_json_refs(item) for item in value]
    if isinstance(value, dict):
        return {key: rewrite_json_refs(item) for key, item in value.items()}
    return value


def build():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    destination = (ROOT / ".pages-dist").resolve()
    cache = ROOT / ".pages-cache"
    assert destination.parent == ROOT and destination.name == ".pages-dist"
    if args.verify_only:
        verify(destination)
        return
    cache.mkdir(exist_ok=True)
    if destination.exists():
        # Only this fixed, generated staging directory may be replaced.
        assert (destination / "asset-compression.json").is_file(), "Not a generated Pages directory"
        shutil.rmtree(destination)
    destination.mkdir()
    (destination / "asset-compression.json").write_bytes(compact({"version": VERSION, "in_progress": True}))
    encoder = Encoder(cache)
    paths = subprocess.check_output(["git", "-C", str(ROOT), "ls-files", "-z"]).decode().split("\0")
    videos = json.loads((ROOT / "wheel/assets/presentation/screens/videos.json").read_text())
    obsolete = set()
    for name, entry in videos.items():
        if entry.get("alpha") and entry["url"].endswith("-alpha.mp4"):
            replacement = ROOT / "wheel" / entry["url"]
            assert replacement.is_file(), f"Missing replacement {replacement}"
            obsolete.add(f"wheel/assets/presentation/screens/{name}.mp4")
    protected_urls = set()
    materials = json.loads((ROOT / "wheel/assets/presentation/materials.json").read_text())
    for material in materials.values():
        for role, texture in material.get("textures", {}).items():
            if role in ["dark", "gloss", "bump", "normal"] and texture and texture.get("url"):
                protected_urls.add("wheel/" + texture["url"])
    report = dict(version=VERSION, policy=POLICY, quality=85, source_bytes=0,
                  excluded_video_bytes=0, excluded_videos=[], png_bytes=0, webp_bytes=0,
                  glb_source_bytes=0, glb_output_bytes=0, json_source_bytes=0, json_output_bytes=0)
    for number, relative in enumerate(filter(None, paths)):
        if relative.startswith((".git", "tools/")) or relative in ["COMPRESSION.md"]:
            continue
        source = ROOT / relative
        if not source.is_file():
            continue
        data = source.read_bytes()
        report["source_bytes"] += len(data)
        if relative in obsolete:
            report["excluded_videos"].append(relative)
            report["excluded_video_bytes"] += len(data)
            continue
        target = destination / relative
        game = relative.startswith(("wheel/", "jeopardy/"))
        if game and source.suffix == ".png":
            # Preserve text-heavy atlases and data maps; world-color art uses q85.
            lossless = ("/materials/" not in relative or relative in protected_urls or bool(DATA_NAME.search(source.stem)))
            if source.name in ["game_logo.png", "user-clue-background.png"]:
                lossless = False
            encoded = encoder.encode(data, lossless)
            report["png_bytes"] += len(data)
            report["webp_bytes"] += len(encoded)
            data, target = encoded, target.with_suffix(".webp")
        elif game and source.suffix == ".glb":
            report["glb_source_bytes"] += len(data)
            data = repack_glb(data, encoder)
            report["glb_output_bytes"] += len(data)
        elif source.suffix == ".json":
            report["json_source_bytes"] += len(data)
            original = json.loads(data)
            references = game and ("/assets/presentation/" in relative or source.name == "manifest.json")
            value = rewrite_json_refs(original) if references else original
            data = compact(value)
            if not references:
                assert json.loads(data) == original
            report["json_output_bytes"] += len(data)
        elif (game and source.suffix in [".js", ".mjs", ".css", ".html"]
              and not any(part in relative for part in ["/vendor/", "/tools/", "/tests/"])
              and not source.name.endswith(".test.mjs")):
            data = rewrite_runtime(data.decode("utf-8")).encode("utf-8")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        if number % 100 == 0:
            print(f"Built {number} tracked paths", flush=True)
    report.update(encoder.counts)
    report["source_commit"] = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"]).decode().strip()
    report["published_bytes"] = sum(p.stat().st_size for p in destination.rglob("*") if p.is_file())
    # Iterate once so the small public report's size is included in the total.
    public = destination / "asset-compression.json"
    public.write_bytes(compact(report))
    report["published_bytes"] = sum(p.stat().st_size for p in destination.rglob("*") if p.is_file())
    public.write_bytes(compact(report))
    (ROOT / ".pages-build-report.json").write_bytes(compact(report))
    verify(destination)
    print(json.dumps(report, indent=2), flush=True)


def verify(destination):
    report = json.loads((destination / "asset-compression.json").read_text())
    assert len(report["excluded_videos"]) == 18
    for relative in report["excluded_videos"]:
        assert not (destination / relative).exists()
    for game in ["wheel", "jeopardy"]:
        assert not list((destination / game / "assets").rglob("*.png"))
        for path in (destination / game).rglob("*.glb"):
            document, binary = read_glb(path.read_bytes())
            if document.get("images"):
                assert "EXT_texture_webp" in document["extensionsRequired"]
            for image in document.get("images", []):
                assert image["mimeType"] == "image/webp"
                assert view_bytes(document, binary, image["bufferView"])[8:12] == b"WEBP"
        for path in (destination / game).rglob("*.json"):
            json.loads(path.read_bytes())
    videos = json.loads((destination / "wheel/assets/presentation/screens/videos.json").read_text())
    assert all((destination / "wheel" / entry["url"]).is_file() for entry in videos.values())
    print("Verified WebP GLBs, unchanged geometry, minified JSON and all 18 replacement videos", flush=True)


if __name__ == "__main__":
    build()
