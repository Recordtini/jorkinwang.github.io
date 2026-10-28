//! gObstacles: attack/retreat, calcTarget, calcDozerPos and findNewDozerPos.
use crate::{bus_rules::manhattan, collision::CollisionWorld, physics::Vehicle, world::Entity};
use macroquad::prelude::*;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Pursuit {
    #[default]
    Attack,
    Retreat,
    Stopped,
}

// gHero's group-collision box: ScaleObject(box, 280, 600, 200).
fn hits_bus(from: Vec3, to: Vec3, bus: &Vehicle) -> bool {
    let m = Mat4::from_rotation_z(-bus.yaw.to_radians());
    let from = m.transform_vector3(from - bus.pos);
    let to = m.transform_vector3(to - bus.pos);
    let d = to - from;
    let half = vec3(140., 300., 100.);
    let mut enter: f32 = 0.;
    let mut leave: f32 = 1.;
    for i in 0..3 {
        if d[i].abs() < 1e-6 {
            if from[i].abs() > half[i] {
                return false;
            }
        } else {
            let a = (-half[i] - from[i]) / d[i];
            let b = (half[i] - from[i]) / d[i];
            enter = enter.max(a.min(b));
            leave = leave.min(a.max(b));
            if enter > leave {
                return false;
            }
        }
    }
    true
}

pub fn tick(
    e: &mut Entity,
    world: &CollisionWorld,
    spawns: &[Vec3],
    bus: &Vehicle,
    difficulty: u8,
) {
    e.previous = e.position;
    e.dozer_contact = false;
    if e.pursuit == Pursuit::Stopped {
        return;
    }
    let territory = [4000., 5000., 7000.][difficulty as usize - 1];
    let home_distance = manhattan(e.base, bus.pos);
    // The source changes state without moving on this frame. Equality also differs
    // between the attack (<) and retreat (>) branches.
    match e.pursuit {
        Pursuit::Attack if home_distance >= territory => {
            e.pursuit = Pursuit::Retreat;
            return;
        }
        Pursuit::Retreat if home_distance <= territory => {
            e.pursuit = Pursuit::Attack;
            return;
        }
        _ => {}
    }
    let height = e.scale * 0.8;
    let target = if e.pursuit == Pursuit::Attack {
        bus.pos
    } else {
        e.base
    } + Vec3::Z * height;
    let direction = (target - e.position).normalize_or_zero();
    if direction.truncate().length_squared() > 0. {
        e.rotation = direction.x.atan2(-direction.y).to_degrees();
    }
    let mut next = e.position + direction.with_z(0.) * e.speed;
    let sign = |x: f32| if x == 0. { 0. } else { x.signum() };
    let x_end = vec3(
        next.x + 300. * sign(next.x - e.position.x),
        e.position.y,
        e.position.z,
    );
    let bus_x = hits_bus(e.position, x_end, bus);
    if bus_x || world.segment_static(e.position, x_end).is_some() {
        next.x = e.position.x;
    }
    let y_start = vec3(next.x, e.position.y, e.position.z);
    let y_end = vec3(
        next.x,
        next.y + 300. * sign(next.y - e.position.y),
        e.position.z,
    );
    let bus_y = hits_bus(y_start, y_end, bus);
    if bus_y || world.segment_static(y_start, y_end).is_some() {
        next.y = e.position.y;
    }
    if let Some(hit) = world.segment_static(next, next - Vec3::Z * 1000.) {
        next.z = hit.pos.z + height;
    }
    e.position = next;
    e.dozer_contact = bus_x || bus_y;
    let distance = manhattan(e.position, bus.pos);
    if e.pursuit == Pursuit::Attack {
        e.dozer_contact |= distance < 600.;
    } else if distance > 5000. {
        // Source uses horizontal Manhattan distance for relocation, not Euclidean.
        let best = spawns
            .iter()
            .filter(|p| manhattan(p.with_z(bus.pos.z), bus.pos) > 4500.)
            .min_by(|a, b| {
                manhattan(a.with_z(bus.pos.z), bus.pos)
                    .total_cmp(&manhattan(b.with_z(bus.pos.z), bus.pos))
            });
        if let Some(p) = best {
            let home = *p + Vec3::Z * height;
            if home != e.base {
                e.base = home;
                e.position = home;
                e.previous = home;
                e.pursuit = Pursuit::Attack;
            }
        }
    }
}
