//! Optional enhancements, separate from the recovered game menus.
use crate::{
    game::{Game, Screen},
    platform,
    ui::{button, center},
};
use macroquad::prelude::*;
pub fn count(tab: u8) -> usize {
    match tab {
        0 => 11,
        1 => 9,
        _ => 14,
    }
}
fn on(value: bool) -> &'static str {
    if value { "ON" } else { "OFF" }
}
fn level(g: &mut Game, index: usize, label: &str, value: f32, y: f32) -> Option<f32> {
    center(
        &format!("{label}: {}%", (value * 100.).round() as i32),
        y + 7.,
        21.,
        WHITE,
    );
    if button(g, index, "-", 95., y, 65.) {
        Some((value - 0.1).max(0.))
    } else if button(g, index + 1, "+", 505., y, 65.) {
        Some((value + 0.1).min(1.))
    } else {
        None
    }
}
pub fn draw(g: &mut Game) {
    center("OPTIONS", 27., 25., YELLOW);
    for (i, name) in ["DISPLAY", "GAMEPLAY", "AUDIO"].iter().enumerate() {
        if button(g, i, name, 110. + i as f32 * 190., 61., 170.) {
            g.options_tab = i as u8;
        }
    }
    match g.options_tab {
        0 => {
            if button(
                g,
                3,
                &format!("Fill browser window: {}", on(g.renderer.widescreen)),
                300.,
                105.,
                480.,
            ) {
                g.renderer.widescreen = !g.renderer.widescreen;
                platform::set(12, g.renderer.widescreen as u8 as f64);
            }
            if button(
                g,
                4,
                &format!("Motion smoothing: {}", on(g.renderer.smooth)),
                300.,
                141.,
                480.,
            ) {
                g.renderer.smooth = !g.renderer.smooth;
                platform::set(10, if g.renderer.smooth { 1. } else { 2. });
            }
            if button(
                g,
                5,
                &format!("Texture filtering: {}", on(g.renderer.filtering)),
                300.,
                177.,
                480.,
            ) {
                g.renderer.filtering = !g.renderer.filtering;
                platform::set(11, g.renderer.filtering as u8 as f64);
            }
            let cameras = if g.kind() == crate::physics::Kind::Bus {
                &["Follow", "Close follow", "Driver"][..]
            } else {
                &["Follow", "Wide", "Driver", "Overhead"][..]
            };
            if button(
                g,
                6,
                &format!("Camera: {}", cameras[g.renderer.camera_mode as usize]),
                300.,
                213.,
                480.,
            ) {
                g.renderer.camera_mode = (g.renderer.camera_mode + 1) % cameras.len() as u8;
                platform::set(20, g.renderer.camera_mode as f64);
            }
            if button(
                g,
                7,
                &format!("FPS display: {}", on(g.fps)),
                300.,
                249.,
                480.,
            ) {
                g.fps = !g.fps;
                platform::set(21, g.fps as u8 as f64);
            }
        }
        1 => {
            if button(
                g,
                3,
                &format!("Unlimited time: {}", on(g.unlimited_time)),
                300.,
                105.,
                480.,
            ) {
                g.unlimited_time = !g.unlimited_time;
                platform::set(16, g.unlimited_time as u8 as f64);
                if g.unlimited_time
                    && !matches!(
                        g.options_return,
                        Screen::Title
                            | Screen::Mode
                            | Screen::Players
                            | Screen::Difficulty
                            | Screen::Driver
                    )
                {
                    g.practice_used = true;
                }
            }
            if matches!(g.options_return, Screen::Playing | Screen::Paused) {
                if button(g, 4, "Recover vehicle", 300., 145., 480.) {
                    g.backup();
                    g.options_return = Screen::Playing;
                }
            } else {
                center("Recovery is available during play", 152., 18., GRAY);
            }
            if g.kind() == crate::physics::Kind::Hover {
                if button(
                    g,
                    5,
                    &format!(
                        "Opponent pace: {}",
                        if g.relaxed_opponents {
                            "RELAXED (practice)"
                        } else {
                            "ORIGINAL"
                        }
                    ),
                    300.,
                    185.,
                    480.,
                ) {
                    g.toggle_opponent_pace();
                }
            } else {
                center("Arrows / WASD drive · Space powerslides", 226., 17., WHITE);
            }
            center("C camera · B recover", 249., 17., WHITE);
        }
        _ => {
            if let Some(v) = level(g, 3, "Master", g.volume, 104.) {
                g.volume = v;
                platform::set(13, 1. + v as f64);
                g.audio_update();
            }
            if let Some(v) = level(g, 5, "Music", g.music_volume, 141.) {
                g.music_volume = v;
                platform::set(18, 1. + v as f64);
                g.audio_update();
            }
            if let Some(v) = level(g, 7, "Effects", g.effects_volume, 178.) {
                g.effects_volume = v;
                platform::set(17, 1. + v as f64);
                g.audio_update();
            }
            if button(
                g,
                9,
                &format!("Music: {}", on(g.music_enabled)),
                300.,
                215.,
                480.,
            ) {
                g.music_enabled = !g.music_enabled;
                platform::set(15, if g.music_enabled { 1. } else { 2. });
                g.audio_update();
            }
            if button(
                g,
                10,
                &format!("Mute all: {}", on(g.muted)),
                300.,
                250.,
                480.,
            ) {
                g.muted = !g.muted;
                platform::set(14, g.muted as u8 as f64);
                g.audio_update();
            }
        }
    }
    let footer = count(g.options_tab) - 3;
    if button(g, footer, "Original defaults", 110., 291., 190.) {
        g.reset_options();
    }
    if button(g, footer + 1, "Fullscreen", 310., 291., 170.) {
        platform::fullscreen();
    }
    if button(g, footer + 2, "Done", 500., 291., 150.) {
        g.close_options();
    }
}

