//! Authored model transforms, converted from Director percent scale once.
use macroquad::prelude::*;
pub fn trail_matrix(position: Vec3, yaw: f32, pitch: f32, roll: f32, speed: f32) -> Mat4 {
    let rotation = Mat4::from_rotation_z(yaw.to_radians())
        * Mat4::from_rotation_x(pitch.to_radians())
        * Mat4::from_rotation_y(roll.to_radians());
    let pos = position + rotation.transform_vector3(vec3(0., 270., -10.));
    Mat4::from_translation(pos)
        * rotation
        * Mat4::from_scale(vec3(2.4, 2.4 * ((speed - 50.) / 350.).clamp(0., 1.), 2.4))
}
pub fn angle(previous: f32, current: f32, alpha: f32) -> f32 {
    previous + ((current - previous + 180.).rem_euclid(360.) - 180.) * alpha
}
