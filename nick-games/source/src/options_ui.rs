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
            if button(
                g,
                4,
                &format!("Minimap: {}", on(g.minimap)),
                300.,
                145.,
                480.,
            ) {
                g.minimap = !g.minimap;
                platform::set(19, g.minimap as u8 as f64);
            }
            if matches!(g.options_return, Screen::Playing | Screen::Paused) {
                if button(g, 5, "Recover vehicle", 300., 185., 480.) {
                    g.backup();
                    g.options_return = Screen::Playing;
                }
            } else {
                center("Recovery is available during play", 192., 18., GRAY);
            }
            center("Arrows / WASD drive · Space powerslides", 226., 17., WHITE);
            center("C camera · B recover · Tab minimap", 249., 17., WHITE);
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
