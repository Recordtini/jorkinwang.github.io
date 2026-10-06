# Verification

## Automated Checks

Run `node --test wheel/tests/*.test.js` from the site repository.

- Game state: spin outcomes, per-letter payments, duplicate-letter rejection,
  vowel costs, misses, bankruptcies, banked winnings, special wedges, bonus
  selections and awards, interrupted-spin restore, and answer normalization.
- Assets: all 8,976 puzzles fit the original 52 visible tiles; all 25 declared
  GLBs have valid binary headers and lengths; all 36 audio tracks are packaged.

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

## Fidelity Boundaries

This is a playable browser recreation, not a PS3 emulator or a decompiled port.
Gameplay rules, CPU decisions, canvas displays, cameras, and lighting are new
JavaScript. Converted textures inherit any remaining source-export limitations.
Character creation, player bodies, retail skeletal/cinematic animations,
online play, and toss-up rounds are not implemented. Touch viewport testing is
not a physical-phone performance test. Audio decode checks do not certify
speaker output or exact retail mixing.
