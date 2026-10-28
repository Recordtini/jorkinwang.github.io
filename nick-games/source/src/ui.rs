use crate::{
    game::{Game, Player, Screen},
    physics::Kind,
    platform,
};
use macroquad::prelude::*;
const YELLOW: Color = Color::new(1., 0.84, 0.1, 1.);
fn label(text: &str, x: f32, y: f32, size: f32, color: Color) {
    draw_text(text, x, y, size, color);
}
pub(crate) fn center(text: &str, y: f32, size: f32, color: Color) {
    let d = measure_text(text, None, size as u16, 1.);
    label(text, 300. - d.width / 2., y, size, color)
}
fn overlay() {
    draw_rectangle(0., 0., 600., 320., Color::new(0.015, 0.005, 0.04, 0.77));
}
pub(crate) fn button(g: &mut Game, idx: usize, text: &str, x: f32, y: f32, w: f32) -> bool {
    let (mx, my) = mouse_position();
    let aspect = 600. / 320.;
    let width = screen_width().min(screen_height() * aspect);
    let height = width / aspect;
    let px = (mx - (screen_width() - width) / 2.) * 600. / width;
    let py = (my - (screen_height() - height) / 2.) * 320. / height;
    let over = Rect::new(x - w / 2., y - 19., w, 29.).contains(vec2(px, py));
    if over && (mouse_delta_position().length_squared() > 0.) {
        g.ui_selection = idx
    }
    let selected = g.ui_selection == idx;
    let color = if over || selected { YELLOW } else { WHITE };
    if let Some(t) = g
        .assets
        .texture("buttonsp.s")
        .or_else(|| g.assets.texture("buttonsp"))
    {
        draw_texture_ex(
            t,
            x - w / 2.,
            y - 22.,
            Color::new(1., 1., 1., 0.8),
            DrawTextureParams {
                dest_size: Some(vec2(w, 32.)),
                ..Default::default()
            },
        );
    } else {
        draw_rectangle(
            x - w / 2.,
            y - 21.,
            w,
            30.,
            Color::new(0.12, 0.08, 0.3, 0.95),
        );
        draw_rectangle_lines(x - w / 2., y - 21., w, 30., 1., color);
    }
    let d = measure_text(text, None, 17, 1.);
    label(text, x - d.width / 2., y, 17., color);
    (over && is_mouse_button_released(MouseButton::Left))
        || (selected
            && (is_key_released(KeyCode::Enter)
                || is_key_released(KeyCode::Space)
                || platform::input(5) > 0.5))
}
fn title(g: &Game) {
    if let Some(t) = g.assets.texture("titlesp.s") {
        let w = if g.kind() == Kind::Bus { 570. } else { 270. };
        let h = w * t.height() / t.width();
        draw_texture_ex(
            t,
            300. - w / 2.,
            if g.kind() == Kind::Bus { 30. } else { 12. },
            WHITE,
            DrawTextureParams {
                dest_size: Some(vec2(w, h)),
                ..Default::default()
            },
        );
    } else {
        center(
            if g.kind() == Kind::Bus {
                "HEY ARNOLD! RUNAWAY BUS"
            } else {
                "INFORMATION STUPOR HIGHWAY"
            },
            65.,
            24.,
            YELLOW,
        )
    }
}
fn text_lines(text: &str, top: f32, size: f32) {
    for (i, line) in text.lines().enumerate() {
        center(line, top + i as f32 * (size + 4.), size, WHITE)
    }
}
pub fn draw(g: &mut Game) {
    let aspect = 600. / 320.;
    let sw = screen_width();
    let sh = screen_height();
    let w = sw.min(sh * aspect);
    let h = w / aspect;
    let mut camera = Camera2D::from_display_rect(Rect::new(0., 0., 600., 320.));
    camera.zoom.y = camera.zoom.y.abs();
    camera.viewport = Some((
        ((sw - w) / 2.) as i32,
        ((sh - h) / 2.) as i32,
        w as i32,
        h as i32,
    ));
    set_camera(&camera);
    let before = g.screen;
    if g.kind() == Kind::Bus
        && matches!(
            g.screen,
            Screen::Target | Screen::Paused | Screen::Finished | Screen::Ending
        )
    {
        crate::bus_ui::hud(g);
    }
    if g.kind() == Kind::Bus && crate::bus_ui::draw(g) {
        if g.screen != before {
            g.ui_selection = 0;
            g.sound("click.aif");
            g.audio_update();
        }
        set_default_camera();
        return;
    }
    if !matches!(
        g.screen,
        Screen::Playing | Screen::Ready | Screen::Replay | Screen::Ending | Screen::Instructs
    ) {
        overlay()
    }
    let count = match g.screen {
        Screen::Title | Screen::Players | Screen::Driver => 4,
        Screen::Mode | Screen::Difficulty | Screen::Finished => 3,
        Screen::Paused => 6,
        Screen::Options => crate::options_ui::count(g.options_tab),
        _ => 1,
    };
    if !matches!(
        g.screen,
        Screen::Playing | Screen::Ready | Screen::Replay | Screen::Ending | Screen::Instructs
    ) {
        let next = is_key_pressed(KeyCode::Down)
            || is_key_pressed(KeyCode::S)
            || is_key_pressed(KeyCode::Right)
            || platform::input(7) > 0.5;
        let prev = is_key_pressed(KeyCode::Up)
            || is_key_pressed(KeyCode::W)
            || is_key_pressed(KeyCode::Left)
            || platform::input(6) > 0.5;
        if next || prev {
            g.ui_selection = (g.ui_selection + if next { 1 } else { count - 1 }) % count;
            g.sound("rollover.aif");
        }
    }
    match g.screen {
        Screen::ScoreEntry | Screen::Quit | Screen::ClearScores => {}
        Screen::Ending => {}
        Screen::Title => {
            title(g);
            if button(g, 0, "PLAY", 300., 211., 170.) {
                g.screen = Screen::Mode
            }
            if button(g, 1, "HOW TO PLAY", 140., 257., 175.) {
                g.screen = Screen::Instructions
            }
            if button(g, 2, "HIGH SCORES", 460., 257., 175.) {
                g.screen = Screen::Scores
            }
            if button(g, 3, "OPTIONS", 300., 257., 125.) {
                g.options_return = Screen::Title;
                g.screen = Screen::Options
            }
            center("F1 options   |   F11 fullscreen", 306., 13., GRAY)
        }
        Screen::Mode => {
            title(g);
            center("CHOOSE GAME MODE", 190., 23., YELLOW);
            let modes = if g.kind() == Kind::Bus {
                ["RUNAWAY", "CRAZY", "CRUISE"]
            } else {
                ["RACE", "EMAIL RESCUE", "TIME TRIAL"]
            };
            for (i, name) in modes.iter().enumerate() {
                if button(g, i, name, 105. + 195. * i as f32, 258., 180.) {
                    g.mode = i as u8;
                    g.screen = Screen::Players
                }
            }
        }
        Screen::Players => {
            title(g);
            center("HOW MANY PLAYERS?", 192., 23., YELLOW);
            for i in 0..4 {
                if button(
                    g,
                    i,
                    &format!("{} PLAYER{}", i + 1, if i == 0 { "" } else { "S" }),
                    90. + 140. * i as f32,
                    254.,
                    130.,
                ) {
                    g.player_count = i + 1;
                    g.players.clear();
                    g.player_index = 0;
                    g.screen = Screen::Difficulty;
                }
            }
            center("Take turns on the same device", 293., 15., WHITE)
        }
        Screen::Difficulty => {
            title(g);
            center(
                &format!("PLAYER {} - CHOOSE DIFFICULTY", g.players.len() + 1),
                190.,
                22.,
                YELLOW,
            );
            for (i, name) in ["EASY", "MEDIUM", "HARD"].iter().enumerate() {
                if button(g, i, name, 105. + 195. * i as f32, 255., 175.) {
                    g.difficulty = i as u8 + 1;
                    if g.kind() == Kind::Bus {
                        g.screen = Screen::Driver
                    } else {
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
        }
        Screen::Driver => {
            center("CHOOSE BUS DRIVER", 45., 27., YELLOW);
            for (i, name) in ["Arnold", "Helga", "Gerald", "Grandpa"].iter().enumerate() {
                let key = format!("{}sp.t", name.to_lowercase());
                if let Some(t) = g.assets.texture(&key) {
                    draw_texture_ex(
                        t,
                        35. + 140. * i as f32,
                        90.,
                        WHITE,
                        DrawTextureParams {
                            dest_size: Some(vec2(105., 105.)),
                            ..Default::default()
                        },
                    );
                }
                if button(g, i, name, 90. + 140. * i as f32, 237., 125.) {
                    g.driver = i;
                    g.players.push(Player {
                        name: name.to_string(),
                        difficulty: g.difficulty,
                        score: 0,
                        done: false,
                    });
                    if g.players.len() == g.player_count {
                        g.player_index = 0;
                        g.difficulty = g.players[0].difficulty;
                        g.driver = ["Arnold", "Helga", "Gerald", "Grandpa"]
                            .iter()
                            .position(|s| *s == g.players[0].name)
                            .unwrap_or(0);
                        if let Err(e) = g.start() {
                            g.message = e;
                        }
                    } else {
                        g.screen = Screen::Difficulty
                    }
                }
            }
        }
        Screen::Instructions => {
            center("HOW TO PLAY", 34., 25., YELLOW);
            if g.kind() == Kind::Bus {
                text_lines(
                    "RUNAWAY: collect all the tomatoes before time runs out.\nCRAZY: stop at the marked targets to pick up and\ndrop off Arnold, Helga, Gerald and Grandpa.\nCRUISE: explore the neighborhood without a timer.\nAvoid the FutureTek bulldozers!",
                    64.,
                    17.,
                )
            } else {
                text_lines(
                    "RACE: beat the other racers over two laps.\nEMAIL RESCUE: collect the required envelopes\nbefore the other racers finish.\nTIME TRIAL: complete the circuit as fast as you can.\nGrab turbo, hearts, binary and time warp bonuses.",
                    64.,
                    17.,
                )
            }
            text_lines(
                "Arrows / WASD: accelerate, brake and steer\nSpace: powerslide / hover boost    C: camera    B: recover\nEsc / P: pause    M: mute    Tab: map    F1: options",
                198.,
                15.,
            );
            if button(g, 0, "BACK", 300., 298., 150.) {
                g.screen = Screen::Title
            }
        }
        Screen::Scores => {
            center("LOCAL HIGH SCORES", 35., 26., YELLOW);
            for (i, name) in ["EASY", "MEDIUM", "HARD"].iter().enumerate() {
                label(name, 205. + i as f32 * 125., 75., 17., YELLOW);
            }
            let modes = if g.kind() == Kind::Bus {
                ["RUNAWAY", "CRAZY", "CRUISE"]
            } else {
                ["RACE", "EMAIL RESCUE", "TIME TRIAL"]
            };
            for (mode, name) in modes.iter().enumerate() {
                let y = 112. + mode as f32 * 53.;
                label(name, 22., y, 17., WHITE);
                for difficulty in 1..=3 {
                    let key = 200
                        + if g.kind() == Kind::Hover { 10 } else { 0 }
                        + mode as i32 * 3
                        + difficulty
                        - 1;
                    label(
                        &format!("{:07}", platform::get(key) as i32),
                        205. + (difficulty - 1) as f32 * 125.,
                        y,
                        20.,
                        WHITE,
                    );
                    let best = platform::get(key + 200) as f32;
                    if g.kind() == Kind::Hover && best > 0. {
                        label(
                            &precise_time(best),
                            205. + (difficulty - 1) as f32 * 125.,
                            y + 19.,
                            13.,
                            GRAY,
                        );
                    }
                }
            }
            center("Saved on this device", 267., 14., GRAY);
            if button(g, 0, "BACK", 300., 302., 150.) {
                g.screen = Screen::Title;
            }
        }
        Screen::Ready | Screen::Playing | Screen::Replay | Screen::Instructs => {
            hud(g);
            if g.screen == Screen::Ready && g.kind() == Kind::Bus {
                crate::bus_ui::banner(g, "Ready!", 150.);
            } else if g.screen == Screen::Ready {
                center(
                    if g.countdown > 2. {
                        "READY!"
                    } else if g.countdown > 1. {
                        "SET!"
                    } else {
                        "GO!"
                    },
                    164.,
                    44.,
                    YELLOW,
                )
            }
            if g.screen == Screen::Replay {
                center("REPLAY - Esc to pause", 305., 15., YELLOW)
            }
        }
        Screen::Target => {
            center(
                if g.target_step == 1 {
                    "NEXT STOP"
                } else {
                    "YOU DID IT!"
                },
                55.,
                30.,
                YELLOW,
            );
            if g.target_step > 1 {
                center(&format!("TIME BONUS {}", g.target_bonus), 90., 24., WHITE);
            }
            center(
                &format!(
                    "{} {} at",
                    if g.carrying { "Drop off" } else { "Pick up" },
                    ["Arnold", "Helga", "Gerald", "Grandpa"][g.passenger]
                ),
                145.,
                21.,
                YELLOW,
            );
            center(&g.world.entities[g.target].name, 177., 22., WHITE);
            if g.mode != 2 {
                center(&format!("{} seconds", g.clock as i32), 211., 20., WHITE);
            }
            if button(g, 0, "LET'S GO!", 300., 273., 220.) {
                if g.target_step > 1 {
                    g.score += g.target_bonus;
                }
                g.world.transitions.clear();
                g.screen = Screen::Ready;
                g.countdown = if g.target_step == 1 { 2. } else { 0.5 };
                g.renderer.reset_camera(&g.vehicle);
            }
        }
        Screen::Paused => {
            center("PAUSED", 58., 31., YELLOW);
            if button(g, 0, "CONTINUE", 300., 114., 220.) {
                g.screen = g.previous_screen
            }
            if button(g, 1, "BACK UP", 300., 151., 220.) {
                g.backup();
                g.screen = Screen::Playing
            }
            if button(g, 2, "RESTART", 300., 188., 220.) {
                let _ = g.start();
            }
            if button(g, 3, "OPTIONS", 300., 225., 220.) {
                g.options_return = Screen::Paused;
                g.screen = Screen::Options
            }
            if button(g, 5, "FINISH RUN", 480., 297., 180.) {
                g.finish(true, "RUN COMPLETE");
            }
            if button(g, 4, "MAIN MENU", 300., 262., 220.) {
                g.screen = Screen::Title;
                g.music("titlemusic.aif")
            }
        }
        Screen::Options => {
            crate::options_ui::draw(g);
        }
        Screen::Finished => {
            center(
                if g.won { "YOU DID IT!" } else { "GAME OVER" },
                45.,
                32.,
                YELLOW,
            );
            center(&g.message, 86., 20., WHITE);
            center(
                &format!("SCORE {:07}   TIME {}", g.score, time(g.elapsed)),
                121.,
                22.,
                WHITE,
            );
            if g.players.len() > 1 {
                for (i, p) in g.players.iter().enumerate() {
                    center(
                        &format!("PLAYER {}: {} - {}", i + 1, p.name, p.score),
                        154. + i as f32 * 19.,
                        16.,
                        if p.done { YELLOW } else { GRAY },
                    );
                }
            }
            if button(g, 0, "TRY AGAIN", 118., 267., 170.) {
                let _ = g.start();
            }
            if button(g, 1, "REPLAY", 300., 267., 150.) {
                g.screen = Screen::Replay;
                g.replay_index = 0;
                if let Some(f) = g.trace.front() {
                    g.vehicle.pos = f.pos;
                    g.vehicle.previous = f.pos;
                    g.vehicle.yaw = f.yaw;
                    g.vehicle.previous_yaw = f.yaw;
                    g.vehicle.travel_yaw = f.yaw;
                }
                g.renderer.reset_camera(&g.vehicle);
                g.music("gamemusic.aif");
            }
            if g.players.iter().any(|p| !p.done) {
                if button(g, 2, "NEXT PLAYER", 485., 267., 175.) {
                    g.player_index = (g.player_index + 1) % g.players.len();
                    g.difficulty = g.players[g.player_index].difficulty;
                    g.driver = ["Arnold", "Helga", "Gerald", "Grandpa"]
                        .iter()
                        .position(|s| *s == g.players[g.player_index].name)
                        .unwrap_or(0);
                    let _ = g.start();
                }
            } else if button(g, 2, "MAIN MENU", 485., 267., 175.) {
                g.screen = Screen::Title;
                g.music("titlemusic.aif")
            }
        }
    }
    if g.fps {
        label(&format!("{} FPS", get_fps()), 8., 310., 13., GREEN)
    }
    if g.screen != before {
        g.ui_selection = if before == Screen::Options {
            g.options_selection
        } else {
            0
        };
        g.sound("click.aif");
        g.audio_update();
    }
    set_default_camera();
}
pub fn time(t: f32) -> String {
    let secs = t.max(0.) as u32;
    format!("{}:{:02}", secs / 60, secs % 60)
}
pub fn precise_time(t: f32) -> String {
    let ticks = (t.max(0.) * 60.) as u32;
    format!("{}:{:02}:{:02}", ticks / 3600, ticks / 60 % 60, ticks % 60)
}
fn hud(g: &Game) {
    if g.kind() == Kind::Bus {
        crate::bus_ui::hud(g);
    } else {
        crate::hover_hud::draw(g);
    }
    if g.minimap {
        map(g);
    }
}

fn map(g: &Game) {
    let rect = Rect::new(12., 160., 150., 145.);
    draw_rectangle(rect.x, rect.y, rect.w, rect.h, Color::new(0., 0., 0., 0.8));
    let span = if g.kind() == Kind::Bus {
        40000.
    } else {
        430000.
    };
    let map = |p: Vec3| {
        vec2(
            rect.x + rect.w / 2. + p.x / span * rect.w,
            rect.y + rect.h / 2. + p.y / span * rect.h,
        )
    };
    if !g.world.track.is_empty() {
        for p in g.world.track.windows(2) {
            let a = map(p[0]);
            let b = map(p[1]);
            draw_line(a.x, a.y, b.x, b.y, 1., BLUE)
        }
    } else {
        for e in &g.world.entities {
            if e.active && (e.shape.starts_with("coin") || e.shape == "target") {
                let p = map(e.position);
                if rect.contains(p) {
                    draw_circle(p.x, p.y, 2., YELLOW)
                }
            }
        }
    }
    let p = map(g.vehicle.pos);
    if rect.contains(p) {
        draw_circle(p.x, p.y, 3., WHITE)
    }
}
