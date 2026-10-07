# Wheel of Fortune 3D

A static browser game for the `wheel/` directory on jorkin.wang. No backend,
API key, CDN, or build step is needed by the deployed game. Three.js is vendored
and assets load relative to this directory.

## Play

Choose a set and one to three players. Each physical podium can independently
be Local, CPU, or Empty; presets include true single player with no opponents,
one local plus two CPUs, and three locals. Spin, select
consonants, buy vowels for $250, and solve. Round earnings become banked winnings
only when a player solves. The default eight-round format includes three toss-ups,
four regular rounds and the bonus round. Rules allow shorter matches, no toss-ups,
no bonus, and CPU difficulty selection. Jackpot, Mystery, Million Dollar,
Free Spin and Wild Card inventory are supported. Reloading offers saved-game resume.

Regular spins use the original two-press power meter: press Spin/Space to start
the meter, then again to spin. The recovered 30-fps meter drives browser spin
strength, distance and duration; this is not recovered PS3 rigid-body physics.
Toss-ups reveal individual tiles every second. Buzz in and fill missing letters;
a wrong answer locks that player out. Tied finalists play another toss-up.

Pat's prompts guide play. Solving fills only missing letter cells, with known
letters, punctuation, and numbers locked. Typing advances through the blanks;
arrow keys, backspace and paste are supported. The native white inward arrows
animate on the current player's podium; inactive podiums and HUD cards do not dim.

Automatic cameras cut between spins, letter selections, reveals and solves by default.
Regular spins use the active podium's original camera and cut closer to the
landed amount, holding it before letter selection. The bonus wheel also cuts
to its native detail camera on landing before returning to the puzzle. Its prize
stays secret until the end. These cuts do not interpolate.
Selecting Studio, Puzzle, Wheel, or Explore switches the current match to manual;
the visible Auto Cuts/Manual toggle or Backstage can re-enable automatic cuts.
New and resumed matches default to automatic, ignoring older sticky manual
preferences. Explore supports drag,
scroll, and touch. Backstage switches sets and offers a viewer for recovered
set props, 15 native help pages, and an audio library for all 36 original tracks.
Music has its own persistent toggle; Sound mutes the entire mix. Every file is
loudness-leveled with true-peak headroom, including library previews. Music and
effects share a compressor and a -1 dBFS sample ceiling. The mixer cannot control
speaker hardware volume. Music ducks under effects, with deeper reduction for
answer/result cues and lighter reduction for letter reveals. Overlapping cues
retain the strongest reduction until they end, then music recovers smoothly.
Wheel clicks and letter-selection ticks do not pump the music volume. These
mixing envelopes are browser-authored, not recovered PS3 mix parameters.
Per-tile letter dings follow the reveal timeline,
and wheel clicks follow peg crossings. Native no-more-vowels/only-vowels-remain
banners and cues check the remaining puzzle letters, not unused alphabet buttons.
Assets are loaded on demand. Player bodies and character creation are
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
- Native podium colors/body artwork, Univers ExtraBlack score glyphs with their
  original shadow/glow, character spacing, blank zero scores, staggered score
  changes, final-score effects, looping turn arrows, Bankrupt and Lose a Turn.
  Original 1024x512 atlas UVs are retained. This game's podium movie has no
  player-name field, so names remain in the web HUD rather than replacing body art.
- All 37 base-scene cameras, 16 camera-role groups and 30 parent-controller
  tracks, including original positions, direction/up axes and frusta. Backstage
  provides an original-camera inspector.
- Original Bink logo, Jackpot, Mystery and fireworks movies, transcoded to MP4
  for the large/center monitors; small monitors retain their native texture art.
- Native NIF alpha, depth and face-culling flags for the base and all 11 sets,
  distinguishing opaque wheel steps from blended decorative blades. Blending
  preserves the source depth-write state, preventing floor-layer bleed-through.
  Emissive columns remain solid depth-writing geometry; glow filenames no longer
  override their native occlusion state.
- Original RGB baked dark maps with the compact TexDesc UV indices, not grayscale
  glTF AO. Native alpha is retained. Reserved characters in GLTF node names are
  normalized for source-property/controller lookup. Teal studio blades use a
  baked texture path rather than receiving an additional glossy PBR light layer.
  Embedded atlas decoding is scoped per NIF, since different studios reuse
  filenames for different images. Exported maps record dimensions and pixel hashes.
