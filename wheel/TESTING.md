# Verification

## Automated Checks

Run `node --test wheel/tests/*.test.js` from the site repository.
Current result: 19 passing tests.

- Game state: spin outcomes, per-letter payments, duplicate-letter rejection,
  vowel costs, misses, bankruptcies, banked winnings, special wedges, bonus
  selections and awards, interrupted-spin restore, and answer normalization.
- Assets: all 8,976 puzzles fit the original 52 visible tiles; all 25 declared
  GLBs have valid binary headers and lengths; all 36 audio tracks are packaged.
- Flash presentation: native PNG/WOFF assets, source timing, column-first opening,
  blue-to-letter ordering, simultaneous solves, bonus-choice visibility, automatic
  camera states, and source wheel values for each round.

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
gameplay rules, CPU decisions, camera direction, and lighting remain JavaScript.
Converted textures inherit any remaining source-export limitations. Original
KF set-prop and cinematic tracks are not played, and collectible Million,
Wildcard and Free Spin overlays are hidden until their full rules are ported.
Character creation, player bodies, retail skeletal/cinematic animations,
online play, and toss-up rounds are not implemented. Touch viewport testing is
not a physical-phone performance test. Audio decode checks do not certify
speaker output or exact retail mixing.
