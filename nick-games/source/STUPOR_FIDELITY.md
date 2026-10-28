# Information Stupor Highway fidelity

The Timmy game is the active porting priority. It is playable, with the original 3DGM track, props, Timmy, opponents, textures and sounds. It is not yet represented as a completed 1:1 port.

## Gameplay pass

References: `reference/stupor-highway/Internal/MovieScript 9 - gHeroDrive parent.ls`, `MovieScript 1 - gameInfo.ls`, `MovieScript 7 - gGameControl parent.ls`, `MovieScript 15 - gSoundControl parent.ls`, and the original packed `foptrackpathdata` recording.

- Original hover coefficients: mass 6000, throttle 5000, drag 2, rolling resistance 30, front/rear stiffness -20/-20.3, wheelbase 4, inertia 2000, scale 80, gravity 45, time step .05. Fixed the angular acceleration cap to use Director rounding and the sign helper to return +1 at zero.
- Space applies 1.5x throttle and 10% tyre grip. A turbo pickup applies 2x throttle automatically. These are different actions; Space alone does not select turbo audio.
- Ground queries use the source 600-unit radius (four times the 150-unit hover height), body clearance from the original collision range [100,100,50], terrain pitch/bank and sideslip roll. Pose pitch and roll clamp to ±20 degrees.
- Jumps use the analytical trajectory, five-frame landing grace, slope/ramp launch multiplier and 3000-unit cap. Added source crest/drop launch checks, overhead clearance and one-degree air steering with post-impact suppression.
- Five collision probes now use both previous and current yaw/pitch/roll, the original 50-unit lead and normalized lever arm. Contact response uses terrain restitution .9, prop restitution 0, .8 damping, source speed cap and one retry after recalculating the pose. Finish/ramp/rope textures retain their source exclusions.
- The shipped NickFOP configuration enables `gNoDamage`; removed the port's extra racer-contact damage. Start difficulty is 3 as in gameInfo. Race/Medal/Trial obstacle filters remain in the port.
- Engine audio now resolves the original sound aliases: no idle member exists, so stopped Timmy is silent; moving uses hoverengine and a live turbo pickup selects turbo. Jump and landing sounds use the hero-effect channel and camera-distance gain instead of being cut off by engine updates. Source camera gain is max(10, min(255, 255-255*ManhattanDistance/90000)-100)/255.
- Timmy uses the original idle, left/right entry and looping turn, return, and landing frame ranges, driven by simulation ticks and preserved in replay frames. The former frozen landing-frame pose during all jumps was removed; source jump animation falls back to idle frames 5–40.

## Validation

The Rust suite passes all 68 checks; native and WASM release builds and Clippy with warnings denied pass. Ten new regression tests cover throttle/boost, angular cap, flight trajectory and landing grace, launch multipliers, wall impulse and damping, ground clearance, sound selection/gain and Timmy's authored pose transitions. They run alongside the existing Arnold/audio/extraction checks.

Browser verification loaded the rebuilt WASM, started Time Trial, drove over the first ramp and back onto the track, and checked pause/resume. Browser telemetry confirmed live acceleration, ramp/road surfaces, pickup scoring and gameplay sound-channel selection.

The headless driver completed the full original collision circuit in 114.30 simulated seconds, with eight contacts and no fall. This is a navigability check using an automated driver, not an original-runtime lap-time claim. The probe's steering controller was corrected to account for the game's coordinate convention.

## HUD and opponents pass

- Replaced HUD approximations with the original center coordinates from `initOverlays`: clock (20,38), rank (20,85), best lap (20,132), lap (20,180), score (540,20), and HUD plate (40,90). Glyphs use Director integer half-width advances and the original eight-character overlay limit. Score displays its numeric value without invented leading zeroes. Time retains 60 ticks per second and the original long-time layout.
- Track overlay uses the original centered bitmap at (40,260), red/green radar sprites with 70% blend, and source map projection. Removed substitute circles and the invented persistent email counter. Mission, email-rescue, wrong-way and lap-bonus messages use original glyphs and wrapping.
- Racers get their own ±1000-unit randomized track points, source difficulty-specific acceleration ranges (10–13, 12–17, 15–20), start/max speeds, angleRange steering, turn slowdown and banking. They no longer snap onto waypoints.
- Added original 20-unit axis contact probes, material-specific slowdown, analytical jumps, shadow-derived terrain pose, chomp frames 1–19, and finish/braking behavior. Track progress uses the original five-neighbor window for racers and eleven-neighbor window for Timmy; finish textures and lap counters replace an invented finish-plane crossing. Ranking uses lap, target point and 2D Manhattan distance, including start-line wrap handling.
- Added moving original box proxies at 4x/4x/2.5x racer scale. Hero contact uses racer velocity divided by four in the source relative-velocity impulse and returns the impulse to the racer. Removed the old proximity-triggered 40% slowdown.
- Timewarp resets racer speeds to 10 once, then their normal acceleration resumes. The previous 200-frame forced slowdown is removed. An opponent passing Timmy plays the original laugh. Replay frames preserve racer animation, banking and progress state.
- Corrected final-lap clock/bonus behavior: only intermediate laps reset the clock and earn the time bonus. Medal completion/loss waits until Timmy is grounded, matching the original mission check.

The updated source-progress driving probe also completes Timmy’s circuit and triggers the original texture-based finish check (114.25 simulated seconds, eight contacts).

Ten additional regression tests cover HUD centers/clock/glyph spacing, per-racer initialization, steering/acceleration, wall probes, jumps, progress/ranking, moving proxies, relative contact impulse and Timewarp recovery. Full-track simulations finish all five racers on Easy and Medium. With the tested Hard seed, four finish and one follows its randomized lane past the first ramp and is blocked by the stop wall. The diagnostic traces this route and contact; no invented obstacle avoidance or teleport is added. Exact original-runtime behavior for this seed/edge case remains unverified.

## Remaining port work

- Original menus, camera paths/transitions, win/loss animations and complete replay presentation still need dedicated source reconciliation.
- Power-up collection still uses the port's swept-distance check rather than the original per-frame 2D Manhattan/height check. Placement and repeat-collection limits need full audit against `addObstacles` and `dead`/`revive` (the original allows three revivals for non-email power-ups).
- Input stop/reverse transitions, sub-threshold motion, airborne throttle, exact query edge behavior and animation endpoint timing need further reconciliation. Hard-mode racer ramp/blocker interactions need comparison with the original running game. No original Shockwave runtime is available here.
- The supplied attract recording starts at a different ground/body height than the current recovered track plus equipment settings. Do not change the track height or certify matching playback based on that recording alone; the original running game is needed to resolve this version/configuration difference.
- Director's random stream and retired score/backend services remain replaced by the Rust RNG and device-local scores.
