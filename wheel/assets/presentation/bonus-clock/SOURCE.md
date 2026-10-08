# Bonus Clock

Recovered from NPUA80137 `gui.gfx` sprite 496 (`mcTimer`).
`doUpdateCountDownTime(seconds)` chooses frame `currentPlayer + 1`, sets
`tText.text`, and shows the sprite while seconds >= 0; negative seconds hide it.
The three frames use external images `gui_I1E7`, `gui_I1EA`, `gui_I1ED` and
embedded font 19 (Cosmos Medium), white, centered, 35 px at the 1920x1080
authoring size, with a 5 px shadow at 60 degrees.

The original 108x56 background lies at (901.55, 643.7) on that authoring stage;
the source DDS textures are 128x64 and are scaled into those Flash bounds.
The web port retains the art/font and scales it to 162x84 desktop / 132x68.45
mobile, centered just above the web solve controls; score cards are hidden
throughout the bonus round.
This is responsive placement, not a claim of identical full-screen HUD layout.
