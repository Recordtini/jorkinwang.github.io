# Nickelodeon Rust ports

Current priority: **Hey Arnold! Runaway Bus**. The native Rust/WASM build is playable; fidelity review is still in progress. Fairly OddParents code and recovered assets are retained, but it is not the current release priority.

## Play locally

```sh
python3 tools/serve.py
```

Open `http://127.0.0.1:8765/runaway-bus/`. The checked-in `web/engine.wasm` includes the assets and needs no Flash, Shockwave, Director, or network game service. Serve over HTTP rather than opening the HTML through `file://`.

- Arrows or WASD: drive; Down brakes and then reverses.
- Space: powerslide.
- C: camera; B: recover; Tab: optional map.
- Escape/P: pause; M: mute; F1: options; F11: fullscreen.
- Browser controller: triggers accelerate/brake, stick/D-pad steer, X/RB powerslide, Y camera, Start pause, A confirm. D-pad navigates menus.
- Touch buttons appear on touch devices.

## Accuracy: evidence versus reconstruction

| Part | Evidence and current implementation |
|---|---|
| Artwork and orange Nickelodeon logo | Exported from the original Director bitmaps. Compressed RGB555 row planes are decoded correctly; no generated replacement logo. |
| City, bus, props, characters | Original 3DGM model files decoded by the Rust renderer. Six original city sections and their original placement scale. |
| Sounds | All 26 Runaway Bus sounds exported from the original cast members. |
| Roads, tomatoes, props and targets | Original obstacle-list data. Selection rules are translated from recovered Lingo. Random selection uses a different generator. |
| Driving | Original bicycle-force equations and saved mass/throttle/grip/drag/time-step parameters. The first four straight-line samples match the original attract recording's speed to its recorded precision and its rounded X/Y positions. This does not establish full handling parity. |
| Missions | Runaway, Crazy and Cruise rules implemented from the original game-control scripts, including clock pickups, tomato counts, next-stop screens and scoring. A full manual win and full side-by-side comparison are still outstanding. |
| Contacts, grounding and camera | Original five-corner sweeps, impulse/restitution rules, terrain pitch/roll, jump equation, and chase-camera rules translated to Rust. Triangle queries replace Groove; contact tolerances and moving-actor contacts still need original-executable comparison. See `HANDLING.md` and `FIDELITY.md`. |
| Character animation | Original tracks and hierarchy, with reverse-engineered model-format and coordinate conversion. Poses still need wider comparison against the original executable. |
| Menus and legacy backend | Rust menus using original title/button artwork. Retired online/account/score services are replaced with device-local scores. This is not pixel-for-pixel UI parity. |

Modern additions include scalable display, optional widescreen and filtering, frame interpolation, controller/touch input, focus-loss pause, local settings and scores, bounded replays, and recover controls. Keep these distinct from original-behavior claims.

## Build

Rust 1.88+ and the `wasm32-unknown-unknown` target are required. Cargo.lock pins dependencies; development used Rust 1.99.1. Native Linux audio requires ALSA development libraries (`libasound2-dev` on Debian/Ubuntu).

```sh
rustup target add wasm32-unknown-unknown
python3 tools/build.py --native --package
```

The script runs the Rust tests, builds WASM, refreshes the matching Macroquad JavaScript runtime, and creates `dist/nick-games-web.zip`. `--native` also creates `target/release/nick-rust` (Runaway Bus by default). The browser JavaScript contains device/storage/lifecycle glue; the game rules and rendering are Rust.

After re-exporting the original loose assets, install Pillow and run `python3 tools/test_extract.py`. The packed assets are already included, so normal builds do not need Pillow, ProjectorRays, the Windows executables, or the extraction tool checkouts.

## Site integration

The web archive contains a relative-path-safe `nick-games/` directory. Copy it into the site repository and link to `nick-games/runaway-bus/`. Do not replace the site's existing root index or the Supersonic RC runtime. The preview is published under Stuff on jorkin.wang.

`tools/extract.py` can regenerate the exported assets from ProjectorRays chunk dumps in the sibling `originals/` directory. `reference/runaway-bus/` contains the recovered Lingo and disassembly used for review. `assets/*/manifest.json` records original movie hashes and member inventories.

See `THIRD_PARTY.md` for original-material provenance and runtime notices. The pre-release archive also contains the provisional Fairly OddParents build; it should not be presented as fidelity-complete.
