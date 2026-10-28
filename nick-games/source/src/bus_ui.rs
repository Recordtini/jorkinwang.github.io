//! Runaway Bus overlay coordinates and wording from gMenu/gGameControl.
use crate::{
    game::{Game, Player, Screen},
    platform,
};
use macroquad::prelude::*;
pub const DRIVERS: [(&str, usize); 4] =
    [("arnold", 0), ("gerald", 2), ("helga", 1), ("grandpa", 3)];
pub const MODES: [(&str, u8); 3] = [("crazy", 1), ("runaway", 0), ("cruise", 2)];
fn word(g: &Game, key: &str) -> String {
    g.original_words[key].as_str().unwrap_or(key).into()
}
fn glyph_width(g: &Game, c: char) -> f32 {
    g.assets
        .texture(&format!("{}sp", c.to_ascii_lowercase()))
        .map(|t| t.width())
        .unwrap_or(12.)
}
fn sprite(g: &Game, name: &str, x: f32, y: f32, brightness: f32) {
    if let Some(t) = g.assets.texture(name) {
        draw_texture(
            t,
            x - t.width() / 2.,
            y - t.height() / 2.,
            Color::new(brightness, brightness, brightness, 1.),
        );
    }
}
/// Coordinates are sprite registration centres, as in AddOverlay.
fn letters(g: &Game, text: &str, mut x: f32, y: f32, spacing: f32, brightness: f32) {
    let chars: Vec<_> = text.to_ascii_lowercase().chars().collect();
    for (i, c) in chars.iter().enumerate() {
        sprite(g, &format!("{c}sp"), x, y, brightness);
        if let Some(next) = chars.get(i + 1) {
            x += (glyph_width(g, *c) + glyph_width(g, *next)) / 2. + spacing;
        }
    }
}
fn heading(g: &Game, text: &str, x: f32, y: f32) {
    let width = 2. + text.chars().map(|c| glyph_width(g, c)).sum::<f32>();
    letters(g, text, x - width / 2. + 10., y, 0., 1.);
}
fn mouse() -> Vec2 {
    let (mx, my) = mouse_position();
    let w = screen_width().min(screen_height() * 600. / 320.);
    let h = w * 320. / 600.;
    vec2(
        (mx - (screen_width() - w) / 2.) * 600. / w,
        (my - (screen_height() - h) / 2.) * 320. / h,
    )
}
fn navigate(g: &mut Game, count: usize) {
    let next =
        is_key_pressed(KeyCode::Down) || is_key_pressed(KeyCode::Right) || platform::input(7) > 0.5;
    let prev =
        is_key_pressed(KeyCode::Up) || is_key_pressed(KeyCode::Left) || platform::input(6) > 0.5;
    if next || prev {
        g.ui_selection = (g.ui_selection + if next { 1 } else { count - 1 }) % count;
        g.sound("rollover.aif");
    }
}
fn hit(g: &mut Game, index: usize, rect: Rect) -> bool {
    let over = rect.contains(mouse());
    if over && mouse_delta_position().length_squared() > 0. {
        if g.ui_selection != index {
            g.sound("rollover.aif");
        }
        g.ui_selection = index;
    }
    (over && is_mouse_button_released(MouseButton::Left))
        || (g.ui_selection == index
            && (is_key_released(KeyCode::Enter)
                || is_key_released(KeyCode::Space)
                || platform::input(5) > 0.5))
}
fn button(g: &mut Game, index: usize, text: &str, x: f32, y: f32) -> bool {
    let clicked = hit(g, index, Rect::new(x - 89., y - 13.5, 178., 27.));
    sprite(g, "buttonsp.s", x, y, 1.);
    let width = 2. + text.chars().map(|c| glyph_width(g, c)).sum::<f32>();
    letters(
        g,
        text,
        x - width / 2. + 10.,
        y,
        0.,
        if g.ui_selection == index { 1. } else { 0.7 },
    );
    clicked
}
fn title(g: &Game) {
    sprite(g, "titlesp.s", 300., 60., 1.);
}
fn page_background(g: &Game) {
    if let Some(t) = g.assets.texture("sky") {
        draw_texture_ex(
            t,
            -87.,
            -16.,
            WHITE,
            DrawTextureParams {
                dest_size: Some(vec2(808., 798.)),
                ..Default::default()
            },
        );
    } else {
        clear_background(BLACK);
    }
}
fn page_button(g: &mut Game, index: usize, text: &str, x: f32, y: f32) -> bool {
    let clicked = hit(g, index, Rect::new(x - 89., y - 13.5, 178., 27.));
    sprite(g, "buttonsp.s", x, y, 1.);
    let d = measure_text(text, None, 18, 1.);
    let px = x - d.width / 2.;
    let py = y + d.height / 2. - 2.;
    draw_text(text, px + 1., py + 1., 18., BLACK);
    draw_text(
        text,
        px,
        py,
        18.,
        if g.ui_selection == index {
            WHITE
        } else {
            YELLOW
        },
    );
    clicked
}
fn begin(g: &mut Game) {
    g.player_index = 0;
    g.difficulty = g.players[0].difficulty;
    g.driver = ["arnold", "helga", "gerald", "grandpa"]
        .iter()
        .position(|n| *n == g.players[0].name.to_ascii_lowercase())
        .unwrap_or(0);
    if let Err(error) = g.start() {
        g.message = error;
    }
}
fn menu(g: &mut Game) {
    g.screen = Screen::Title;
    g.music("titlemusic.aif");
}
fn task(g: &Game) -> String {
    let prefix = if g.player_count > 1 {
        format!("player {}: ", g.player_index + 1)
    } else {
        String::new()
    };
    let seconds = if g.mode == 1 {
        format!("{} {} ", g.clock.ceil() as i32, word(g, "wordsecsto"))
    } else {
        String::new()
    };
    format!(
        "{prefix}{seconds}{} {}",
        if g.carrying { "drop off" } else { "pick up" },
        ["arnold", "helga", "gerald", "grandpa"][g.passenger]
    )
}
pub fn hud(g: &Game) {
    use crate::bus_hud::{DRIVER, MPH, PASSENGER, SCORE, SPEED};
    letters(g, &g.score.to_string(), SCORE.x, SCORE.y, 0., 1.);
    if g.mode == 0 {
        letters(
            g,
            &format!("{:02}/{:02}", g.collected, g.world.tomato_total),
            270.,
            17.,
            1.,
            1.,
        );
    }
    if g.mode != 2 {
        let clock = crate::bus_hud::clock(g.clock);
        for (c, x) in clock.chars().zip(crate::bus_hud::CLOCK_X) {
            sprite(g, &format!("{c}sp"), x, 17., 1.);
        }
    }
    sprite(
        g,
        &format!("{}sp.t", ["arnold", "helga", "gerald", "grandpa"][g.driver]),
        DRIVER.x,
        DRIVER.y,
        1.,
    );
    if g.carrying {
        sprite(
            g,
            &format!(
                "{}sp.t",
                ["arnold", "helga", "gerald", "grandpa"][g.passenger]
            ),
            PASSENGER.x,
            PASSENGER.y,
            1.,
        );
    }
    letters(
        g,
        &format!("{:>3}", g.vehicle.speed.round() as i32),
        SPEED.x,
        SPEED.y,
        0.,
        1.,
    );
    sprite(g, "mphsp", MPH.x, MPH.y, 1.);
    if g.message_timer > 0. {
        message(g, &g.message, 150.);
    }
    if g.mini_message_timer > 0. {
        let text: String = g.mini_message.chars().take(30).collect();
        let width = text.chars().map(|c| glyph_width(g, c)).sum::<f32>();
        letters(g, &text, 300. - width / 2. + 10., 260., 0., 1.);
    }
}
pub fn banner(g: &Game, text: &str, y: f32) {
    message(g, text, y);
}
fn message(g: &Game, text: &str, y: f32) {
    let lines = crate::bus_hud::message_lines(text);
    let top = y - lines.len().saturating_sub(1) as f32 * 15.;
    for (i, line) in lines.iter().enumerate() {
        let width = line.chars().map(|c| glyph_width(g, c)).sum::<f32>();
        letters(g, line, 300. - width / 2., top + i as f32 * 30., 0., 1.);
    }
}
pub fn draw(g: &mut Game) -> bool {
    if matches!(
        g.screen,
        Screen::Options
            | Screen::Playing
            | Screen::Ready
            | Screen::Replay
            | Screen::Instructs
            | Screen::Ending
    ) {
        return false;
    }
    match g.screen {
        Screen::Title => {
            navigate(g, 4);
            title(g);
            if button(g, 0, &word(g, "firstplay"), 300., 290.) {
                g.screen = Screen::Mode;
            }
            if button(g, 1, &word(g, "highscores"), 495., 290.) {
                g.score_page = 0;
                g.options_return = Screen::Title;
                g.screen = Screen::Scores;
            }
            if button(g, 2, &word(g, "instructs"), 105., 290.) {
                g.show_help_page = 0;
                g.screen = Screen::Instructions;
            }
            let clicked = hit(g, 3, Rect::new(574., 4., 22., 22.));
            sprite(
                g,
                "quitsp.t",
                585.,
                15.,
                if g.ui_selection == 3 { 1. } else { 0.5 },
            );
            if clicked {
                g.screen = Screen::Quit;
            }
        }
        Screen::Mode => {
            navigate(g, 3);
            title(g);
            heading(g, &word(g, "choosemode"), 300., 250.);
            for (i, (name, mode)) in MODES.iter().enumerate() {
                let text = if *mode == 2 {
                    "cruise".into()
                } else {
                    word(g, &format!("{name}mode"))
                };
                if button(g, i, &text, 105. + 195. * i as f32, 290.) {
                    g.mode = *mode;
                    g.screen = Screen::Players;
                }
            }
        }
        Screen::Players => {
            navigate(g, 4);
            title(g);
            heading(g, "How many players", 300., 220.);
            for i in 0..4 {
                if button(
                    g,
                    i,
                    &format!("{} player{}", i + 1, if i == 0 { "" } else { "s" }),
                    if i % 2 == 0 { 200. } else { 400. },
                    if i < 2 { 255. } else { 290. },
                ) {
                    g.player_count = i + 1;
                    g.players.clear();
                    g.player_index = 0;
                    if g.mode == 2 {
                        g.difficulty = 2;
                        g.screen = Screen::Driver;
                    } else {
                        g.screen = Screen::Difficulty;
                    }
                }
            }
        }
        Screen::Difficulty => {
            navigate(g, 3);
            title(g);
            let text = if g.player_count > 1 {
                format!(
                    "player {}: {}",
                    g.players.len() + 1,
                    word(g, "choosedifficulty")
                )
            } else {
                word(g, "choosedifficulty")
            };
            heading(g, &text, 300., 250.);
            for (i, name) in ["easy", "medium", "hard"].iter().enumerate() {
                if button(g, i, &word(g, name), 105. + 195. * i as f32, 290.) {
                    g.difficulty = i as u8 + 1;
                    g.screen = Screen::Driver;
                }
            }
        }
        Screen::Driver => {
            navigate(g, 4);
            title(g);
            let text = if g.player_count > 1 {
                format!(
                    "player {}: {}",
                    g.players.len() + 1,
                    word(g, "choosedriver")
                )
            } else {
                word(g, "choosedriver")
            };
            heading(g, &text, 300., 250.);
            for (i, (name, driver)) in DRIVERS.iter().enumerate() {
                let x = 200. + 70. * i as f32;
                let clicked = hit(g, i, Rect::new(x - 33.5, 267.5, 67., 45.));
                sprite(
                    g,
                    &format!("{name}sp.t"),
                    x,
                    290.,
                    if g.ui_selection == i { 1. } else { 0.5 },
                );
                if clicked {
                    g.driver = *driver;
                    g.players.push(Player {
                        name: (*name).into(),
                        difficulty: g.difficulty,
                        score: 0,
                        done: false,
                    });
                    if g.players.len() == g.player_count {
                        begin(g);
                    } else if g.mode == 2 {
                        g.difficulty = 2;
                    } else {
                        g.screen = Screen::Difficulty;
                    }
                }
            }
        }
        Screen::Paused => {
            navigate(g, 3);
            if g.mode != 0 && !g.world.targets.is_empty() {
                heading(g, &task(g), 300., 40.);
                heading(g, &g.world.entities[g.target].name, 300., 60.);
            }
            if button(g, 0, &word(g, "buttoncontinue"), 480., 100.) {
                g.screen = g.previous_screen;
            }
            if button(g, 1, &word(g, "buttonbackup"), 480., 140.) {
                g.backup();
                g.screen = Screen::Playing;
            }
            if button(g, 2, &word(g, "buttonfinish"), 480., 180.) {
                g.finish(false, "");
            }
        }
        Screen::Target => {
            if g.target_step > 1 {
                heading(g, &word(g, "wordyoudidit"), 300., 40.);
                heading(
                    g,
                    &format!("{} {}", word(g, "timebonus"), g.target_bonus),
                    300.,
                    60.,
                );
            }
            heading(g, &task(g), 300., 240.);
            heading(
                g,
                &format!("{} {}", word(g, "wordat"), g.world.entities[g.target].name),
                300.,
                260.,
            );
            let text = word(
                g,
                if g.target_step == 1 {
                    "wordstart"
                } else {
                    "buttoncontinue"
                },
            );
            if button(g, 0, &text, 300., 290.) {
                if g.target_step > 1 {
                    g.score += g.target_bonus;
                }
                g.world.transitions.clear();
                g.renderer.reset_camera(&g.vehicle);
                if g.target_step == 1 {
                    g.screen = Screen::Playing;
                    g.message = "Go!".into();
                    g.message_timer = 2.;
                    g.sound(&format!(
                        "{}.aif",
                        ["arnold", "helga", "gerald", "grandpa"][g.driver]
                    ));
                    g.music("gamemusic.aif");
                } else {
                    g.screen = Screen::Playing;
                }
            }
        }
        Screen::Finished => {
            navigate(g, 3);
            heading(g, &word(g, "gameover"), 300., 40.);
            if g.players.len() == 1 && button(g, 1, "try again", 480., 100.) {
                let _ = g.start();
            }
            if button(g, 2, &word(g, "buttonaddscore"), 480., 140.) {
                g.screen = Screen::ScoreEntry;
                g.options_return = Screen::Finished;
            }
            let next = g.players.iter().position(|p| !p.done);
            if button(
                g,
                0,
                &word(
                    g,
                    if next.is_some() {
                        "nextplayer"
                    } else {
                        "menubutton"
                    },
                ),
                480.,
                180.,
            ) {
                if let Some(index) = next {
                    g.player_index = index;
                    g.difficulty = g.players[index].difficulty;
                    g.driver = ["arnold", "helga", "gerald", "grandpa"]
                        .iter()
                        .position(|n| *n == g.players[index].name.to_ascii_lowercase())
                        .unwrap_or(0);
                    let _ = g.start();
                } else {
                    menu(g);
                }
            }
            letters(g, &g.score.to_string(), 20., 17., 0., 1.);
            if g.won {
                heading(
                    g,
                    &format!(
                        "{} {}",
                        word(g, "timebonus"),
                        crate::bus_mission::time_bonus(g.clock, g.difficulty)
                    ),
                    300.,
                    290.,
                );
            }
        }
        Screen::Instructions => {
            page_background(g);
            const PAGES: [&str; 7] = [
                "instructions1",
                "instructions2",
                "instructions3",
                "instructions3a",
                "instructions4",
                "instructions5",
                "instructions6",
            ];
            const RECTS: [(f32, f32, f32); 7] = [
                (68., 28., 458.),
                (63., 28., 328.),
                (54., 32., 470.),
                (54., 32., 446.),
                (108., 35., 472.),
                (34., 29., 519.),
                (34., 29., 519.),
            ];
            let page = g.show_help_page.min(6);
            let text = if page == 3 {
                g.assets
                    .texts
                    .get("instructions3a")
                    .cloned()
                    .unwrap_or_default()
            } else {
                word(g, PAGES[page])
            };
            instruction(&text, RECTS[page]);
            if page == 4 {
                sprite(g, "turbosp.t", 83., 98., 1.);
                sprite(g, "pointsp.t", 83., 141., 1.);
                sprite(g, "timesp.t", 83., 191., 1.);
            }
            if page_button(g, 0, &word(g, "clicktocontinue"), 481., 295.) {
                if page < 6 {
                    g.show_help_page += 1;
                } else {
                    menu(g);
                }
            }
        }
        Screen::Scores => {
            navigate(g, 3);
            page_background(g);
            let (mode, difficulty) = crate::scores::PAGES[g.score_page];
            let text = if mode == 2 {
                "Cruise".into()
            } else {
                format!(
                    "{} - {}",
                    if mode == 0 { "Runaway" } else { "Crazy" },
                    ["", "Easy", "Medium", "Hard"][difficulty as usize]
                )
            };
            page_text(&text, 13., 33., 22., YELLOW);
            draw_rectangle(87., 53., 450., 203., Color::new(0., 0., 0., 0.3));
            let entries = crate::scores::read(g.score_page);
            if entries.is_empty() {
                page_text("No scores yet.", 97., 80., 17., YELLOW);
            }
            for (i, e) in entries.iter().enumerate() {
                let y = 80. + i as f32 * 17.;
                page_text(&format!("{}.", i + 1), 97., y, 16., YELLOW);
                page_text(&e.name, 145., y, 16., YELLOW);
                page_text(&e.score.to_string(), 440., y, 16., YELLOW);
            }
            if page_button(g, 0, &word(g, "backbutton"), 112., 282.) {
                menu(g);
            }
            if page_button(g, 1, "CLEAR SCORES", 304., 282.) {
                g.screen = Screen::ClearScores;
            }
            if page_button(g, 2, &word(g, "shownextrun"), 499., 282.) {
                g.score_page = (g.score_page + 1) % 7;
            }
        }
        Screen::ClearScores => {
            navigate(g, 2);
            page_background(g);
            page_text(
                "Are you sure you want to clear the scores?",
                130.,
                130.,
                18.,
                YELLOW,
            );
            if page_button(g, 0, "NO", 200., 200.) {
                g.screen = Screen::Scores;
            }
            if page_button(g, 1, "YES", 400., 200.) {
                crate::scores::clear(g.score_page);
                g.screen = Screen::Scores;
            }
        }
        Screen::ScoreEntry => {
            navigate(g, 2);
            page_background(g);
            let mode = if g.mode == 0 {
                "Runaway"
            } else if g.mode == 1 {
                "Crazy"
            } else {
                "Cruise"
            };
            let difficulty = if g.mode == 2 {
                ""
            } else {
                ["", " - Easy", " - Medium", " - Hard"][g.difficulty as usize]
            };
            page_text(&format!("{mode}{difficulty}"), 13., 33., 22., YELLOW);
            while let Some(c) = get_char_pressed() {
                if (c.is_ascii_alphanumeric() || matches!(c, ' ' | '-' | '_'))
                    && g.score_name.len() < 20
                {
                    g.score_name.push(c);
                }
            }
            if is_key_pressed(KeyCode::Backspace) {
                g.score_name.pop();
            }
            draw_rectangle(160., 110., 240., 26., WHITE);
            page_text(&g.score_name, 165., 130., 18., BLACK);
            page_text(&word(g, "wordscore"), 79., 165., 18., YELLOW);
            page_text(&g.score.to_string(), 306., 165., 18., YELLOW);
            if page_button(g, 0, &word(g, "submitscore"), 425., 280.) {
                g.score_page = crate::scores::add(g.mode, g.difficulty, &g.score_name, g.score);
                g.screen = Screen::Scores;
            }
            if page_button(g, 1, &word(g, "cancelscore"), 175., 281.) {
                g.screen = Screen::Finished;
            }
        }
        Screen::Quit => {
            navigate(g, 2);
            message(g, &word(g, "quitwarning"), 130.);
            if button(g, 0, &word(g, "wordno"), 200., 200.) {
                g.screen = Screen::Title;
            }
            if button(g, 1, &word(g, "wordyes"), 400., 200.) {
                platform::exit_game();
            }
        }
        _ => return false,
    }
    true
}
fn page_text(text: &str, x: f32, y: f32, size: f32, color: Color) {
    draw_text(text, x + 2., y + 2., size, BLACK);
    draw_text(text, x, y, size, color);
}
fn instruction(text: &str, (x, top, width): (f32, f32, f32)) {
    let mut y = top + 18.;
    for paragraph in text.lines() {
        if paragraph.is_empty() {
            y += 8.;
            continue;
        }
        let mut line = String::new();
        for word in paragraph.split_whitespace() {
            if measure_text(format!("{line} {word}"), None, 16, 1.).width > width {
                page_text(&line, x, y, 16., YELLOW);
                y += 18.;
                line.clear();
            }
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(word);
        }
        page_text(&line, x, y, 16., YELLOW);
        y += 18.;
    }
}
