//! Layout uses logical pixels for input; GPU viewports use framebuffer pixels.
use macroquad::prelude::*;
#[derive(Clone, Copy, Debug)]
pub struct View {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}
impl View {
    pub fn fit(width: f32, height: f32) -> Self {
        let w = width.min(height * 600. / 320.);
        let h = w * 320. / 600.;
        Self {
            x: (width - w) / 2.,
            y: (height - h) / 2.,
            width: w,
            height: h,
        }
    }
    pub fn physical(self, dpi: f32) -> (i32, i32, i32, i32) {
        (
            (self.x * dpi).round() as i32,
            (self.y * dpi).round() as i32,
            (self.width * dpi).round() as i32,
            (self.height * dpi).round() as i32,
        )
    }
    pub fn game_position(self, p: Vec2) -> Vec2 {
        vec2(
            (p.x - self.x) * 600. / self.width,
            (p.y - self.y) * 320. / self.height,
        )
    }
}
pub fn current() -> View {
    View::fit(screen_width(), screen_height())
}
