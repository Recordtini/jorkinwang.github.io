# Verification

## Automated Checks

Run `node --test wheel/tests/*.test.js` from the site repository.
Current result: 63 passing tests. Earlier recheck sections below are historical.

- Game state: spin outcomes, per-letter payments, duplicate-letter rejection,
  vowel costs, misses, bankruptcies, banked winnings, special wedges, bonus
  selections and awards, interrupted-spin restore, and answer normalization.
- Lineups: true single player through all rounds, mixed Local/CPU control,
  distinct physical podium slots, two-player rotation, rejection of all-CPU
  games, and migration of version-one saves without losing scores.
- Assets: all 8,976 puzzles fit the original 52 visible tiles; all 25 declared
  GLBs have valid binary headers and lengths; all 36 audio tracks are packaged.
- Flash presentation: native PNG/WOFF assets, source timing, column-first opening,
  blue-to-letter ordering, simultaneous solves, bonus-choice visibility, automatic
  camera states, and source wheel values for each round.
- Fill-in solving: editable blanks only, locked known letters/punctuation/numbers,
  incomplete-answer rejection, source alpha flags, all 37 recovered camera poses,
  controller keys/role catalog, and native screen movie containers.

## Browser Checks

Verified in headless Chrome with WebGL rendering at 1440 x 900 and a touch/mobile
390 x 844 viewport:

- Loaded and rendered all 11 themed studios, with the common original rig.
- Spun the regular wheel, guessed a consonant, and received the correct payout.
- Played four rounds through the recovered bonus wheel and solved for $25,000.
- Let the real 30-second bonus timer expire; the answer and final bank appeared.
- Reloaded and resumed with the same puzzle, revealed letters, cash, and bank.
- Passed a turn after a wrong solve; the CPU spun and chose a consonant.
- Decoded every one of the 36 MP3s with the browser's AudioContext.
- Inspected puzzle tile alignment, upright wheel labels, dynamic podium cash,
  full-board phone framing, solve controls, and score/console spacing.
- Observed no page JavaScript errors in these checks.

Desktop and mobile screenshots are retained locally in the ignored `qa/` folder.

## Recovered Presentation Recheck

Verified after replacing the generated board and wheel art:

- Original category banner and text-scale/alpha animation, followed by the native
  green-to-white tile sequence. Input stays disabled during the reveal.
- Real regular-wheel spin, automatic closeup, board return, blue matching tiles,
  source-font letters, and correct $800-per-occurrence payout.
- Rendered all 11 studios with the original floor image and planar reflections.
  Inspected Los Angeles and New York for backdrop stripes and floor appearance.
- Manual camera selection persists during a spin; automatic mode can be restored
  in Backstage. Default on a fresh browser context is automatic.
- Played all four rounds through bonus, with the correct native round textures.
  Bonus solve controls/timer activate only after the chosen letters reveal.
- Restarted during a spin and confirmed the canceled spin cannot mutate the
  lobby or a new game after its former end time.
- Rechecked full-board and control framing at 390 x 844. Battery saver keeps the
  floor reflection with a smaller render target instead of restoring blackness.
- No page JavaScript errors occurred in these rechecks.

Reference screenshots include `category-reveal.png`, `letter-blue.png`,
`letter-revealed.png`, `native-wheel-spin.png`, `new-york-floor.png`,
`mobile-board.png`, `bonus-complete-native.png`, and `set-*-native.png`.

## Fidelity Boundaries

This is a playable browser recreation, not a PS3 emulator or a decompiled port.
Selected board behaviors and presentation frames are recovered from Flash;
gameplay rules, CPU decisions, camera-state selection, and lighting remain JavaScript.
Converted textures inherit any remaining source-export limitations. Original
camera poses are used for fixed cuts; puzzle framing is adapted for the HUD.
Camera animation is intentionally converted to fixed cuts. Native KF texture and
alpha tracks now play; collectible overlays and their inventory are enabled.
Character creation, player bodies, retail skeletal/cinematic animations,
online play, and Road Trip's three-game flow are not implemented. Toss-ups are
implemented. Touch viewport testing is
not a physical-phone performance test. Audio decode checks do not certify
speaker output or exact retail mixing.

## Cut Cameras And Fill-In Recheck

Verified in isolated local Chrome at 1440 x 900 and touch viewport 390 x 844:

