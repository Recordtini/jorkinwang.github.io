# Wheel of Fortune 3D

A static browser game for the `wheel/` directory on jorkin.wang. No backend,
API key, CDN, or build step is needed by the deployed game. Three.js is vendored
and assets load relative to this directory.

## Play

Choose a set and one to three players. Each physical podium can independently
be Local, CPU, or Empty; presets include true single player with no opponents,
one local plus two CPUs, and three locals. Spin, select
consonants, buy vowels for $250, and solve. Round earnings become banked winnings
only when a player solves. Four rounds lead to the original bonus wheel and a 30-second bonus puzzle with
RSTLNE plus three consonants and one vowel. Jackpot, Mystery, Bankrupt,
and Lose a Turn are supported. Reloading offers a saved-game resume button.

Pat's prompts guide play. Solving fills only missing letter cells, with known
letters, punctuation, and numbers locked. Typing advances through the blanks;
arrow keys, backspace and paste are supported. Inactive podium displays and score
cards dim so the current player remains clear.

Automatic cameras cut between spins, letter selections, reveals and solves by default.
Regular spins use the active podium's original camera and cut closer to the
landed amount, holding it before letter selection. They do not interpolate.
Selecting Studio, Puzzle, Wheel, or Explore switches to manual; Backstage can
re-enable automatic cameras. Explore supports drag,
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
- Native Flash wheel artwork for all four played rounds, including vector dollar
  labels and external DDS glitter images, with sector values matching gameplay.
- Original green/white/blue board tiles and their transition frames, plus the
  embedded Swis721 BlkCn BT board font and Cosmos Medium category font.
- The original masked category-reveal timeline, including text-scale/alpha keys.
- All 37 base-scene cameras, 16 camera-role groups and 30 parent-controller
  tracks, including original positions, direction/up axes and frusta. Backstage
  provides an original-camera inspector.
- Original Bink logo, Jackpot, Mystery and fireworks movies, transcoded to MP4
  for the large/center monitors; small monitors retain their native texture art.
- Native NIF alpha flags for the base, all 11 sets and animated props, distinguishing opaque
  wheel steps from blended decorative blades. Blended surfaces do not write depth.
- Board sequencing ported from `doShowWhitePanels`, `doFindLetters`,
  `doShowFoundLetters` and `handlePuzzleSolved`: column-first opening at 50ms,
  blue matching tiles, then row-first letter reveals at 750ms intervals.
- `assets/source-catalog.json` records SHA-256 and size for every source file,
  including the executable, shaders, movies, and animation resources.

The web gameplay is JavaScript, with selected board behavior ported from the
recovered ActionScript. Flash/Scaleform bytecode and the PS3 executable are not
executed. `assets/presentation/source/` preserves the recovered root scripts;
`presentation.json` records decoded source hashes, frame indices, timing and
exporter version. Dynamic displays use CanvasTexture on recovered meshes.
Million, Wildcard and Free Spin collectible overlays use their native hidden
state because their complete inventory rules are not implemented. These are
not replaced by invented Free Play graphics. Toss-ups are still omitted.

Lighting uses browser lights and converted material maps, with planar floor
reflections over the original tile texture. The floor's baked dark map is no
longer used as full-strength AO, and baked backdrops do not receive a second
shadow from the overhead rig. This is not a verified 1:1 retail renderer.
The director uses recovered camera poses and wheel push-track endpoints; source
tracks are cataloged, not continuously played. The puzzle camera uses source FOV
with adapted framing to leave room for web controls, especially on phones.
Monitor movie selection is browser logic, not a verified retail state-machine
port. Retail skeletal clips and set-prop `.kf` animation tracks are not played.

`assets/manifest.json` lists packaged assets and conversion errors. This is an
independent fan recreation. Wheel of Fortune and the original game assets belong
to their respective owners. Three.js uses the included MIT license.

## Rebuild From This Workspace

From `E:\Python Projects\JEOPARDY`:

```powershell
.\.venv\Scripts\python.exe web-site\wheel\tools\build_assets.py
powershell -File web-site\wheel\tools\vendor_three.ps1
.\.venv\Scripts\python.exe web-site\wheel\tools\recover_presentation.py
.\.venv\Scripts\python.exe web-site\wheel\tools\recover_scene.py
```

The extractor checks the decoded puzzle bank against the existing extracted
text before packaging it, copies the existing GLBs, and uses FFmpeg to transcode
the FSB4 audio. It does not modify the original dump or run character conversion.
For another checkout, pass `--workspace` with the directory containing the game
dump, `jeopardy/soe_decryptor.py`, and `wheel_of_fortune_glb/`. Vendoring requires
the pinned Three.js package from `package.json` to be installed first.
Presentation recovery needs Java and the official JPEXS FFDec 26.3.0 portable
release at `wheel_web_tools/ffdec/ffdec.jar`, or an explicit `--ffdec` path.
`--java` selects a Java executable. It isolates FFDec settings inside this
workspace, decodes external DDS alongside each GFX, and exports native frames,
fonts and scripts without changing the original dump. `--reuse-exports` only
repackages a completed local extraction. FFDec is not shipped with the website.
Scene recovery uses the workspace NIF reader/PyFFI and FFmpeg. It writes
`cameras.json` with decoded source SHA-256, controller keys and material flags,
plus the browser screen movies and a native still fallback. `--skip-video`
rebuilds only the camera/material catalog. Source dumps and GLBs are untouched.

For a local preview, serve the repository root with an HTTP server, then open
`http://127.0.0.1:8127/wheel/`. ES modules need HTTP, not `file://`.

```powershell
py -3.11 -m http.server 8127 --bind 127.0.0.1 --directory web-site
node --test web-site/wheel/tests/*.test.js
```

See `TESTING.md` for the browser checks and remaining fidelity limitations.
