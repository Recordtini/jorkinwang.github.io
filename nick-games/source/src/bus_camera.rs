//! Source camera parent: 1000/700 chase distances, speed-limited pan, obstacle lift.
use crate::{collision::CollisionWorld, physics::Vehicle};
use macroquad::prelude::*;
#[derive(Clone, Debug)]
pub struct BusCamera {
    pub previous: Vec3,
    pub position: Vec3,
    pub previous_target: Vec3,
    pub target: Vec3,
}
pub fn chase_distance(mode: u8) -> f32 {
    if mode == 1 { 700. } else { 1000. }
}
fn body(v: &Vehicle) -> Mat4 {
    Mat4::from_rotation_z(v.yaw.to_radians())
        * Mat4::from_rotation_x(v.pitch.to_radians())
        * Mat4::from_rotation_y(v.roll.to_radians())
}
impl BusCamera {
    pub fn reset(v: &Vehicle, mode: u8) -> Self {
        let d = chase_distance(mode);
        let a = v.travel_yaw.to_radians();
        let p = v.pos - vec3(a.sin(), -a.cos(), 0.) * d + Vec3::Z * d * 0.2;
        Self {
            previous: p,
            position: p,
            previous_target: v.pos,
            target: v.pos,
        }
    }
    pub fn tick(&mut self, v: &Vehicle, world: &CollisionWorld, mode: u8) {
        self.previous = self.position;
        self.previous_target = self.target;
        self.target = v.pos;
        if mode == 2 {
            let b = body(v);
            self.position = v.pos + b.transform_vector3(vec3(0., 100., 70.));
            self.target = self.position + b.transform_vector3(vec3(0., -1000., 0.));
            return;
        }
        let dist = chase_distance(mode);
        let angle = v.travel_yaw.to_radians();
        let direction = vec3(angle.sin(), -angle.cos(), 0.);
        let mut desired = v.pos - direction * dist + Vec3::Z * dist * 0.2;
        let radius = desired.distance(v.pos);
        if let Some(hit) = world.segment(v.pos, desired) {
            if (hit.normal.z * 10.).round() == 0. {
                let horizontal = hit.pos.truncate().distance(v.pos.truncate());
                // Preserve the original nested-root wall-lift expression.
                desired = vec3(
                    hit.pos.x,
                    hit.pos.y,
                    v.pos.z + (radius * radius - horizontal).max(0.).sqrt(),
                );
            } else {
                let horizontal = (radius * radius - (v.pos.z - hit.pos.z).powi(2))
                    .max(0.)
                    .sqrt();
                desired = vec3(
                    v.pos.x - direction.x * horizontal,
                    v.pos.y - direction.y * horizontal,
                    hit.pos.z,
                );
            }
            if let Some(second) = world.segment(v.pos, desired) {
                desired = second.pos;
            }
        }
        let max_pan =
            if v.speed > 20. { v.speed + 10. } else { 20. } + if v.reverse { 50. } else { 0. };
        let delta = desired - self.position;
        self.position += delta.normalize_or_zero() * delta.length().min(max_pan);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_chase_camera_distances() {
        assert_eq!(chase_distance(0), 1000.);
        assert_eq!(chase_distance(1), 700.);
    }
    #[test]
    fn chase_pan_is_capped_per_simulation_tick_and_faster_in_reverse() {
        use crate::physics::{Kind, Params};
        let mut vehicle = Vehicle::new(Kind::Bus, Vec3::ZERO, Params::hover(), 1);
        vehicle.travel_yaw = 0.;
        let world = CollisionWorld::new(1000.);
        let mut rig = BusCamera::reset(&vehicle, 0);
        vehicle.pos.x = 1000.;
        let before = rig.position;
        rig.tick(&vehicle, &world, 0);
        assert!((rig.position.distance(before) - 20.).abs() < 0.0001);
        vehicle.speed = 60.;
        vehicle.reverse = true;
        let before = rig.position;
        rig.tick(&vehicle, &world, 0);
        assert!((rig.position.distance(before) - 120.).abs() < 0.0001);
    }
}
