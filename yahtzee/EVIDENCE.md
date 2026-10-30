# Ultimate Yahtzee Classic recovery

This is a playable single-player Classic, Triple and Painted preview, not a complete 1:1 port.
The original title artwork, Classic board, scorecard, dice and cup geometry,
textures, and UI resource layouts are used. Full original menu/dialog behavior,
other players and remaining modes, original audio behavior, and pixel-identical rasterizing
remain unfinished. Some original menu commands are disabled until recovered.

The runtime is Rust compiled to WebAssembly, with browser input and WebGL drawing.
It does not run the original executable or use Wine. The x86 originals were run
only in an offline reference harness to produce the included test fixtures.

## Lighting evidence

Classic initialization `004013d0` creates three directional lights. The dice
model sets vertex sampling and lit textures. RenderWare's `1002c480` averages
adjacent polygon surface coefficients; `1001ae70`, `1000cbd0`, `1000c950` and
`1000dd20` supply fixed-point matrix inversion, light transformation, vertex
lighting and the specular lookup. The port in `engine/src/lighting.rs` matches
2,048 original normal/material cases and 315 matrices from original dice rolls,
both as native Rust and as WASM. The original 16-bit textured rasterizers read
texture and lighting without the extra material-color multiplication previously
added in the preview. WebGL interpolates these verified vertex values; exact
pixel-level rasterization and a visual comparison with a running original have
not been established.

## Cup interior

The original `CLASCUP.RWX` assigns the dark `MatBlack` texture to 23 inner
wall triangles, but assigns `C_CLSBT1` (the cup-bottom texture) to the adjacent
triangle `48 37 36` at line 164. The original assignment is retained. The lining,
bottom and exterior PNG pixels match their original BMPs. Hashes and results
are recorded in `evidence/cup-culling.json`.

The original `RWX20.DLL` draw path at `1002cee0` uses `10047000` to cull back
faces for these default materials. The browser now enables back-face culling;
1,000 nondegenerate screen-space triangles were checked against the original
predicate. This does not establish pixel-perfect equivalence to retail.

The local pending resize update renders 3D geometry at the displayed device-pixel
size subject to WebGL limits, retaining original 640-by-480 game coordinates.
The original 2D artwork remains pixelated. Rendering at higher resolution is a
requested web enhancement and is not a claim of retail pixel equivalence.

## Gameplay evidence

Triple uses the original `ETRIPL16.RLE` decoded board frames and `TRPTOP`,
`TRPRIGHT`, `TRPBTM`, `DIE.RWX` and `DICECUP.RWX` assets, with camera 0 from
`00402b00`. The original `00402d40` specifies rectangular limits and a die
friction coefficient of 0.88. `0040b610` was compared over 1,375 boundary cases;
four rolls from the Triple pickup position were compared across 776 frames to
the original physics and published transforms. A 39-turn game was completed
through browser controls, and a Rust game test also holds and releases dice.
The original 307 column-choice dialog is used for category-label clicks.
Original multiplayer/AI, full UI/audio behavior, every possible state transition,
and visual equivalence to the running original are not established.

## Sound recovery

The original floor, wall and dice-impact sample choices and volumes are derived
from `004113a0`, `0040c1c0`, `0040c440` and `0040bd30`; eight original roll
traces exercise the event stream and volume values. Cup shaking uses the original
`BAT_C1` or `BAT_C2` sounds, selected by the number of dice, as in `00417650`;
holding and score selection use the mode's click sample, and five of a kind
plays `YAHTZEE.WAV`. The original title sound and mode-specific short music loops
are present. Browser tests exercised playback, volume events and the sound-effects
setting. Browser audio mixing and every original UI/audio transition remain
unverified, and the original CD music tracks are not present in this copy.

The original `004113a0` processes all substeps for a die before advancing to
the next die, then dispatches that die's final substep's collision results.
The port now follows that order. Eight original-code roll traces with 1, 2, 3,
and 6 substeps per update match impact events and die positions/velocities at
504 update boundaries. Collision samples are decoded ahead of time and played
through Web Audio; separate measurements of the old media-element path showed
13–66 ms start delays in one browser roll. Exact Miles mixer/output equivalence
and listening comparison with the running original remain unverified.

Cup orientation now follows `00411f30`: rotate X by stored pitch plus 90 degrees,
then Y by negative yaw. The original pickup path `00411080` initializes pitch
to -60 degrees; resting pitch is -90. Thirty-five original RWX20 matrix cases
were checked against the Rust implementation. Initial and post-roll transforms
were also checked in actual WASM for both tables; original-window visual
equivalence is not established.

## Painted evidence

`0041b5d0` binds five different die-face color tables. The Rust labels and
color-category scores were checked against original `00412a20` for all 7,776
ordered hands. All 30 source face texture names agree with those color tables.
Its rectangular arena boundary matches 1,375 original-code cases; four rolls
using its original bounds, pickup position and -0.7 dice restitution match
1,274 original-code frames. Its original camera, five dice meshes, cup,
scorecard, board frames, rack, and mode WAVs are used. Painted's directional
lights match 911 original RenderWare cases using rotating die matrices.
A 20-turn browser game was completed, with held dice and a reroll checked in
another game; a Rust test also completes all 20 categories with held rerolls.
Original UI transitions, multiplayer/AI, pixel rendering and visual/audio
comparison with a running original remain unverified or incomplete.

Four sets of three original rolls, including cup pickup and held dice, were
compared at 2,073 frames for physics and published transforms. Scoring is tested
against 2,706,048 original dispatcher calls, score mutations against 2,496 cases,
and the original random generator against 24,576 outputs. A 13-turn game was
completed through the browser controls. These tests do not prove every possible
game state or original UI transition.

Retail YAHTZEE.EXE SHA-256:
`96e8812e13fa8e440eb13b0d3e398e42e3bcfee2e73a1046142ca83701c50ef8`.
RenderWare RWX20.DLL SHA-256:
`92352af1f5d2236800ed819d13cc745ff1a544a2a28320d80c09aedb5a4ae7d4`.
No matching original PDB or COFF symbol table has been recovered; original RTTI,
virtual tables and exported library names are available.

Run the bundled Rust checks from the repository root with
`cargo test --manifest-path yahtzee/engine/Cargo.toml --lib`.