- Actual UI spins at all three podiums used their respective recovered camera;
  the selected $800 wedge stopped under the correct original flipper. The result
  closeup held before returning to the board. Fixed camera positions stayed
  stable; all 37 inspector poses/directions matched source data numerically.
- Native puzzle-camera inspector showed upright letters. Explore limits no
  longer alter fixed cameras; manual views still remain manual during spins.
- Filled only blanks, with keyboard advance/backspace and disabled incomplete
  submission; a wrong regular answer closed the form and passed the turn.
- Single player completed four rounds and the bonus round using only the UI.
  Bonus solving began after reveals, allowed an incorrect answer and retry,
  then awarded $100,000 for a $104,000 final bank in this run.
- Two local plus one CPU lineup worked; CPU controls stayed locked. A two-player
  lineup with the middle podium empty used physical blue-slot camera 2, not 1.
  All-CPU setup was rejected with a visible explanation.
- At this earlier revision, active HUD/physical scores were bright and inactive
  displays were dark. The native-podium recheck below supersedes that behavior.
  Pat's label, lineup controls and the entire fill-in grid fit on mobile.
- Rendered all 11 sets with floor reflections and a decoded original monitor
  movie. Inspected Los Angeles, New York, Denver and San Francisco captures;
  wheel steps were opaque and blue blades had no depth-write holes.
- Restarted during a spin and its landed-result hold; canceled results did not
  mutate the lobby after their previous completion time.
- No page JavaScript errors occurred in these checks. Physical-phone performance
  and frame-perfect equivalence to the PS3 remain unverified.

Current local evidence includes `current-la.png`, `current-ny.png`,
`native-amount-player1.png`, `native-amount-player2.png`, `fill-in-solve.png`,
`mobile-fill-in-current.png` and `mobile-finished-current.png` in ignored `qa/`.

## Native Podium Recheck

33 Node tests include native score formatting and widths, controller/digit frame
offsets, physical-slot routing, effect completion, reset/restore and packaged font
and artwork. Source root scripts and fixed-stage frame exports are preserved.

Verified with actual UI interactions in isolated Chrome at 1440 x 900:

- Real spins and guesses awarded $800/$1,600; physical cash displayed upright
  with native glyph shadows and comma spacing. Zero cash was blank in 3D.
- Inactive podiums retained full native colors. All HUD cards had opacity 1;
  active-player indication came from source white inward-arrow frames.
- Captured staggered/flipping score digits, native Lose a Turn on yellow and
  Bankrupt on blue. Native effects belonged to the outgoing physical slot;
  the next arrow appeared on completion, and controls stayed locked meanwhile.
- A fill-in solve triggered the native final-score animation, hid turn arrows,
  and locked Next Round until it finished. Next Round cleared cash displays.
- Save restoration set scores without a new transition. An empty middle slot
  remained yellow rather than becoming a fake name/score panel. CPU play did not
  start during Bankrupt; restarting during that effect canceled the presentation.
- Original monitor video, floor reflections, native camera cuts and fill-in
  solving still worked. No page JavaScript errors occurred in these checks.
- At 390 x 844, a three-local lineup had no horizontal page overflow; the
  Univers HUD font loaded and all cards remained undimmed.

Evidence includes `native-podium-atlas.png`, `native-cash-closeup-final.png`,
`native-score-transition-atlas.png`, `native-loss-atlas.png` and
`native-bankrupt.png` in ignored `qa/`. Source Flash timeline keys are recovered;
the original executable's entire command sequence remains unverified.

## Camera Default And Backdrop Recheck

34 Node tests pass. Actual isolated-browser UI tests reproduced an old manual
override carrying into a new single-player match, then verified the fix:

- A legacy `wheel3d-camera=manual` fixture no longer disables automatic cuts on
  boot, match start, or resume. Single-player start cuts to the puzzle; a real
  spin cuts to its native wheel camera, holds the $800 amount, then returns to
  the board. Manual overrides still work within the current match.
- The visible Auto Cuts/Manual button restores automatic direction immediately.
  New matches reset it to Auto Cuts. The button and board fit at 390 x 844.
- The native logo MP4 is 8.84 seconds and fades to black at its end; its previous
  continuous loop was browser logic, not a recovered retail command. It now plays
  once at start, then returns to the decoded logo still. Resume starts on the
  still rather than replaying the intro. The video paused and all large-screen
  materials switched to the still after completion.
