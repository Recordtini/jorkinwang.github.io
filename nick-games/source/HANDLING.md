# Runaway Bus handling audit

The handling pass is based on recovered Lingo, rather than tuning by feel. Main references are `Internal/MovieScript 8 - gHeroDrive parent.ls`, `MovieScript 6 - camera parent.ls`, `MovieScript 11 - gObstacles parent.ls`, and the math helpers in `MovieScript 1.ls` under `reference/runaway-bus/` in the extraction workspace.

## Translated behavior

- Steering: original sign, joystick dead zone 0.3, no steering below the speed threshold, 260/speed clamped to 2–10 degrees, and reversed steering sign in reverse.
- Acceleration: original saved parameters, bicycle forces, drag, rolling/static resistance, original rounding of the difficulty-dependent angular acceleration cap. Space reduces both tyre forces to 10%.
- Braking/reverse: Down brakes forward motion, stops below speed 10, then changes direction with the original strict >30 Director-tick pause (input resumes on simulation frame 16 at 30 Hz). Up performs the inverse transition. Airborne controls cannot switch reverse.
- Contacts: five original bus corner rays, 100-unit lead, normalized impulse lever arm, restitution 0.5 against city geometry and 0.9 against solid props. Breakable props allow passage and multiply velocity by 0.8. Solid contacts do not receive that extra damping. Recalculate yaw after an impact changes angular velocity.
- Grounding: original probe heights, terrain-normal pitch/bank, sideslip roll, acceleration pitch, and body clearance adjustment.
- Jumping: source crest/drop trigger and overhead clearance check; original analytical trajectory `z = start + speed*t - gravity*scale*t*t`, rather than an approximate integrated fall.
- Camera: original 1000/700 chase distances, follows velocity direction, 20-unit minimum pan limit, speed+10 when faster, +50 in reverse, original obstacle lift equations and first-person offset. Camera movement updates at simulation frequency; optional render interpolation does not alter handling.

## Verification and remaining limits

Rust regression checks cover camera-relative left/right, stopping into reverse, 10% powerslide forces, terrain/solid/breakable speed ratios, airborne reverse lock and trajectory, and camera pan limits. The first four straight-line frames also match the original attract recording's rounded X/Y and speed to its stored precision. That recording does not include the input stream, so later steering cannot be used as a trustworthy input/output fixture.

The proprietary Groove collision engine has been replaced by native triangle segment queries. Exact edge tolerances, contact ordering and moving-actor interactions are not proven equivalent. Recovery now follows the original road-history search: discard twenty road samples, require 1000 units of Manhattan distance (or an early history record), restore the recorded orientation, and drop from the original 1000-unit height with a locked camera. Source equation agreement is not a claim of a complete side-by-side play verification. The user is doing play comparison. See FIDELITY.md for the current audit and unresolved limits.


## Collision/world correction pass

The full-height box sweep was removed: it stopped the bus against sidewalk edges below the original five probes. The real city regression now drives through that location in all nine mode/difficulty combinations. Roadblock90 uses its pre-rotated mesh without a second object rotation. Collision and drawing use the same subobject transforms and concave-polygon triangulation. The moving dozer collider follows the visible model; its attack/retreat, axis lookahead, capture and relocation rules now follow gObstacles. Cruise permits contact but cannot end in capture.

Runaway/Crazy/Cruise use the source obstacle filters and target sizes. Driving coefficients do not change with mode; difficulty affects the angular-acceleration cap. Character animation uses the model's Z-up hierarchy and Groove yaw/pitch/roll order (Z/X/Y), without the erroneous extra 90-degree basis rotation.
