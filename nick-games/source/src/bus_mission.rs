//! chooseTarget/showLocation and end-state rules in gGameControl.
use macroquad::prelude::*;
pub fn time_limit(distance: f32, difficulty: u8, steps: usize) -> f32 {
    if difficulty == 1 && steps <= 2 {
        180.
    } else {
        30. + (distance / 50000. * 120.).round() / difficulty as f32 - steps as f32
    }
}
pub fn target_bonus(seconds_left: f32, mode: u8, difficulty: u8, steps: usize) -> i32 {
    if mode == 2 || difficulty == 1 && steps <= 3 {
        1000
    } else {
        seconds_left.round() as i32 * 100 * difficulty as i32
    }
}
pub fn time_bonus(seconds_left: f32, difficulty: u8) -> i32 {
    seconds_left.round() as i32 * 100 * difficulty as i32
}
pub fn arrival(target: usize, ground_object: Option<usize>, ground_speed: f32) -> bool {
    ground_object == Some(target) && ground_speed == 0.
}
pub fn destination(choices: &[usize], previous: usize, rng: &mut u64) -> Option<usize> {
    let choices: Vec<_> = choices.iter().copied().filter(|i| *i != previous).collect();
    if choices.is_empty() {
        None
    } else {
        Some(choices[crate::bus_actor::random(rng, choices.len())])
    }
}
/// Recovered boarding/exiting points are ground positions, not character centers.
pub fn passenger_route(pos: Vec3, yaw: f32, pitch: f32, roll: f32, exiting: bool) -> Vec<Vec3> {
    let points: &[(f32, f32, f32)] = if exiting {
        &[
            (0., 50., -25.),
            (0., -220., -25.),
            (-100., -220., -100.),
            (-250., -220., -100.),
            (-260., -320., -100.),
        ]
    } else {
        &[
            (-300., -220., -100.),
            (-100., -220., -100.),
            (0., -220., -25.),
            (0., 150., -25.),
        ]
    };
    let clearance = roll.abs().to_radians().sin() * 80. + pitch.abs().to_radians().sin() * 150.;
    let matrix = Mat4::from_translation(pos - Vec3::Z * clearance)
        * Mat4::from_rotation_z(yaw.rem_euclid(360.).round().to_radians())
        * Mat4::from_rotation_x(if exiting {
            0.
        } else {
            pitch.rem_euclid(360.).round().to_radians()
        });
    points
        .iter()
        .map(|&(x, y, z)| matrix.transform_point3(vec3(x, y, z)))
        .collect()
}
