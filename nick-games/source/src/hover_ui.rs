//! NickFOP gMenu: original bitmap lettering, button registration points and layout.
use crate::{
    assets::Assets,
    game::{Game, Player, Screen},
    platform,
};
use macroquad::prelude::*;
fn word(g: &Game, key: &str, fallback: &str) -> String {
    g.original_words
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or(fallback)
        .into()
}
fn sprite(a: &Assets, name: &str, p: Vec2) {
    if let Some(t) = a.texture(name) {
        draw_texture(
            t,
            p.x - (t.width() / 2.).floor(),
            p.y - (t.height() / 2.).floor(),
            WHITE,
        );
    }
}
pub fn text(a: &Assets, s: &str, p: Vec2, brightness: f32, scale: f32) {
    let chars: Vec<_> = s.to_lowercase().chars().collect();
    let width = |c| a.texture(&format!("{c}sp")).map_or(8., |t| t.width());
    let mut x = p.x
        - chars
            .iter()
            .map(|&c| (width(c) / 2.).floor() * scale)
            .sum::<f32>();
    for (i, &c) in chars.iter().enumerate() {
        if let Some(t) = a.texture(&format!("{c}sp")) {
            draw_texture_ex(
                t,
                x - (t.width() / 2.).floor() * scale,
                p.y - (t.height() / 2.).floor() * scale,
                Color::new(brightness, brightness, brightness, 1.),
                DrawTextureParams {
                    dest_size: Some(t.size() * scale),
                    ..Default::default()
                },
            );
        }
        if i + 1 < chars.len() {
            x += ((width(c) / 2.).floor() + (width(chars[i + 1]) / 2.).floor()) * scale;
        }
    }
}
fn heading(g: &Game, s: &str, y: f32) {
    for (i, line) in crate::bus_hud::message_lines(s).iter().enumerate() {
        text(&g.assets, line, vec2(300., y + i as f32 * 20.), 1., 1.);
    }
}
fn button(g: &mut Game, i: usize, s: &str, p: Vec2, select: bool) -> bool {
    let mouse = crate::viewport::current().game_position(Vec2::from(mouse_position()));
    let over = Rect::new(p.x - 73., p.y - 17., 147., 34.).contains(mouse);
    if over && mouse_delta_position().length_squared() > 0. {
        g.ui_selection = i;
    }
    sprite(&g.assets, "buttonsp.s", p);
    text(
        &g.assets,
        &s.chars().take(23).collect::<String>(),
        p,
        if g.ui_selection == i || over { 1. } else { 0.7 },
        1.,
    );
    (over && is_mouse_button_released(MouseButton::Left)) || (g.ui_selection == i && select)
}
fn replay(g: &mut Game) {
    g.screen = Screen::Replay;
    g.replay_index = 0;
    g.accumulator = 0.;
    g.music("gamemusic.aif");
}
fn main_menu(g: &mut Game) {
    g.screen = Screen::Title;
    g.music("titlemusic.aif");
}
pub fn draw(g: &mut Game) -> bool {
    if matches!(
        g.screen,
        Screen::Options | Screen::Driver | Screen::Target | Screen::Quit | Screen::ClearScores
    ) {
        return false;
    }
    let count = match g.screen {
        Screen::Title | Screen::Mode | Screen::Difficulty | Screen::Finished => 3,
        Screen::Players => 4,
        Screen::Paused | Screen::Instructions | Screen::Scores => 2,
        _ => 1,
    };
    let next =
        is_key_pressed(KeyCode::Down) || is_key_pressed(KeyCode::Right) || platform::input(7) > 0.5;
    let prev =
        is_key_pressed(KeyCode::Up) || is_key_pressed(KeyCode::Left) || platform::input(6) > 0.5;
    if next || prev {
        g.ui_selection = (g.ui_selection + if next { 1 } else { count - 1 }) % count;
        g.sound("rollover.aif");
    }
    let select = is_key_released(KeyCode::Enter)
        || is_key_released(KeyCode::Space)
        || platform::input(5) > 0.5;
    match g.screen {
        Screen::Title => {
            sprite(&g.assets, "titlesp.s", vec2(100., 60.));
            if button(
                g,
                0,
                &word(g, "firstplay", "PLAY"),
                vec2(300., 270.),
                select,
            ) {
                g.screen = Screen::Mode;
            }
            if button(
                g,
                1,
                &word(g, "highscores", "HIGH SCORES"),
                vec2(460., 270.),
                select,
            ) {
                g.screen = Screen::Scores;
            }
            if button(
                g,
                2,
                &word(g, "instructs", "HOW TO PLAY"),
                vec2(140., 270.),
                select,
            ) {
                g.show_help_page = 0;
                g.screen = Screen::Instructions;
            }
        }
        Screen::Mode => {
            heading(g, "Choose Game Mode", 230.);
            for (i, (name, x, mode)) in [
                ("Race", 300., 0),
                ("Time Trial", 460., 2),
                ("Email Rescue", 140., 1),
            ]
            .iter()
            .enumerate()
            {
                if button(g, i, name, vec2(*x, 270.), select) {
                    g.mode = *mode;
                    g.screen = Screen::Players;
                }
            }
        }
        Screen::Players => {
            heading(
                g,
                &word(g, "howmanyplayers", "Choose the number of players:"),
                180.,
            );
            for (i, p) in [
                vec2(220., 230.),
                vec2(380., 230.),
                vec2(220., 270.),
                vec2(380., 270.),
            ]
            .iter()
            .enumerate()
            {
                if button(
                    g,
                    i,
                    &format!("{} {}", i + 1, word(g, "wordplayers", "players")),
                    *p,
                    select,
                ) {
                    g.player_count = i + 1;
                    g.players.clear();
                    g.player_index = 0;
                    g.screen = Screen::Difficulty;
                }
            }
        }
        Screen::Difficulty => {
            let title = word(g, "choosedifficulty", "Choose Difficulty");
            heading(
                g,
                &if g.player_count > 1 {
                    format!("Player {}: {title}", g.players.len() + 1)
                } else {
                    title
                },
                230.,
            );
            for (i, name) in ["easy", "medium", "hard"].iter().enumerate() {
                if button(g, i, name, vec2(140. + 160. * i as f32, 270.), select) {
                    g.difficulty = i as u8 + 1;
                    g.players.push(Player {
                        name: "Timmy".into(),
                        difficulty: g.difficulty,
                        score: 0,
                        done: false,
                    });
                    if g.players.len() == g.player_count {
                        g.player_index = 0;
                        g.difficulty = g.players[0].difficulty;
                        if let Err(e) = g.start() {
                            g.message = e;
                        }
                    }
                }
            }
        }
        Screen::Paused => {
            if button(
                g,
                0,
                &word(g, "buttoncontinue", "continue"),
                vec2(220., 270.),
                select,
            ) {
                g.screen = g.previous_screen;
            }
            if button(
                g,
                1,
                &word(g, "buttonfinish", "finish"),
                vec2(380., 270.),
                select,
            ) {
                if g.previous_screen == Screen::Replay {
                    if let Some(f) = g.replay_end.clone() {
                        g.apply_frame(&f);
                    }
                    g.screen = Screen::Finished;
                } else {
                    g.finish(false, "");
                }
            }
        }
        Screen::Ready | Screen::Playing | Screen::Replay | Screen::Ending | Screen::Instructs => {
            crate::hover_hud::draw(g);
            if g.screen == Screen::Ready {
                heading(
                    g,
                    &word(
                        g,
                        if g.countdown > 1. {
                            "wordready"
                        } else {
                            "wordset"
                        },
                        if g.countdown > 1. { "Ready!" } else { "Set!" },
                    ),
                    40.,
                );
            }
        }
        Screen::Finished => {
            heading(
                g,
                &word(
                    g,
                    if g.won { "gamecomplete" } else { "gameover" },
                    if g.won { "You Did It!" } else { "Game Over" },
                ),
                40.,
            );
            if !g.won {
                heading(g, &g.message, 60.);
            }
            if g.countdown <= 0. {
                if button(g, 0, "watch replay", vec2(140., 270.), select) {
                    replay(g);
                }
                if button(
                    g,
                    1,
                    &word(g, "buttonaddscore", "add score"),
                    vec2(300., 270.),
                    select,
                ) {
                    g.screen = Screen::ScoreEntry;
                    g.score_name = crate::scores::last_name();
                }
                let next = g.players.iter().any(|p| !p.done);
                if button(
                    g,
                    2,
                    &word(
                        g,
                        if next { "nextplayer" } else { "mainmenu" },
                        if next { "NEXT PLAYER" } else { "MAIN MENU" },
                    ),
                    vec2(460., 270.),
                    select,
                ) {
                    if next {
                        g.player_index = g.players.iter().position(|p| !p.done).unwrap_or(0);
                        g.difficulty = g.players[g.player_index].difficulty;
                        let _ = g.start();
                    } else {
                        main_menu(g);
                    }
                }
            }
        }
        Screen::Instructions => {
            draw_rectangle(20., 10., 560., 244., Color::new(0.02, 0., 0.06, 0.88));
            let s = g
                .assets
                .texts
                .get(&format!("instructions{}", g.show_help_page + 1))
                .cloned()
                .unwrap_or_default();
            let mut lines = Vec::<String>::new();
            let mut line = String::new();
            for w in s.split_whitespace() {
                if line.len() + w.len() + 1 > 68 {
                    lines.push(line);
                    line = String::new();
                }
                if !line.is_empty() {
                    line.push(' ');
                }
                line.push_str(w);
            }
            if !line.is_empty() {
                lines.push(line);
            }
            for (i, line) in lines.iter().enumerate() {
                text(&g.assets, line, vec2(300., 24. + i as f32 * 15.), 1., 0.75);
            }
            if button(g, 0, "NEXT", vec2(420., 280.), select) {
                if g.show_help_page < 2 {
                    g.show_help_page += 1;
                } else {
                    main_menu(g);
                }
            }
            if button(g, 1, "back", vec2(180., 280.), select) {
                if g.show_help_page > 0 {
                    g.show_help_page -= 1;
                } else {
                    main_menu(g);
                }
            }
        }
        Screen::Scores => {
            heading(g, "HIGH SCORES", 30.);
            let mode = g.score_page % 3;
            text(
                &g.assets,
                ["Race", "Email Rescue", "Time Trial"][mode],
                vec2(300., 55.),
                1.,
                1.,
            );
            text(&g.assets, "Saved on this device", vec2(300., 78.), 1., 0.7);
            for (i, d) in ["easy", "medium", "hard"].iter().enumerate() {
                let x = 105. + 195. * i as f32;
                text(&g.assets, d, vec2(x, 103.), 1., 1.);
                let rows = crate::scores::read(20 + mode * 3 + i);
                if rows.is_empty() {
                    let key = 210 + mode as i32 * 3 + i as i32;
                    text(
                        &g.assets,
                        &format!("{}", platform::get(key) as i32),
                        vec2(x, 137.),
                        1.,
                        1.,
                    );
                }
                for (rank, e) in rows.iter().take(5).enumerate() {
                    text(
                        &g.assets,
                        &format!(
                            "{} {}",
                            rank + 1,
                            e.name.chars().take(12).collect::<String>()
                        ),
                        vec2(x, 126. + 26. * rank as f32),
                        1.,
                        0.7,
                    );
                    text(
                        &g.assets,
                        &e.score.to_string(),
                        vec2(x, 138. + 26. * rank as f32),
                        1.,
                        0.7,
                    );
                }
            }
            if button(g, 0, "NEXT", vec2(420., 280.), select) {
                g.score_page = (mode + 1) % 3;
            }
            if button(g, 1, "back", vec2(180., 280.), select) {
                main_menu(g);
            }
        }
        Screen::ScoreEntry => {
            heading(g, "Enter your name", 70.);
            while let Some(c) = get_char_pressed() {
                if !c.is_control() && c.is_ascii() && g.score_name.len() < 20 {
                    g.score_name.push(c);
                }
            }
            if is_key_pressed(KeyCode::Backspace) {
                g.score_name.pop();
            }
            text(&g.assets, &g.score_name, vec2(300., 135.), 1., 1.);
            text(
                &g.assets,
                "Scores are saved on this device",
                vec2(300., 180.),
                1.,
                0.75,
            );
            if button(g, 0, "continue", vec2(300., 270.), select) {
                if !g.practice_used {
                    crate::scores::add_hover(g.mode, g.difficulty, &g.score_name, g.score);
                    g.score_page = g.mode as usize;
                }
                g.screen = Screen::Scores;
            }
        }
        _ => {}
    }
    if g.fps {
        text(
            &g.assets,
            &format!("{} fps", get_fps()),
            vec2(540., 310.),
            1.,
            0.75,
        );
    }
    true
}
