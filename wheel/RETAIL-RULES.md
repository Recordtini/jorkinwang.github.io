# Native Wheel Rules

Recovered locally from the supplied NPUA80137 executable, decrypted using
the user's RPCS3 installation. ELF SHA-256:
`bf3b82d6097533d7ff06afbd9a63440997e1b217ce17390ef5f137674c38cc73`.
Addresses below are PPU virtual addresses. No executable, license material,
Ghidra database, or decompiler output is distributed with the website.

## Spin

- `0x1c8d0`: blend `power / 100 * (1 - Slop) + random * Slop`, clamp
  to `[0.01, 1]`, serialize as `playerSetWheelSpinRange %0.5f`.
- `0x2f460`: read `WheelSpin` from SCX. `wof_base.scx` overrides the
  constructor defaults with time `[4, 7]` seconds, travel `[1.1, 2.6]`
  revolutions, and `Slop = 0.1`.
- `0x2d998`: interpolate time and travel from that blended range.
- `0x2dc48`: distance is `turns * (1 - (1 - elapsed / duration)^4)`.
  Stop at the resulting continuous angle, not a preselected random wedge.
- `0x1cab0`, `0x6a4d0`: CPU power is an inclusive integer in `[10, 100]`.
- `0x31c00`: main wheel has 72 spokes; bonus wheel has 48.
- `0x1ac60`, `0x1acd8`: both wheels invoke the same spin setup routine.

The browser keeps the existing wheel-art/three-flipper coordinate adapter.
It converts the final angle to one of 72 physical cells, preserving the
Bankrupt side thirds of the Million strip. Completed orientations are saved;
interrupted spins restore the previous completed orientation. Settings are
merged with studio SCX overrides before making the plan.

## CPU

- `0xd3a230`: vowels `EAIOU`; consonants `RTNSLCDPMHGBFYWKVXZJQ`.
- `0x18d58`: three passes of random swaps within inclusive bands, not
  Fisher-Yates over all letters.
- `0x191e8`: easy consonant bands `0..9, 10..20`; medium
  `0..6, 7..13, 14..20`; hard `0..4, 5..9, 10..14, 15..20`.
  Easy vowels shuffle all five; medium splits `0..2, 3..4`; hard
  splits `0..1, 3..4`, leaving `I` fixed at index two.
- Solve threshold: easy `0.7 + random * 0.3`, medium
  `0.6 + random * 0.4`, hard `0.5 + random * 0.4`.
- Other profile thresholds are solve threshold times `0.4` (buy vowel),
  `0.5` (Free Spin), `0.8` (Wild Card), `0.75` (Mystery).
- `0x13c48` branch assembly: solve when revealed fraction reaches the
  solve threshold; buy when permitted and progress reaches the vowel
  threshold. Use Free Spin / Wild Card at or above their thresholds;
  risk Mystery at or below its threshold.
- `0x14418`: choose the next unused priority letter. Consonants have a
  difficulty-specific `0.1 / 0.2 / 0.3` chance to query the puzzle for
  an available correct letter. Vowels do not use that knowledge roll.
- `0x13998`: bonus choices use unused profile priorities without that roll.
- `0x12ee0`: CPU recognition compares revealed progress with its solve
  threshold. `0x14c98` submits correct solution letters one at a time.
- `0x27808`: after setting a solve letter, check the completed solution;
  otherwise advance the selected panel and wait two seconds before the next.

Profiles persist in browser saves, rather than rerolling at each AI action.
CPU reveal progress counts occurrences, not distinct letters. Bonus CPUs
that cannot recognize the answer wait for the timer instead of immediately
ending the round. CPU guesses no longer have arbitrary difficulty-based
wrong-answer rolls. The browser animates CPU solution filling.

## Bonus Prize

`0x17538` chooses one of 48 entries at `0xd3a040` using the synchronized
random generator. Six groups each contain six `$25,000` entries followed
by two entries of respectively `$30,000`, `$35,000`, `$40,000`, `$45,000`,
`$50,000`, `$100,000`. Thus `$25,000` has probability 36/48; each other
amount has probability 2/48. The physical wheel spin does not select from
seven equally likely cash prizes. The prize is kept secret through the spin.
`0x1cc70` replaces `$100,000` with `$1,000,000` for an eligible contestant;
`0x1fe70` selects the corresponding prize movie.

## Remaining Boundaries

This is a source-backed port of these formulas, tables, and decision branches,
not a claim of frame-perfect emulation. JavaScript randomness does not replay
the PS3 synchronized RNG stream. Native spoke/flipper spring geometry and
every AI dispatch state are not fully emulated. The browser
retains its safety solve when only unaffordable vowels remain, and always
uses an available bonus Wild Card. The native prize table is initialized at
round-table setup; the browser samples it when the bonus round begins.
The bonus envelope removal choreography still needs native controller work.
Live PS3-versus-browser gameplay and audible click-cadence comparison remain
manual acceptance checks; unit and browser tests are not substitutes for them.

One additional unresolved discrepancy: native cash tables starting at `0xd39500`
contain `$500` in cells corresponding to the two cyan spaces whose recovered
Flash art displays `$1,000`. This update preserves the established art-matching
web payouts; it does not silently substitute those raw values without tracing
the retail display/award path.
