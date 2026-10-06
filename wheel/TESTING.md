# Verification

## Automated Checks

Run `node --test wheel/tests/*.test.js` from the site repository.
Current result: 25 passing tests.

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
Full camera and KF set-prop tracks are not played, and collectible Million,
Wildcard and Free Spin overlays are hidden until their full rules are ported.
Character creation, player bodies, retail skeletal/cinematic animations,
online play, and toss-up rounds are not implemented. Touch viewport testing is
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
