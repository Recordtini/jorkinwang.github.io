# Wheel of Fortune 3D

A static browser game for the `wheel/` directory on jorkin.wang. No backend,
API key, CDN, or build step is needed by the deployed game. Three.js is vendored
and assets load relative to this directory.

## Play

Choose a set and solo or local three-player mode. Spin, select
consonants, buy vowels for $250, and solve. Round earnings become banked winnings
only when a player solves. Four rounds lead to the original bonus wheel and a 30-second bonus puzzle with
RSTLNE plus three consonants and one vowel. Jackpot, Mystery, Free Play, Bankrupt,
and Lose a Turn are supported. Reloading offers a saved-game resume button.

Studio, Puzzle, Wheel, and Explore cameras are available. Explore supports drag,
scroll, and touch. Backstage switches sets and offers a viewer for recovered
set props and an audio library for all 36 original tracks. Assets are loaded on demand. Player bodies and character creation are
intentionally omitted.

## Recovered Sources

- All 8,976 puzzles, including 1,122 bonus puzzles, preserving the original four
  rows of 14 characters and category labels.
- All previously converted set/prop GLBs, excluding the duplicate New York debug
  export and including the empty player-library scene records.
- Music and sound effects from the two FSB4 banks, transcoded to browser MP3.
- Scene actor records and spin settings from the `.scx` files.
- `assets/source-catalog.json` records SHA-256 and size for every source file,
  including the executable, shaders, movies, and animation resources.

The web gameplay is new JavaScript. The PS3 executable, Flash UI logic, networking,
and platform shaders are not executed in the browser. Dynamic wheel, letters,
and score displays use CanvasTexture on recovered meshes. Retail skeletal clips
and cinematic sequences are not played.
Lighting uses browser lights and the converted material maps; it is not a
verified reproduction of the retail renderer. The original camera records are
preserved inside the GLBs; gameplay cameras frame the recovered geometry.

`assets/manifest.json` lists packaged assets and conversion errors. This is an
independent fan recreation. Wheel of Fortune and the original game assets belong
to their respective owners. Three.js uses the included MIT license.

## Rebuild From This Workspace

From `E:\Python Projects\JEOPARDY`:

```powershell
.\.venv\Scripts\python.exe web-site\wheel\tools\build_assets.py
powershell -File web-site\wheel\tools\vendor_three.ps1
```

The extractor checks the decoded puzzle bank against the existing extracted
text before packaging it, copies the existing GLBs, and uses FFmpeg to transcode
the FSB4 audio. It does not modify the original dump or run character conversion.
For another checkout, pass `--workspace` with the directory containing the game
dump, `jeopardy/soe_decryptor.py`, and `wheel_of_fortune_glb/`. Vendoring requires
the pinned Three.js package from `package.json` to be installed first.

For a local preview, serve the repository root with an HTTP server, then open
`http://127.0.0.1:8127/wheel/`. ES modules need HTTP, not `file://`.

```powershell
py -3.11 -m http.server 8127 --bind 127.0.0.1 --directory web-site
node --test web-site/wheel/tests/*.test.js
```

See `TESTING.md` for the browser checks and remaining fidelity limitations.