/// Browser accessibility mirror. Rust owns option state and mutations.
pub fn browser_state(g: &Game) -> serde_json::Value {
    if g.screen != Screen::Options {
        return serde_json::Value::Null;
    }
    let mut rows = serde_json::json!([
        [
            1,
            format!("Fill browser window: {}", on(g.renderer.widescreen))
        ],
        [2, format!("Motion smoothing: {}", on(g.renderer.smooth))],
        [
            3,
            format!("Texture filtering: {}", on(g.renderer.filtering))
        ],
        [4, format!("Change camera ({})", g.renderer.camera_mode + 1)],
        [5, format!("FPS display: {}", on(g.fps))],
        [6, format!("Unlimited time: {}", on(g.unlimited_time))],
        [8, "Recover vehicle"],
        [
            9,
            format!("Master volume − ({}%)", (g.volume * 100.).round())
        ],
        [10, "Master volume +"],
        [
            11,
            format!("Music volume − ({}%)", (g.music_volume * 100.).round())
        ],
        [12, "Music volume +"],
        [
            13,
            format!("Effects volume − ({}%)", (g.effects_volume * 100.).round())
        ],
        [14, "Effects volume +"],
        [15, format!("Music: {}", on(g.music_enabled))],
        [16, format!("Mute all: {}", on(g.muted))],
        [17, "Original defaults"],
        [18, "Fullscreen"]
    ]);
    if g.kind() == crate::physics::Kind::Hover {
        rows.as_array_mut().unwrap().insert(
            7,
            serde_json::json!([
                20,
                format!(
                    "Opponent pace: {}",
                    if g.relaxed_opponents {
                        "RELAXED (practice)"
                    } else {
                        "ORIGINAL"
                    }
                )
            ]),
        );
    }
    rows
}
pub fn browser_action(g: &mut Game, id: u32) {
    match id {
        1 => {
            g.renderer.widescreen = !g.renderer.widescreen;
            platform::set(12, g.renderer.widescreen as u8 as f64);
        }
        2 => {
            g.renderer.smooth = !g.renderer.smooth;
            platform::set(10, if g.renderer.smooth { 1. } else { 2. });
        }
        3 => {
            g.renderer.filtering = !g.renderer.filtering;
            platform::set(11, g.renderer.filtering as u8 as f64);
        }
        4 => {
            g.renderer.camera_mode = (g.renderer.camera_mode + 1)
                % if g.kind() == crate::physics::Kind::Bus {
                    3
                } else {
                    4
                };
            platform::set(20, g.renderer.camera_mode as f64);
        }
        5 => {
            g.fps = !g.fps;
            platform::set(21, g.fps as u8 as f64);
        }
        6 => {
            g.unlimited_time = !g.unlimited_time;
            platform::set(16, g.unlimited_time as u8 as f64);
            if g.unlimited_time && matches!(g.options_return, Screen::Playing | Screen::Paused) {
                g.practice_used = true;
            }
        }
        8 => {
            if matches!(g.options_return, Screen::Playing | Screen::Paused) {
                g.backup();
            }
        }
        9 | 10 => {
            g.volume = (g.volume + if id == 9 { -0.1 } else { 0.1 }).clamp(0., 1.);
            platform::set(13, 1. + g.volume as f64);
        }
        11 | 12 => {
            g.music_volume = (g.music_volume + if id == 11 { -0.1 } else { 0.1 }).clamp(0., 1.);
            platform::set(18, 1. + g.music_volume as f64);
        }
        13 | 14 => {
            g.effects_volume = (g.effects_volume + if id == 13 { -0.1 } else { 0.1 }).clamp(0., 1.);
            platform::set(17, 1. + g.effects_volume as f64);
        }
        15 => {
            g.music_enabled = !g.music_enabled;
            platform::set(15, if g.music_enabled { 1. } else { 2. });
        }
        16 => {
            g.muted = !g.muted;
            platform::set(14, g.muted as u8 as f64);
        }
        17 => g.reset_options(),
        18 => platform::fullscreen(),
        19 => g.close_options(),
        20 => g.toggle_opponent_pace(),
        _ => {}
    }
    g.audio_update();
}
