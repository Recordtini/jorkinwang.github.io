//! NickFOP terrain, flight and five-probe contacts from gHeroDrive.
use crate::{
    collision::{CollisionWorld, Hit},
    physics::{Input, Vehicle},
};
use macroquad::prelude::*;
fn rotate(p: Vec3, yaw: f32, pitch: f32, roll: f32) -> Vec3 {
    let r = |v: f32| v.rem_euclid(360.).round().to_radians();
    (Mat4::from_rotation_z(r(yaw))
        * Mat4::from_rotation_x(r(pitch))
        * Mat4::from_rotation_y(r(roll)))
    .transform_vector3(p)
}
fn angles(v: &mut Vehicle, hit: &Hit) {
    v.surface = hit.texture.clone();
    v.ground_object = Some(hit.object);
    v.ground_contact_speed = v.speed;
    let f = v.forward();
    let n = hit.normal;
    if n.z.abs() < 1e-6 {
        return;
    }
    v.ground_pitch = -(-(n.x * f.x + n.y * f.y) / n.z).atan().to_degrees();
    let bank = (-(n.x * f.y - n.y * f.x) / n.z).atan().to_degrees();
    if v.jumping {
        v.pitch = v.ground_pitch;
        v.roll = bank;
    } else {
        let target = bank
            - if v.speed < 30. {
                0.
            } else {
                v.side_slip.to_degrees() * 2.
            };
        v.roll += (target - v.roll).clamp(-2., 2.);
        v.pitch += (v.ground_pitch - v.pitch).clamp(-2., 2.);
        let target = v.ground_pitch + v.acceleration.x / 5. * if v.reverse { 1. } else { -1. };
        v.pitch += (target - v.pitch).clamp(-0.5, 0.5);
    }
}
fn launch(v: &mut Vehicle, next: &mut Vec3, world: &CollisionWorld, old_pitch: f32) {
    // NickFOP multiplies pRadius by four, independently of the hover height.
    if world
        .segment(v.previous, v.previous + Vec3::Z * (16. * v.height + 60.))
        .is_some()
    {
        return;
    }
    if v.speed > 0. && v.speed < 20. {
        v.velocity *= 20. / v.speed;
        v.speed = 20.;
    }
    let ramp = if v.surface.contains("ramp") || v.surface == "rock" {
        2.
    } else {
        1.
    };
    v.jump_initial_speed =
        ((500. + (v.speed * v.params.scale * old_pitch.to_radians().sin()).abs()) * ramp * 3.)
            .min(3000.);
    v.jump_time = v.params.dt;
    v.jump_start = next.z;
    v.previous.z = next.z;
    v.vertical_speed = v.jump_initial_speed;
    v.jumping = true;
    v.grounded = false;
    v.surface = "none".into();
    v.ground_object = None;
}
fn ideal(
    v: &mut Vehicle,
    world: &CollisionWorld,
    input: Input,
    old_pitch: f32,
    old_roll: f32,
) -> Vec3 {
    if v.speed > 10. {
        v.yaw = v.previous_yaw + v.angular_velocity * v.params.dt.to_degrees();
    }
    let mut next = v.previous
        + (v.velocity * v.params.dt * v.params.scale * if v.reverse { -1. } else { 1. }).extend(0.);
    let radius = v.height * 4.;
    if v.jumping {
        next.z = v.jump_start + v.jump_initial_speed * v.jump_time
            - v.params.gravity * v.params.scale * v.jump_time * v.jump_time / 2.;
        v.vertical_speed = v.jump_initial_speed - v.params.gravity * v.params.scale * v.jump_time;
        if v.hover_collision_ticks < 0 {
            if input.steer.abs() >= 0.3 {
                v.yaw -= input.steer;
                v.angular_velocity = 0.;
            }
            v.pitch = old_pitch + 0.5;
            v.roll = old_roll + 0.5;
        }
        // The first five frames cannot re-land on the launch ramp.
        if v.jump_time > v.params.dt * 5.
            && let Some(hit) = world.segment(
                vec3(next.x, next.y, v.previous.z + radius),
                vec3(next.x, next.y, next.z - radius),
            )
            && !matches!(hit.texture.as_str(), "empty" | "rope")
        {
            next.z = hit.pos.z + v.height;
            angles(v, &hit);
            v.jumping = false;
            v.grounded = true;
            v.vertical_speed = 0.;
        }
    } else if let Some(hit) = world.segment(
        vec3(next.x, next.y, v.previous.z + radius),
        vec3(next.x, next.y, v.previous.z - 600.),
    ) && !matches!(hit.texture.as_str(), "empty" | "rope")
    {
        next.z = hit.pos.z + v.height;
        angles(v, &hit);
        v.grounded = true;
        next.z += v.roll.abs().to_radians().sin() * 100. + v.pitch.abs().to_radians().sin() * 50.;
    } else {
        launch(v, &mut next, world, old_pitch);
    }
    next
}
pub fn move_and_collide(
    v: &mut Vehicle,
    world: &CollisionWorld,
    input: Input,
    old_pitch: f32,
    old_roll: f32,
) {
    let mut next = ideal(v, world, input, old_pitch, old_roll);
    if !v.jumping && (v.ground_pitch - old_pitch > 10. || v.previous.z - next.z > v.height * 4.) {
        next.z = v.previous.z;
        launch(v, &mut next, world, old_pitch);
    }
    // Original contact response retries once after recalculating the ideal pose.
    for attempt in 0..2 {
        let direction = -v.velocity.extend(0.).normalize_or_zero();
        let center = next + direction * 50. * if v.reverse { 1. } else { -1. };
        let mut contact = None;
        for corner in [
            vec3(0., -100., 50.),
            vec3(-100., -100., 50.),
            vec3(100., -100., 50.),
            vec3(100., 100., 50.),
            vec3(-100., 100., 50.),
        ] {
            let radial = rotate(corner, v.previous_yaw, old_pitch, old_roll);
            if let Some(hit) = world.segment(
                v.previous + radial,
                center + rotate(corner, v.yaw, v.pitch, v.roll),
            ) {
                v.hover_contact = hit.texture.clone();
                if !matches!(hit.texture.as_str(), "finish" | "ramp" | "rope") {
                    contact = Some((hit, radial));
                    break;
                }
            }
        }
        let Some((hit, radial)) = contact else {
            break;
        };
        v.crash |= v.speed > 10. && hit.texture != "goal";
        v.crash_object = Some(hit.object);
        v.crash_velocity = v.velocity;
        v.crash_speed = v.speed;
        if hit.object == usize::MAX {
            v.hover_collision_ticks = 20;
        }
        let n = hit.normal.truncate();
        let lever = vec2(-radial.y, radial.x) / radial.length().max(1e-6) / v.params.scale;
        let arm = lever.dot(n);
        let denominator = n.length_squared() / v.params.mass + arm * arm / v.params.inertia;
        if denominator <= 0. {
            break;
        }
        let restitution = if hit.object == usize::MAX { 0.9 } else { 0. };
        let other = world.velocity(hit.object);
        let impulse = -(1. + restitution) * (v.velocity - other.unwrap_or(Vec2::ZERO) / 4.).dot(n)
            / denominator;
        let bounced = v.velocity + impulse / v.params.mass * n;
        if bounced.length() < 20. || attempt > 0 {
            if other.is_some() {
                break;
            }
            v.velocity = Vec2::ZERO;
            v.angular_velocity = 0.;
            next.x = v.previous.x;
            next.y = v.previous.y;
            v.yaw = v.previous_yaw;
            break;
        }
        if other.is_some() {
            v.hover_transfers
                .push((hit.object, impulse / v.params.mass * n));
        }
        v.velocity = bounced * 0.8;
        if v.velocity.length() > v.speed {
            v.velocity = v.velocity.normalize_or_zero() * v.speed;
        }
        v.angular_velocity = arm * impulse / v.params.inertia * if v.reverse { -1. } else { 1. };
        next = ideal(v, world, input, old_pitch, old_roll);
    }
    v.pos = next;
    v.speed = v.velocity.length();
    if v.jumping && v.hover_collision_ticks < 0 {
        let y = if input.throttle > 0. {
            -input.throttle
        } else {
            input.brake
        };
        if y != 0. {
            v.speed -= y * (25. / v.speed).min(3.);
            v.acceleration.x = 1.;
        }
    }
    v.pitch = v.pitch.clamp(-20., 20.);
    v.roll = v.roll.clamp(-20., 20.);
    v.yaw = v.yaw.rem_euclid(360.);
}

/// gHeroDrive's damped hover landing/crash oscillation, at the original tick rate.
#[derive(Clone, Debug)]
pub struct Bounce {
    pub offset: f32,
    pub count: u32,
    pub multiplier: f32,
}
impl Default for Bounce {
    fn default() -> Self {
        Self {
            offset: 0.,
            count: 200,
            multiplier: 0.5,
        }
    }
}
impl Bounce {
    pub fn start(&mut self, speed: f32) {
        self.multiplier = (speed / 500.).clamp(0.5, 2.);
        self.count = 0;
        self.calculate();
    }
    fn calculate(&mut self) {
        self.count += 1;
        self.offset = -self.multiplier
            * (200. / self.count as f32)
            * (((self.count - 1) * 15) as f32).to_radians().sin();
    }
    pub fn tick(&mut self, ground: bool) {
        self.count += 1;
        if self.count < 200 {
            if ground {
                self.calculate();
            }
        } else {
            self.offset = 0.;
        }
    }
}
pub fn collectable(hero: Vec3, object: Vec3) -> bool {
    let d = hero - object;
    d.x.abs() + d.y.abs() < 1200. && d.z.abs() < 1200.
}
