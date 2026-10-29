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

The Rust suite passes all 78 checks; native and WASM release builds and Clippy with warnings denied pass. Ten new regression tests cover throttle/boost, angular cap, flight trajectory and landing grace, launch multipliers, wall impulse and damping, ground clearance, sound selection/gain and Timmy's authored pose transitions. They run alongside the existing Arnold/audio/extraction checks.

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

## Menus and completion pass

- Recovered NickFOP menu/instruction strings from the original XMED text runs. Menus now draw the original letter sprites instead of the system font, with native 147×34 button bitmaps, authored centers, wording and 70% inactive lettering. Title, mode, players, difficulty, pause and end menus use gMenu positions. The animated original 3D logo is aligned to the menu camera.
- Added the skippable opening instructions, Ready/Set/Go sequence, source chase distances and field of view, first-person camera, end pan, and randomized trackside replay cameras. The optional overhead camera remains a modern enhancement.
- Added Timmy's win and alternating loss-loop animations, continuing end motion, hover landing/crash bounce, and speed-dependent normal/turbo trails. Replay frames preserve actor pose, bounce, boost and surface state. End sounds use one-shot voice playback, with no invented looping win/lose music.
- Corrected the zero-speed reverse transition, Up/Down precedence, low-speed pivot timing and airborne input handling. Turbo guarantees at least 100 ticks rather than resetting to 200. Pickups use the source pre-drive 2D Manhattan range plus independent height check; non-email pickups can revive three times. Recovery searches recorded road history rather than teleporting to the nearest track point.
- Original instructions are readable with the recovered wording; the retired Flash help layout and online score service are replaced by bitmap help pages and device-local named scores. Phone Options intentionally uses larger browser controls. Shared high-DPI viewport conversion keeps HUD and input aligned.

Six additional regression checks cover original glyph availability/button dimensions, pickup range boundaries, end animations, bounce, camera distances and reverse transitions. Native/WASM builds, Clippy with warnings denied, and five extraction checks pass. The full-track automated Timmy driver still completes the circuit in 114.25 simulated seconds with eight contacts.

## Comparison limits

This is source-backed implementation, not a certification of pixel/frame-perfect original-runtime behavior. The original Shockwave runtime is unavailable here. Hard-mode racer ramp/blocker edge cases, collision query precision, original random-stream results, camera renderer conventions and Flash help-page styling still need direct comparison with the original. The source attract recording uses a different ground/body height from the recovered track/equipment configuration; its version/configuration mismatch is not resolved by changing the track. Modern browser controls, optional cameras and device-local scores are deliberate enhancements/replacements.

## Trail, motion and depth follow-up

- Fixed an extra 100× trail scale: Director scale 240 is 2.4 in the native model matrix. Speed still controls trail length with the original `(speed-50)/350` clamp; boost selects the original turbo texture.
- Camera now advances alongside every simulation step, including catch-up frames, and shares the simulation interpolation fraction. Camera, position, pitch, roll, hover bounce and opponent orientation interpolate consistently. Pausing preserves the fraction instead of snapping backward. Menu cameras use their own interpolation clock; trackside camera changes cut between stations. Opening camera distance now uses the original 10000 units.
- Shadows, trails and particles draw after opaque world/player geometry with depth testing enabled and depth writes disabled. Particles sort back to front. The far plane uses NickFOP's authored 200000-unit range.
- Bot speed, acceleration and difficulty constants remain source values. Optional **Opponent pace: RELAXED** scales speeds and acceleration to 75%, is reversible, persists as a browser preference, and marks runs as practice. Original pace remains the default and Original defaults restores it. This is an enhancement, not an inferred correction to the original AI.

Regression checks cover trail percent scale, speed-length limits, rotated mounting offset, authored opening camera distance, replay camera cuts and reversible practice pace. Browser checks exercised a first-ramp jump, the restored trail and the practice flag. These checks do not certify every possible transparent-model intersection or original-runtime AI lap time.

Removed the optional Extra map/Minimap toggle from desktop and phone Options at the user’s request; the original HUD map remains.