- All 30 set-prop KF clips, 328 controller links, native set-animation categories,
  and texture-transform/alpha playback on the nine recovered animated actors.
- All 18 native screen movies, native collectible wheel overlays, shell artwork,
  fonts, help pages, and the full GUI ActionScript control definitions.
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
`assets/presentation/podiums/` contains source-frame atlases, the embedded WOFF,
the root ActionScript and `podiums.json` with exact digit matrix/alpha keys.
Penalty effects stay on the outgoing physical slot and finish before input/CPU
handoff. These native Flash clips are driven by browser events; this is not a
verified reconstruction of every PS3-to-Scaleform command or callback.
Million, Wild Card and Free Spin use recovered wheel art and inventory rules.
Million has the Bankrupt side thirds, requires winning its round to keep it,
and replaces the $100,000 bonus prize. Free Spin can preserve a lost turn.
Wild Card permits an extra consonant or a fourth bonus consonant; that rule
is a browser reconstruction, not a verified native executable implementation.
Mystery's $10,000 is an unbanked prize until the round is won. Jackpot grows
once per spin and requires immediately solving after a correct Jackpot letter.

Lighting uses browser lights and converted material maps, with planar floor
reflections over the original tile texture. The floor's baked dark map is no
longer used as full-strength AO, and baked backdrops do not receive a second
shadow from the overhead rig. This is not a verified 1:1 retail renderer.
The director uses recovered camera poses and wheel push-track endpoints; source
tracks are cataloged, not continuously played. The puzzle camera uses source FOV
with adapted framing to leave room for web controls, especially on phones.
Monitor movies play once on presentation events, then return to the recovered
logo still. The 8.8-second logo intro no longer loops throughout play, and resume
does not replay it. Movie selection/timing is browser logic, not a verified retail
state-machine port. Native set-prop texture and alpha tracks play; the 60
transform-controller records in these clips contain rest poses, not keyed motion.
Skeletal actors are intentionally omitted. Road Trip's three-game shell flow,
PSN/network features, exact retail CPU/physics and the complete executable-to-GUI
command sequence are not ported. Lighting remains a browser approximation.

`assets/manifest.json` lists packaged assets and conversion errors. This is an
independent fan recreation. Wheel of Fortune and the original game assets belong
to their respective owners. Three.js uses the included MIT license.

## Rebuild From This Workspace

From `E:\Python Projects\JEOPARDY`:

```powershell
.\.venv\Scripts\python.exe web-site\wheel\tools\build_assets.py
powershell -File web-site\wheel\tools\vendor_three.ps1
.\.venv\Scripts\python.exe web-site\wheel\tools\recover_presentation.py
.\.venv\Scripts\python.exe web-site\wheel\tools\recover_podiums.py
.\.venv\Scripts\python.exe web-site\wheel\tools\recover_scene.py
.\.venv\Scripts\python.exe web-site\wheel\tools\recover_remaining.py --prepare-shell --collectibles --materials --power-meter --notices --mystery-wheel
.\.venv\Scripts\python.exe web-site\wheel\tools\normalize_audio.py
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
Podium recovery exports clips in the fixed root-stage coordinates rather than
resizing variable sprite bounds. It rasterizes the actual embedded score glyphs
with their original text filters, then crops the native cash-panel rectangles.
Scene recovery uses the workspace NIF reader/PyFFI and FFmpeg. It writes
`cameras.json` with decoded source SHA-256, controller keys and material flags,
plus the browser screen movies and a native still fallback. `--skip-video`
rebuilds only the camera/material catalog. Source dumps and GLBs are untouched.
Remaining recovery follows presentation/scene recovery and packages native
shell, movie, animation, material and meter data. Audio leveling retains the
unmodified extracted masters in ignored `qa/audio-original/`; rerunning does not
compound gain. `assets/audio/levels.json` records source/output hashes, measured
LUFS, true peaks and applied gains. Transient-heavy cues can remain below the
loudness target when more gain would exceed peak headroom.

For a local preview, serve the repository root with an HTTP server, then open
`http://127.0.0.1:8127/wheel/`. ES modules need HTTP, not `file://`.

```powershell
py -3.11 -m http.server 8127 --bind 127.0.0.1 --directory web-site
node --test web-site/wheel/tests/*.test.js
```

See `TESTING.md` for the browser checks and remaining fidelity limitations.
