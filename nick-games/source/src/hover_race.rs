//! NickFOP gHeroDrive.updateLapPos and gObstacles racer state.
use crate::{collision::CollisionWorld, world::Entity};
use macroquad::prelude::*;
pub fn manhattan(a: Vec3, b: Vec3) -> f32 {
    (a.x - b.x).abs() + (a.y - b.y).abs()
}
pub fn angle_range(current: f32, target: f32, minimum: f32) -> f32 {
    let d = (target - current + 180.).rem_euclid(360.) - 180.;
    if d.abs() <= minimum {
        target
    } else {
        current + d.signum() * (d.abs() * 0.1).max(minimum)
    }
}
#[derive(Clone, Debug)]
pub struct TrackPosition {
    pub point: usize,
    pub distance: f32,
    pub lap: u32,
    pub counter: usize,
    pub wrong_way: u32,
}
impl Default for TrackPosition {
    fn default() -> Self {
        Self {
            point: 0,
            distance: 2000.,
            lap: 1,
            counter: 0,
            wrong_way: 0,
        }
    }
}
impl TrackPosition {
    pub fn update(&mut self, track: &[Vec3], position: Vec3, racer: bool, surface: &str) {
        if track.is_empty() {
            return;
        }
        let old_point = self.point;
        let old_dist = self.distance;
        let radius = if racer { 2 } else { 5 };
        let mut closest = self.point;
        let mut distance = self.distance;
        for offset in -radius..=radius {
            let i = (self.point as i32 + offset).rem_euclid(track.len() as i32) as usize;
            let d = manhattan(track[i], position);
            if d < distance {
                closest = i;
                distance = d;
            }
        }
        self.point = (closest + 1) % track.len();
        self.distance = manhattan(track[self.point], position);
        if self.point.abs_diff(self.counter) < if racer { 10 } else { 5 } {
            self.counter = self.point;
        }
        if !racer && surface.contains("alt") && self.counter >= 30 {
            self.counter = self.point;
        }
        if !racer && self.point == old_point && self.distance > old_dist && !surface.contains("alt")
        {
            self.wrong_way += 1;
        } else {
            self.wrong_way = 0;
        }
    }
    pub fn finish(&mut self, n: usize, surface: &str, collision: &str) -> bool {
        if n >= 3
            && self.counter + 1 >= n - 2
            && (surface.contains("finish")
                || collision.contains("finish")
                || collision.contains("goal"))
        {
            self.lap += 1;
            self.counter = 0;
            true
        } else {
            false
        }
    }
    pub fn ahead_of(&self, other: &Self, n: usize) -> bool {
        let lap = |p: &Self| p.lap + u32::from(p.point < 4 && p.counter + 1 > n.saturating_sub(2));
        lap(self) > lap(other)
            || lap(self) == lap(other)
                && (self.point > other.point
                    || self.point == other.point && self.distance.round() < other.distance.round())
    }
}
#[derive(Clone, Debug, Default)]
pub struct Racer {
    pub acceleration: f32,
    pub direction: Vec3,
    pub velocity: Vec3,
    pub bank: f32,
    pub phase: u32,
    pub track: TrackPosition,
    pub jump_start: f32,
    pub jump_speed: f32,
    pub jump_time: f32,
    pub shadow_z: f32,
    pub shadow_pitch: f32,
    pub shadow_bank: f32,
    pub collision: String,
    pub finished: bool,
}
pub fn configure(e: &mut Entity, track: &[Vec3], difficulty: u8, rng: &mut u64) {
    let (base, spread) = match difficulty {
        1 => (9., 4),
        2 => (11., 6),
        _ => (14., 6),
    };
    e.racer.acceleration = base + (crate::bus_actor::random(rng, spread) + 1) as f32;
    e.path = track
        .iter()
        .map(|p| {
            *p + vec3(
                1000. - (crate::bus_actor::random(rng, 2000) + 1) as f32,
                1000. - (crate::bus_actor::random(rng, 2000) + 1) as f32,
                0.,
            )
        })
        .collect();
    e.path_index = 0;
    e.racer.shadow_z = e.position.z - e.scale * 0.5;
}
fn target(e: &Entity) -> Vec3 {
    (e.path[e.racer.track.point % e.path.len()] + Vec3::Z * e.scale * 0.5 - e.position)
        .normalize_or_zero()
}
fn move_axes(e: &mut Entity, index: usize, world: &CollisionWorld) {
    let previous = e.position;
    let mut next = previous + e.racer.velocity.with_z(0.);
    for axis in 0..2 {
        let radius = 20. * e.racer.velocity[axis].signum();
        let from = if axis == 0 {
            previous
        } else {
            vec3(next.x, previous.y, previous.z)
        };
        let mut to = from;
        to[axis] = next[axis] + radius;
        if let Some(hit) = world.segment_except(from, to, index)
            && (hit.normal.z * 100.).round().abs() < 50.
            && !matches!(hit.texture.as_str(), "finish" | "dirt")
        {
            e.racer.collision = hit.texture.clone();
            next[axis] = hit.pos[axis] - radius;
            if !matches!(hit.texture.as_str(), "gridwall" | "empty") {
                e.speed *= 0.8;
            }
        }
    }
    e.position = next;
}
fn shadow(e: &mut Entity, index: usize, world: &CollisionWorld, vector: Vec3) {
    if let Some(hit) = world.segment_except(
        e.position + Vec3::Z * (e.scale + 200.),
        e.position - Vec3::Z * 5000.,
        index,
    ) {
        e.surface = hit.texture;
        e.racer.shadow_z = hit.pos.z;
        let n = hit.normal;
        let horizontal = vector.truncate().length();
        if n.z != 0. && horizontal > 0. {
            e.racer.shadow_pitch = -(-(n.x * vector.x + n.y * vector.y) / n.z / horizontal)
                .atan()
                .to_degrees();
            e.racer.shadow_bank = (-(n.x * vector.y - n.y * vector.x) / n.z / horizontal)
                .atan()
                .to_degrees();
        }
    }
}
pub fn tick(e: &mut Entity, index: usize, world: &CollisionWorld, track: &[Vec3], laps: u32) {
    if e.path.is_empty() {
        return;
    }
    e.racer.phase = (e.racer.phase + 1) % 18;
    let last_surface = e.surface.clone();
    let old_pitch = e.tilt;
    let old_yaw = e.rotation;
    e.racer.collision.clear();
    if e.air_ticks > 0 {
        move_axes(e, index, world);
        e.racer.jump_time += 0.05;
        e.air_ticks += 1;
        let t = e.racer.jump_time;
        e.position.z = e.racer.jump_start + e.racer.jump_speed * t - 3600. * t * t / 2.;
        e.racer.bank = angle_range(e.racer.bank, 0., 0.1);
        e.tilt += 0.5;
        shadow(e, index, world, e.racer.direction);
        if e.position.z < e.racer.shadow_z + 100. {
            e.air_ticks = 0;
            e.position.z = e.racer.shadow_z + e.scale * 0.5;
            e.tilt = e.racer.shadow_pitch;
            e.racer.bank = e.racer.shadow_bank;
            e.racer.direction = target(e);
            e.racer.velocity = e.racer.direction * e.speed;
        }
    } else {
        let vector = target(e);
        let desired = if vector.x == 0. && vector.y == 0. {
            old_yaw
        } else {
            vector.x.atan2(-vector.y).to_degrees()
        };
        e.rotation = angle_range(old_yaw, desired, 0.1);
        let turn = (old_yaw - e.rotation).abs().min(10.) * 3.;
        if e.racer.finished {
            e.speed -= e.racer.acceleration * 2.;
            if e.speed <= 150. {
                e.rotation = if e.speed > 20. { old_yaw + 5. } else { old_yaw };
            }
            if e.speed <= 0. {
                e.speed = 1.;
            }
        } else if e.speed < 100. {
            e.speed += e.racer.acceleration;
        } else if turn > 0.1 {
            e.speed -= turn;
        } else if e.speed < e.max_speed {
            e.speed += e.racer.acceleration;
        }
        e.racer.bank = if e.speed <= 10. {
            0.
        } else {
            angle_range(
                e.racer.bank,
                if e.speed <= 100. {
                    0.
                } else {
                    (e.rotation - old_yaw) * 10.
                },
                0.1,
            )
        };
        let (s, c) = e.rotation.to_radians().sin_cos();
        e.racer.velocity.x = s * e.speed;
        e.racer.velocity.y = -c * e.speed;
        move_axes(e, index, world);
        shadow(e, index, world, vector);
        if e.racer.shadow_pitch - old_pitch > 10.
            || e.position.z - (e.racer.shadow_z + e.scale * 0.5) > 1200.
        {
            e.air_ticks = 1;
            e.racer.jump_time = 0.05;
            e.racer.jump_start = e.position.z;
            e.racer.jump_speed = ((500. + (e.speed * 80. * old_pitch.to_radians().sin()).abs())
                * if last_surface.contains("ramp") || last_surface == "rock" {
                    6.
                } else {
                    3.
                })
            .min(3000.);
        } else {
            e.tilt = e.racer.shadow_pitch;
            e.racer.bank += e.racer.shadow_bank;
            e.position.z = e.racer.shadow_z + e.scale * 0.5;
        }
    }
    e.racer.track.update(track, e.position, true, &e.surface);
    if e.racer
        .track
        .finish(track.len(), &e.surface, &e.racer.collision)
        && e.racer.track.lap > laps
    {
        e.racer.finished = true;
    }
    e.path_index = e.racer.track.point;
    e.lap = e.racer.track.lap;
    if e.air_ticks == 0 {
        e.racer.direction = target(e);
        e.racer.velocity = e.racer.direction * e.speed;
    }
}
