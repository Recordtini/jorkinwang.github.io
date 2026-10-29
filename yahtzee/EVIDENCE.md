# Ultimate Yahtzee Classic recovery

This is a playable single-player Classic preview, not a complete 1:1 port.
The original title artwork, Classic board, scorecard, dice and cup geometry,
textures, and UI resource layouts are used. Full original menu/dialog behavior,
other players and modes, original audio behavior, and pixel-identical rasterizing
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

## Gameplay evidence

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
