# Original material and development references

The original **Hey Arnold! Runaway Bus** and **The Fairly OddParents: Information Stupor Highway** games, characters, logos, artwork, models, music, sounds, and recovered Director/Lingo scripts remain the property of their respective owners, including Nickelodeon and Ezone. This project does not grant a license to that material.

The supplied Windows executables and Director movies are source evidence. They are not executed by this port. The browser runs native Rust game logic compiled to WebAssembly, with a small JavaScript bridge for input devices, audio runtime support, browser lifecycle, fullscreen, and local storage.

Development references:

- [ProjectorRays](https://github.com/ProjectorRays/ProjectorRays), MPL-2.0, used externally to decompress Director files and recover source/chunk data. It is not linked into the game.
- [dirplayer-rs](https://github.com/igorlira/dirplayer-rs), GPL-3.0, consulted for Director bitmap layout and palette facts. Its runtime is not included or linked. The Macintosh palette is generated mathematically by the exporter.
- [3D-GM/Model](https://github.com/3D-GM/Model), MIT, consulted while investigating the Groove format. The port contains its own 3DGM parser.
- [Recordtini's Supersonic RC port](https://github.com/Recordtini/jorkinwang.github.io/tree/main/rccar), consulted for browser packaging and the earlier Shockwave-to-WASM approach. That repository's runtime is not copied into these games.

The runtime uses Macroquad 0.4.16 and Miniquad 0.4.11 (MIT/Apache-2.0 as specified by their packages), Serde and serde_json (MIT/Apache-2.0), and their Cargo.lock dependencies. `web/runtime.js` is Macroquad's official JavaScript bundle with a one-line declaration fixing its strict-mode quad-net registration. Dependency license files are copied into `web/licenses/` by `tools/build.py`.

`assets/*/manifest.json` records the SHA-256 of each original Director game movie and the exported members. `reference/` contains recovered original scripts for fidelity review. These files are preservation evidence, not newly licensed game code.
