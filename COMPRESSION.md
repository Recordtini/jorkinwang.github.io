# Pages Asset Build

The tracked recovered assets are the originals. GitHub Actions runs
`python tools/build_pages.py` and publishes only `.pages-dist/`.

Requires Python 3.12+ and Pillow 12.3.0. The fixed generated staging directory is
replaced on repeat builds; source files are never overwritten. `.pages-cache/`
caches content-addressed WebP encodes and is not published. No history rewrite is
needed, and optimizing deployment does not remove older Git objects.

## Image Policy

- Color/world textures inside the GLBs use lossy WebP quality 85, as approved.
- Normal, roughness, occlusion, lighting/dark/gloss and shadow maps stay lossless.
- Standalone text/UI atlases remain lossless; color material art, the clue
  background and screen poster use quality 85.
- Every encoded image is decoded and checked for identical dimensions and exact
  alpha. Lossless images also require identical RGBA bytes. Nothing is resized.
- GLBs use the vendored loader's `EXT_texture_webp` support. Only image payloads,
  image MIME types, texture extension declarations and buffer offsets change.
  Every non-image bufferView and the original nodes, accessors, meshes, materials,
  animations and native extras are verified unchanged.
- Standalone PNG references, including dynamic paths, become WebP only in staged
  game runtime copies. Module/resource version queries are updated together.

## Video And JSON

The 18 old color-only MP4s are excluded only when the catalog selects an existing
packed-color-plus-alpha replacement. The `-alpha.mp4` files are kept, unchanged.
They contain both RGB and alpha side-by-side, not just masks. The poster is retained
as WebP. No video or audio is re-encoded by this build.

All staged JSON is compacted without reducing numeric precision. The review pages,
datasets, RC Car and legacy `dicks.html` remain present; the latter is not replaced
by the separate 3D game.

## Checks

```powershell
python -m unittest discover -s tools -p "test_*.py"
node --test jeopardy/game.test.mjs wheel/tests/*.test.js
python tools/build_pages.py
python tools/build_pages.py --verify-only
python -m http.server 8092 --bind 127.0.0.1 --directory .pages-dist
node jeopardy/tools/browser_qa.mjs
node tools/compression_qa.mjs
```

`asset-compression.json` in the published site records source commit, policy,
quality, preserved-alpha checks, exclusions and before/after byte totals.
The detailed local copy is `.pages-build-report.json`.
