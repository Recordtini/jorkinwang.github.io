# Jeopardy! 3D Studio

A browser recreation using recovered assets from the PS3 game NPUA80227. This is not a completed 1:1 port of the retail executable.

## Playing

- Choose one to three occupied podiums, each local or CPU, with at least one local player.
- Click or tap a dollar amount on the actual 3D board. Arrow keys and Enter also select clues.
- Dollar values brighten subtly on hover. Read the full-screen clue; buzzers open automatically after reading. Buzz with the on-screen button, Space, or player keys 1/2/3. Category and clue stay near the top above the podiums while choosing one of four original responses, or pressing A/B/C/D. The clue text hides after submission.
- CPU players highlight successive choices and pause on their selected response. Results show the selected response over the podiums until Continue is pressed. Studio Options can enable a saved three-second auto-continue timer. Both paths cut to the board for one second before returning control or reopening remaining buzzers.
- Daily Double shows its category, the selecting player's score, and the other occupied podiums' scores. Wagers start at $1; True Daily Double locks the player's entire positive score in one click (disabled at $0 or below).
- Scores and names appear on the physical podiums, not duplicate HUD cards.
- Jeopardy and Double Jeopardy introduce all six categories in order using the recovered GUI slide/fade tracks, round graphics, and a normalized category-reveal effect. Selection stays locked until the sequence ends; Enter or Skip Categories bypasses it. Dollar values use Swiss 911 and smaller separate dollar signs; category names use Swiss 921, matching the original Flash fields.
- Active podium timer lights extinguish inward in five steps using the recovered light artwork and atlas positions. The on-screen response countdown shares the same clock and adds a paired red-light strip. Both pause in Options and clear after a response or timeout.
- Automatic cameras use recovered animated shots. Sound and music toggles are on the main game view. Studio Options exposes all cameras, saved-game resume, and a clue reveal that forfeits additional points.
- Reflections are enabled by default and can be switched off in Studio Options. Each of the three floor levels has its own live planar capture, blended into the original opaque floor material using its gloss map. Reflective props use a static environment capture of the actual studio; emissive artwork and screens are excluded.
- Complete Jeopardy and Double Jeopardy boards, then wager in Final Jeopardy. Local Final wagers and responses are collected sequentially; pass the device privately.

## Recovered Sources

- `data/models/sets/stage5/stage5.nif.soe`: 157 meshes, 80 embedded texture images, 31 cameras, and 22 animated camera tracks. Native Y-up coordinates and parent transforms are retained. Tracks account for controller frequency, quaternion rotation, and quadratic translation keys.
- `data/game/content.txt.soe`: 533 categories and 2,501 clues, including 41 single-clue Final categories. Questions, response prefixes, correct responses, and distractors are from this catalog.
- `data/swf/{tileboard,cluecard,podiums,gui,gameshell}`: exported fonts, images, ActionScript reference, and vector artwork. The raised answer-tile border is original `tileboard.gfx` shape 10, not a CSS approximation. Korinna, Swiss 911/921, and handwritten podium names use the recovered fonts.
- `data_ps3/audio/*.fsb`: 33 sound/music assets, normalized with FFmpeg `loudnorm` to -20 LUFS and -3 dBTP. Browser playback shares Wheel's limiter and ducking infrastructure.
- Category text reveal uses `categorybeep`, not the separate `CategoryReveal` or `CategoryRevealAlt1` events. In the decrypted NPUA80227 ELF, callback registration at `0x4b36c`/`0x4b370` pairs `postCategoryTextReveal` with function descriptor `0xd43590`, which resolves to handler `0x44078` (TOC `0xda3428`). Both handler branches load `categorybeep` at `0x440b0`/`0x440f0` and dispatch through virtual slot `0x1cc`. `jeopardy.fev` maps that event to `categorybeep.wav`, OneShot sample 5. The recovered Flash callback occurs when category text starts fading in; the browser fires the cue at the same point.
- The full-screen clue background is the user-supplied `blank_jeopardy_screen_v2_by_drewmandew_dfj4q3r.png`, preserved as `assets/presentation/cluecard/user-clue-background.png`. It is not an extracted PS3 asset. The stage-backed response presentation and brief result cuts are also intentional user-requested designs, not proven retail timeline behavior.

Original retail files remain untouched. Only converted browser assets are published; no executable, decryption keys, bulk SWF/XML exports, or player-body assets are shipped. Asset ownership remains with the original rights holders.

## Remaining Parity Gaps

- Rules are a browser implementation, not execution of the original native game code. CPU confidence and selection delays are approximations. Daily Double placement uses the user's supplied TV heatmaps as per-cell weights, normalized for rounding: one weighted clue in Jeopardy and two weighted distinct clues in Double Jeopardy (without replacement). The charts do not specify a joint two-clue distribution; this is not a recovered PS3 placement routine. Existing saved boards retain their original placements.
- Clue reading time estimates 180 words per minute plus a one-second settling pause, with a three-second minimum; longer clues keep both human and CPU buzzers locked longer. This also precedes Daily Double and Final responses, without changing answer timers.
- Camera paths are recovered, but mapping each shot to gameplay events has not been proven against the native state machine.
- Gamebryo light linking, complete ambient-animation state changes, and exact retail shader composition are not fully reproduced. Original dark-map UV channels are preserved; the web lighting rig is approximate. The new planar-floor and environment-probe effects are browser approximations, not recovered native reflection shader code. Visible floor captures update with the camera on every rendered frame; prop environments are static.
- Category slides/fades are extracted from `gui.gfx` sprites 15/16 at 30 Hz, driven by the original callbacks, and use original background/border artwork. The reveal effect is mapped from the native callback; host category speech remains unproven. Other Flash choreography, host delivery, all result screens, and original simultaneous Final multiplayer timing remain incomplete. Player bodies and character creation are deliberately omitted. The on-screen red timer strip is a browser presentation of the recovered podium countdown, not an extracted GUI strip.
- Audio files are normalized and browser-decoded, but every source sound's event mapping has not been validated by listening against retail gameplay.

## Rebuilding and Checking

Run `tools/build_assets.py` with Python that can import Pillow, NumPy, and the workspace NIF dependencies. It expects the original dump and converter in the parent `JEOPARDY` workspace, Java 17, the local FFDec JAR, and FFmpeg on PATH. It writes source investigation exports under ignored `qa/source/`. The supplied clue background must remain available separately; extraction does not overwrite it.

From the site repository:

```powershell
node --test jeopardy/game.test.mjs
python -m http.server 8092 --bind 127.0.0.1
node jeopardy/tools/browser_qa.mjs
```

The browser harness uses this machine's bundled Playwright and Chrome paths. Override `JEOPARDY_QA_URL` for a deployed page. It tests actual projected 3D board clicks, animated intro motion, six sequential category introductions and sound dispatches, frame-synchronized floor captures during camera movement and cuts, clue-length reading delays, response/podium timers, True Daily Double and opponent scores, saved-game resume, timer pause, mobile layout, and decoding all 33 audio assets. Final UI coverage uses a fixture to skip the preceding boards; it is not proof of a full human-played show or retail visual parity. `tools/recover_presentation.py` re-exports the native category and podium-timer presentation after the Flash extraction.
