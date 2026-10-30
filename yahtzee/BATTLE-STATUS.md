# Battle Yahtzee recovery in progress

The original Battle mode is command 1085 and uses CBattleYat. Initialization
004039a0 requests two players, and 00403bf0 creates ten dice using DIEBAT1.RWX
and DIEBAT2.RWX, BATCUP.RWX, BAT_F, BAT_W, BAT_CLK and BATLLOOP. Resource
string 1527 says scoring is selected after the second player rolls; strings
1529 and 1530 distinguish green and red dice. Dialog 310 contains the scorecard.
The mode-specific scoring handler is 00403ee0 and player transition is 004041d0;
00404510 manipulates both sets of dice and changes the arena's final z boundary.
These transitions have not yet been implemented or validated in the browser.

The original 0040b610 boundary routine was executed for 1,375 inputs each with
the initial bounds [-3,3,-3.4,3] from 00403bf0 and expanded final z bound 6
from 00404510. The matching Rust primitive is tested by original_battle_boundaries.
These tests do not establish the ten-die physics, player sequencing, scoring,
rendering or Battle playability. The board and scorecard bitmaps have been
extracted with original RLE code by port-tools/export_battle_assets.py.
