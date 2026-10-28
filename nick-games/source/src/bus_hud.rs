//! gGameControl's sprite HUD coordinates, timer units and message wrapping.
use macroquad::prelude::*;
pub const CLOCK_X: [f32; 7] = [480., 492., 504., 522., 534., 546., 564.];
pub const SCORE: Vec2 = Vec2::new(20., 17.);
pub const DRIVER: Vec2 = Vec2::new(40., 290.);
pub const PASSENGER: Vec2 = Vec2::new(110., 290.);
pub const SPEED: Vec2 = Vec2::new(530., 295.);
pub const MPH: Vec2 = Vec2::new(580., 298.);
pub fn clock(seconds: f32) -> String {
    let ticks = (seconds.max(0.) * 60.).round() as u32;
    format!("{}:{:02}:{:02}", ticks / 3600, ticks / 60 % 60, ticks % 60)
}
pub fn message_lines(text: &str) -> Vec<String> {
    let truncated: String = text.chars().take(135).collect();
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in truncated.split_whitespace() {
        if current.chars().count() + word.chars().count() >= 30 {
            lines.push(current);
            current = word.into();
        } else {
            if !current.is_empty() {
                current.push(' ');
            }
            current.push_str(word);
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}
/// AlignObject(compass, camera, 0, 50, 20), followed by RotateObject to target.
pub fn compass_position(eye: Vec3, look_at: Vec3) -> Vec3 {
    let forward = (look_at - eye).normalize_or_zero();
    let right = forward.cross(Vec3::Z).normalize_or_zero();
    let up = right.cross(forward).normalize_or_zero();
    eye + forward * 50. + up * 20.
}
