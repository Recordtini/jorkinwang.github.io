//! gGameControl.initOverlays/changeOverlay and gTrackOverlay in 600x320 coordinates.
use crate::{assets::Assets, game::Game, physics::Kind};
use macroquad::prelude::*;
pub const CLOCK: Vec2 = Vec2::new(20., 38.);
pub const RANK: Vec2 = Vec2::new(20., 85.);
pub const BEST: Vec2 = Vec2::new(20., 132.);
pub const LAP: Vec2 = Vec2::new(20., 180.);
pub const SCORE: Vec2 = Vec2::new(540., 20.);
pub fn radar_position(p: Vec3) -> Vec2 {
    vec2(60. - p.x * 0.00013, 260. + p.y * 0.00013)
}
pub fn clock(seconds: f32) -> String {
    let ticks = (seconds.max(0.) * 60.).round() as u32;
    if ticks / 3600 > 9 {
        format!("0:{}:{:02}", ticks / 3600, ticks / 60 % 60)
    } else {
        format!("{}:{:02}:{:02}", ticks / 3600, ticks / 60 % 60, ticks % 60)
    }
}
/// Sprite locations are registration-point centers, advanced by half adjacent widths.
pub fn glyph_centers(text: &str, origin: Vec2, width: impl Fn(char) -> f32) -> Vec<(char, Vec2)> {
    let chars: Vec<_> = text.to_lowercase().chars().take(8).collect();
    let mut x = origin.x;
    chars
        .iter()
        .enumerate()
        .map(|(i, &c)| {
            if i > 0 {
                x += (width(chars[i - 1]) / 2.).floor() + (width(c) / 2.).floor();
            }
            (c, vec2(x, origin.y))
        })
        .collect()
}
fn sprite(assets: &Assets, name: &str, center: Vec2, color: Color) {
    if let Some(t) = assets.texture(name) {
        draw_texture(
            t,
            center.x - (t.width() / 2.).floor(),
            center.y - (t.height() / 2.).floor(),
            color,
        );
    }
}
fn glyphs(assets: &Assets, text: &str, center: Vec2, limit: bool) {
    let width = |c| assets.texture(&format!("{c}sp")).map_or(10., |t| t.width());
    if limit {
        for (c, p) in glyph_centers(text, center, width) {
            sprite(assets, &format!("{c}sp"), p, WHITE);
        }
    } else {
        let mut x = center.x;
        let chars: Vec<_> = text.to_lowercase().chars().collect();
        for (i, &c) in chars.iter().enumerate() {
            if i > 0 {
                x += (width(chars[i - 1]) / 2.).floor() + (width(c) / 2.).floor();
            }
            sprite(assets, &format!("{c}sp"), vec2(x, center.y), WHITE);
        }
    }
}
pub fn message(assets: &Assets, text: &str) {
    for (i, line) in crate::bus_hud::message_lines(text).iter().enumerate() {
        let width: f32 = line
            .to_lowercase()
            .chars()
            .map(|c| {
                assets
                    .texture(&format!("{c}sp"))
                    .map_or(5., |t| (t.width() / 2.).floor())
            })
            .sum();
        glyphs(
            assets,
            line,
            vec2(300. - width, 40. + i as f32 * 20.),
            false,
        );
    }
}
pub fn draw(g: &Game) {
    debug_assert_eq!(g.kind(), Kind::Hover);
    let a = &g.assets;
    sprite(a, "hudsp.s", vec2(40., 90.), WHITE);
    glyphs(a, &clock(g.clock), CLOCK, true);
    glyphs(
        a,
        &g.world.hover_rank(&g.vehicle.hover_track).to_string(),
        RANK,
        true,
    );
    glyphs(
        a,
        &if g.best_lap > 0. {
            clock(g.best_lap)
        } else {
            "-:--:--".into()
        },
        BEST,
        true,
    );
    glyphs(
        a,
        &format!(
            "{}/{}",
            g.lap.min(if g.mode == 0 { 2 } else { 1 }),
            if g.mode == 0 { 2 } else { 1 }
        ),
        LAP,
        true,
    );
    glyphs(a, &g.score.to_string(), SCORE, true);
    sprite(a, "foptracksp.s", vec2(40., 260.), WHITE);
    let color = Color::new(1., 1., 1., 0.7);
    for e in g
        .world
        .entities
        .iter()
        .filter(|e| e.active && e.shape == "racer")
        .take(10)
    {
        sprite(a, "radarredsp", radar_position(e.position), color);
    }
    sprite(a, "radargreensp", radar_position(g.vehicle.pos), color);
    if g.message_timer > 0. {
        message(a, &g.message);
    }
}
