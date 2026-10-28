//! Active mission rules translated from the recovered game-control scripts.
use crate::world::nearest;
use macroquad::prelude::*;
#[derive(Clone, Copy, Debug, Default)]
pub struct Progress {
    pub checkpoint: usize,
    pub furthest: usize,
}
impl Progress {
    /// Require continuous checkpoint progress and a forward crossing of the finish plane.
    pub fn update(&mut self, track: &[Vec3], from: Vec3, to: Vec3, gate: Vec3) -> bool {
        if track.len() < 3 {
            return false;
        }
        let point = nearest(track, to);
        let n = track.len();
        if point.abs_diff(self.checkpoint) < 6 || self.checkpoint > n.saturating_sub(6) && point < 5
        {
            self.checkpoint = point;
            self.furthest = self.furthest.max(point);
        }
        let forward = (track[0] - track[n - 1]).with_z(0.).normalize_or_zero();
        let crossed = (from - gate).dot(forward) < 0. && (to - gate).dot(forward) >= 0.;
        if crossed && self.furthest >= n - 3 && self.checkpoint < 5 {
            self.furthest = 0;
            return true;
        }
        false
    }
}
pub fn score_multiplier(difficulty: u8) -> i32 {
    [1, 1, 2, 4][difficulty.min(3) as usize]
}
pub fn lap_bonus(seconds: f32, difficulty: u8) -> i32 {
    (120. - seconds).round().max(0.) as i32 * 50 * score_multiplier(difficulty)
}
pub fn bus_clock_step(dt: f32) -> f32 {
    dt * 100. / 60.
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shortcut_and_reverse_crossing_do_not_count_a_lap() {
        let t: Vec<_> = (0..12)
            .map(|i| {
                let a = i as f32 / 12. * std::f32::consts::TAU;
                vec3(a.cos() * 100., a.sin() * 100., 0.)
            })
            .collect();
        let gate = (t[0] + t[11]) * 0.5;
        let mut p = Progress::default();
        assert!(!p.update(&t, t[11], t[0], gate));
        for i in 1..12 {
            assert!(!p.update(&t, t[i - 1], t[i], gate));
        }
        assert!(!p.update(&t, t[0], t[11], gate));
        assert!(p.update(&t, t[11], t[0], gate));
        assert!(!p.update(&t, t[11], t[0], gate));
    }
    #[test]
    fn original_clock_and_lap_bonus_values() {
        assert_eq!(lap_bonus(60., 1), 3000);
        assert_eq!(lap_bonus(60., 3), 12000);
        assert_eq!(lap_bonus(150., 3), 0);
        assert!((bus_clock_step(1. / 30.) - 1. / 18.).abs() < 1e-6);
    }
}
