//! Runaway Bus gHeroDrive: source-order input, force, terrain and contact updates.
//! Groove's ray-query implementation is replaced by CollisionWorld's triangles.
use crate::{
    collision::{CollisionWorld, Hit},
    physics::{Input, Vehicle},
};
use macroquad::prelude::*;
fn sign(x: f32) -> f32 {
    if x >= 0. { 1. } else { -1. }
}
fn approach(a: f32, b: f32, step: f32) -> f32 {
    a + (b - a).clamp(-step, step)
}
fn rotate(p: Vec3, yaw: f32, pitch: f32, roll: f32) -> Vec3 {
    // rotateVerts uses integer-degree lookup tables, in Z/X/Y order.
    let radians = |a: f32| a.rem_euclid(360.).round().to_radians();
    (Mat4::from_rotation_z(radians(yaw))
        * Mat4::from_rotation_x(radians(pitch))
        * Mat4::from_rotation_y(radians(roll)))
    .transform_vector3(p)
}
fn forward(v: &Vehicle) -> Vec3 {
    let a = v.yaw.to_radians();
    vec3(a.sin(), -a.cos(), 0.)
}
fn angles(v: &mut Vehicle, hit: &Hit) {
    v.surface = hit.texture.clone();
    let f = forward(v);
    let n = hit.normal;
    if n.z.abs() > 1e-6 {
        v.ground_pitch = -(-(n.x * f.x + n.y * f.y) / n.z).atan().to_degrees();
        let bank = (-(n.x * f.y - n.y * f.x) / n.z).atan().to_degrees();
        let target = bank
            + if v.speed >= 30. {
                v.side_slip.to_degrees() / 2.
            } else {
                0.
            };
        v.roll = approach(v.roll, target, 2.);
    }
    if v.jumping {
        v.pitch = v.ground_pitch;
    } else {
        v.pitch = approach(v.pitch, v.ground_pitch, 2.);
        let target = v.ground_pitch + v.acceleration.x / 5. * if v.reverse { 1. } else { -1. };
        v.pitch = approach(v.pitch, target, 0.5);
    }
}
fn launch(v: &mut Vehicle, next: &mut Vec3, world: &CollisionWorld, old_pitch: f32) {
    if world
        .segment(v.previous, v.previous + Vec3::Z * (4. * v.height + 60.))
        .is_some()
    {
        return;
    }
    if v.speed > 0. && v.speed < 20. {
        v.velocity *= 20. / v.speed;
        v.speed = 20.;
    }
    v.jump_time = v.params.dt;
    v.jump_initial_speed = (v.speed * v.params.scale * old_pitch.to_radians().sin()).abs();
    next.z = v.previous.z + v.jump_initial_speed * v.params.dt + v.height;
    v.jump_start = next.z;
    v.jumping = true;
    v.grounded = false;
    v.surface = "none".into();
    v.vertical_speed = v.jump_initial_speed;
}
fn ideal(v: &mut Vehicle, world: &CollisionWorld, old_pitch: f32, old_roll: f32) -> Vec3 {
    if v.speed > 10. {
        v.yaw = v.previous_yaw + v.angular_velocity * v.params.dt.to_degrees();
    }
    let mut next = v.previous
        + (v.velocity * v.params.dt * v.params.scale * if v.reverse { -1. } else { 1. }).extend(0.);
    if v.jumping {
        next.z = v.jump_start + v.jump_initial_speed * v.jump_time
            - v.params.gravity * v.params.scale * v.jump_time * v.jump_time;
        v.vertical_speed =
            v.jump_initial_speed - 2. * v.params.gravity * v.params.scale * v.jump_time;
        v.pitch = old_pitch + 0.5;
        v.roll = old_roll + 0.5;
        if let Some(hit) = world.segment(
            vec3(next.x, next.y, v.previous.z + v.height),
            vec3(next.x, next.y, next.z - v.height),
        ) {
            next.z = hit.pos.z + v.height;
            angles(v, &hit);
            v.jumping = false;
            v.grounded = true;
            v.vertical_speed = 0.;
        }
    } else if let Some(hit) = world.segment(
        vec3(next.x, next.y, v.previous.z + v.height),
        vec3(next.x, next.y, v.previous.z - 600.),
    ) {
        next.z = hit.pos.z + v.height;
        v.grounded = true;
        angles(v, &hit);
        next.z += v.roll.abs().to_radians().sin() * 80. + v.pitch.abs().to_radians().sin() * 150.;
    } else {
        launch(v, &mut next, world, old_pitch);
    }
    next
}
pub fn tick(v: &mut Vehicle, input: Input, world: &CollisionWorld) {
    let old_pitch = v.pitch;
    let old_roll = v.roll;
    v.previous = v.pos;
    v.previous_yaw = v.yaw;
    v.crash = false;
    v.crash_object = None;
    v.turbo = (v.turbo - 1).max(0);
    v.stop_ticks -= 1;
    let max = v.params.throttle * if v.turbo > 0 { 2. } else { 1. };
    let mut throttle = 0.;
    let mut brake = 0.;
    let degrees = if v.speed <= 10. {
        0.
    } else {
        (260. / v.speed).clamp(2., 10.)
    };
    let mut steer = if input.steer.abs() > 0.3 {
        -input.steer * degrees.to_radians() * if v.reverse { -1. } else { 1. }
    } else {
        0.
    };
    if v.stop_ticks <= 0 {
        if !v.jumping && input.throttle > 0.3 {
            if v.reverse {
                brake = max * input.throttle;
            } else {
                throttle = max * input.throttle;
            }
            if v.speed < 10. && v.reverse {
                if v.speed != 0. {
                    v.stop_ticks = 15;
                }
                v.velocity = Vec2::ZERO;
                v.speed = 0.;
                v.reverse = false;
                throttle = 0.;
                brake = 0.;
            }
        }
        if !v.jumping && input.brake > 0.3 {
            if v.reverse {
                throttle = max * input.brake;
            } else {
                brake = max * input.brake;
            }
            if v.speed < 10. && !v.reverse {
                if v.speed != 0. {
                    v.stop_ticks = 15;
                }
                v.velocity = Vec2::ZERO;
                v.speed = 0.;
                v.reverse = true;
                throttle = 0.;
                brake = 0.;
            }
        }
    }
    if v.speed < 10. {
        v.angular_velocity = 0.;
        if v.acceleration.x <= 0.5 {
            steer = 0.;
            v.velocity = Vec2::ZERO;
            v.speed = 0.;
        }
    }
    if v.jumping {
        v.jump_time += v.params.dt;
    } else {
        let p = &v.params;
        let (sn, cs) = (v.yaw - 90.).to_radians().sin_cos();
        let mut local = vec2(
            cs * v.velocity.x + sn * v.velocity.y,
            -sn * v.velocity.x + cs * v.velocity.y,
        );
        let rotation = if local.x == 0. {
            steer = 0.;
            0.
        } else {
            (p.wheelbase * 0.5 * v.angular_velocity / local.x).atan()
        };
        v.side_slip = if local.x == 0. {
            0.
        } else {
            (local.y / local.x).atan()
        };
        let grip = if input.slide { 0.1 } else { 1. };
        let weight = p.mass * 9.8 * 0.5;
        let front = p.front * (v.side_slip + rotation - steer) * weight * grip;
        let rear = p.rear * (v.side_slip - rotation) * weight * grip;
        let resistance = -p.resistance * local - p.drag * local * local.abs();
        let static_resistance = if throttle != 0. {
            -p.static_resistance * p.mass * local.x.abs()
        } else {
            0.
        };
        let force_x = 100. * (throttle - brake * sign(local.x)) + resistance.x + static_resistance;
        let force_y = front
            * if sign(front) == sign(local.y) {
                -1.
            } else {
                1.
            }
            + rear * if sign(rear) == sign(local.y) { -1. } else { 1. }
            + resistance.y;
        v.acceleration = vec2(force_x, force_y) / p.mass;
        local += p.dt * v.acceleration;
        v.velocity = vec2(cs * local.x - sn * local.y, sn * local.x + cs * local.y);
        v.speed = local.length();
        let torque = p.wheelbase * 0.5 * (front - rear);
        let limit = (v.speed / 20.).round().abs() * (4 - v.difficulty) as f32;
        v.angular_velocity += p.dt * (torque / p.inertia).clamp(-limit, limit);
    }
    let mut next = ideal(v, world, old_pitch, old_roll);
    if !v.jumping && (v.ground_pitch - old_pitch > 10. || v.previous.z - next.z > v.height) {
        launch(v, &mut next, world, old_pitch);
    }
    let nominal_direction = if v.velocity.length() < 10. {
        -forward(v)
    } else {
        -v.velocity.extend(0.).normalize_or_zero()
    };
    let collision_yaw = v.previous_yaw + v.angular_velocity * v.params.dt.to_degrees();
    let collision_center = next + nominal_direction * 100. * if v.reverse { 1. } else { -1. };
    for corner in [
        vec3(0., -150., 0.),
        vec3(-80., -150., 0.),
        vec3(80., -150., 0.),
        vec3(80., 150., 0.),
        vec3(-80., 150., 0.),
    ] {
        let radial = rotate(corner, v.previous_yaw, old_pitch, old_roll);
        let from = v.previous + radial;
        let to = collision_center + rotate(corner, collision_yaw, v.pitch, v.roll);
        let Some(hit) = world.segment(from, to) else {
            continue;
        };
        let normal = hit.normal.truncate();
        if normal.length_squared() < 1e-8 {
            continue;
        }
        v.crash = v.speed > 10.;
        v.crash_object = Some(hit.object);
        v.crash_velocity = v.velocity;
        v.crash_speed = v.speed;
        if world.is_breakable(hit.object) {
            v.velocity *= 0.8;
            next = ideal(v, world, old_pitch, old_roll);
        } else {
            let lever = vec2(-radial.y, radial.x) / radial.length().max(1e-6) / v.params.scale;
            let restitution = if hit.object == usize::MAX { 0.5 } else { 0.9 };
            let arm = lever.dot(normal);
            let denominator =
                normal.length_squared() / v.params.mass + arm * arm / v.params.inertia;
            if denominator > 0. {
                let impulse = -(1. + restitution) * v.velocity.dot(normal) / denominator;
                let velocity = v.velocity + impulse / v.params.mass * normal;
                if velocity.length() < 20. {
                    v.velocity = Vec2::ZERO;
                    v.angular_velocity = 0.;
                    next = v.previous;
                    v.yaw = v.previous_yaw;
                } else {
                    v.velocity = velocity;
                    v.angular_velocity =
                        arm * impulse / v.params.inertia * if v.reverse { -1. } else { 1. };
                    next = ideal(v, world, old_pitch, old_roll);
                }
            }
        }
        break;
    }
    v.turbo = (v.turbo - 1).max(0);
    v.pos = next;
    v.speed = v.velocity.length();
    v.yaw = v.yaw.rem_euclid(360.);
    if v.speed > 11. {
        v.travel_yaw = v.velocity.x.atan2(-v.velocity.y).to_degrees().round();
    }
}
