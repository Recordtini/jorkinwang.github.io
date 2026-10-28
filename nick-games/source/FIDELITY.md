# Runaway Bus fidelity audit

Runaway Bus is released as a playable source-backed Rust/WASM port. Release status does not certify full original-runtime parity.

## Evidence

Recovered original Lingo and bytecode are in `reference/runaway-bus/Internal`. The original 3DGM models, texture pixels, sprite glyphs, obstacle list and attract recording are embedded in `assets.pak`. The original Groove.x32 API descriptions can be extracted with `strings` from `../originals/stupor-highway/xtras/Groove.x32`; its descriptions confirm RotateObject yaw/pitch/roll, AlignObject relative offsets, CollidePoint segments, and FindNearestObject group filtering.

## Implemented and checked

- Original driving parameters, steering/reverse/powerslide rules, terrain probes, restitution, five contact probes, jump trajectory, chase camera and recovery history.
- All 9 mode/difficulty world combinations: roadblocks, ramps, timers, tomatoes, pedestrians, pursuers, target eligibility and target size. Cruise's menu selects Medium, as the source does.
- Characters: waypoint frame counters, looping/ping-pong, fleeing, nearest eligible relocation, reserved-character selection, boarding/exiting paths, original pose ranges. The extra skeletal basis rotation and wrong Euler axis order were corrected. The driver's seated pose is frame 2, or frame 67 for Grandpa.
- Sprite pickup query: nearest group-good object, strict 400-unit 3D distance, at most one queried object per frame. Scenery can mask a pickup. Tomatoes use their separate <300 horizontal Manhattan check before the bus's movement sample.
- Static and moving meshes share renderer transforms. Concave city polygons retain their boundaries; tests compare triangulation area for every original city polygon and verify open cutouts in both windings.
- Mission destination exclusion, original time-limit and bonus formulas, target-ground contact and complete-stop arrival, win/loss movement and camera, initial instruction wait.
- HUD: original glyphs and portrait images, score/tomato/speed/timer positions, 60-tick time display, center message wrapping, temporary tomato/location/stop messages, original camera-relative 3D compass model.

48 Rust checks pass, including the original attract recording's first four straight-line speed/position samples. Native and WASM builds are checked. Browser checks cover menus, Runaway driving across the former curb trap, capture/end transition, corrected Arnold/Gerald seated poses, and the Cruise destination screen. A full manual win and mission cycle still require playing comparison.

## Known issues and remaining comparisons

- Fixed a confirmed cause of prop phasing: collision import discarded the original invisible `empty` faces. Those faces form collision hulls on hydrants, trashcans, cones, mailboxes, benches and roadblocks. They now participate in contact queries while remaining invisible. Regression tests cover 100 off-center driving approaches through five original prop models at four rotations, breakable slowdown and collider removal, plus the low gap in both roadblock models. The old importer fails the new prop test. Thin objects without these authored hulls still use the original five driving probes; full original-runtime contact-frequency comparison remains outstanding.
- No original Shockwave runtime is running in this environment (Wine is absent). Groove edge tolerances, simultaneous-hit ordering, animated interpolation and exact moving-object query semantics need original-runtime comparison.
- The native random generator is a replacement, so randomized positions and character choices will not reproduce Director's random stream for a given seed.
- Some original styled instruction/score text uses the port's fallback font. Original glyph-based game HUD and menu buttons use the original images; styled-page font/layout parity remains incomplete.
- Retired online score/account services are replaced with named device-local scores. This is an intentional modern replacement.
- Breakable-prop tumble speeds and small random velocity variations still use simplified effects; these are not verified against the original.
- Original online replay/backend and editor-only/debug behavior are outside the playable-game comparison.
- The Fairly OddParents game remains provisional and is not represented as fidelity-complete.

The original user-priority order remains: characters, pickups, geometry, mission flow, original-engine comparisons, then remaining menu details and the second game. A source test proves its stated case, not every possible playthrough.