- No page JavaScript errors occurred. Exact retail screen cue selection remains
  unverified; `set_anim.xml` distinguishes intro/idle prop poses but does not
  specify these movie callbacks.

Evidence: `single-auto-amount-fixed.png` and `mobile-auto-start-fixed.png`.

## Remaining Recovery Recheck

Verified in isolated local Chrome at 1440 x 900 and touch viewport 390 x 844:

- Fresh single-player start cut to the toss-up board. Actual buzz and per-cell
  input awarded $1,000; the full UI flow passed both initial toss-ups, all four
  regular rounds, the third toss-up, and entry to the bonus wheel without errors.
- Bonus spin cut to `cam5_bonuswheel_detail` on landing and returned to the board.
  Scores/alphabet do not cover the landing shot. A separate bonus-entry fixture
  selected four letters through the UI and filled the automatically opened timed
  solve form, winning $35,000 and playing the matching native prize movie.
- Both spin presses worked, selecting 30% strength and a 4.9-second spin in one
  run. Backstage paused the meter; it resumed without advancing while paused.
- Original help viewer offered all 15 pages. Music toggle stopped the music
  independently of effects and persisted across reloads.
- A local puzzle fixture bought its last vowel through the real controls.
  Two O tiles dinged 750 ms apart, then `NoMoreVowels` played and the native banner
  appeared. The Buy Vowel button disabled with unused A/I/U buttons still present.
- All 11 studios loaded with reflective floors and no JavaScript/shader errors.
  Rear blades then used source 0.9 opacity, blend flags, no depth writes, RGB dark maps
  on UV set 1, and base textures on UV set 0. Native controller bindings normalize
  GLTF-reserved punctuation and compact clamp/UV flags.
- All 36 audio files were measured before/after leveling. Decoded output true
  peaks remained below -1 dBTP. An OfflineAudioContext stress test mixed 28 cues
  simultaneously through the production output graph: peak 0.889999986,
  -1.0122 dBFS, zero clipped samples. This is digital audio evidence, not a physical
  speaker-volume or frame-perfect retail-cue comparison.
- Browser decoding also succeeded for all 36 normalized files. All nine animated
  actors bound 50 texture slots with finite UV matrices. Original wheel artwork
  verified the two cyan $1,000 spaces and the $300 space under Mystery 2; payouts
  now match those images rather than the old $500/$1,000 substitutions.

Evidence in ignored `qa/`: `native-power-meter.png`, `no-more-vowels.png`,
`mobile-tossup-start.png`, `mobile-tossup-solve.png`,
`mobile-bonus-landing-unobstructed.png`, and `panels-baked-front.png`.
Road Trip, native executable CPU/physics, full shell callbacks, and exact retail
rendering remain unverified/unported; no claim of complete PS3 emulation is made.

## Audio And Layer Recheck

63 Node tests pass, including production audio-bus routing, priority/overlap
ducking, smooth interrupted recovery, mute handling, native depth/culling flags,
and stage-local atlas identities and PNG dimensions.

- Isolated local Chrome loaded and rendered all 11 themed sets after regeneration.
  Production LA panels retain 0.9 opacity, but now write depth and cull back faces
  like the source NIF defaults. Close-ups show the heavy floor-overlay bleed is
  gone without forcing the panels opaque. This supersedes the no-depth-write
  behavior in the earlier recheck.
- The material extractor had reused a filename-keyed decoder across studios.
  New York's Group2a was consequently the wrong 1024-square atlas; its own source
  is 2048 x 1024. Per-NIF decoding and pixel comparison repaired the affected
  atlases. Source and exported UV1 arrays matched exactly, so no speculative UV
  flips were applied. Zuma and Bejeweled poster close-ups no longer have those
  unrelated black patches. Baked surfaces do not receive a second browser shadow.
- A correct solve through the real per-cell UI played PuzzleWin while the music
  bus gain fell to 0.2, then recovered to 1 after the cue ended. Music remained
  playing. Short wheel/selection ticks do not duck; overlapping effects retain
  the strongest reduction. Audio-clock envelopes respect context suspension.

Evidence in ignored `qa/`: `la-floor-layer-final.png`, `ny-posters-final.png`.
Camera placement for these close-ups is a diagnostic fixture, not retail camera
acceptance. Ducking parameters are browser-authored. These checks do not prove
physical speaker volume, listening quality, or exact PS3 renderer/mixer parity.
