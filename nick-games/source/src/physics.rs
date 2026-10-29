//! Bicycle force equations from the recovered gHeroDrive scripts.
//! Contact resolution and ground probes are native reconstructions.
use crate::{assets::Assets, collision::CollisionWorld};
use macroquad::prelude::*;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Bus,
    Hover,
}
#[derive(Clone, Copy, Default)]
pub struct Input {
    pub steer: f32,
    pub throttle: f32,
    pub brake: f32,
    pub slide: bool,
}
#[derive(Clone, Debug)]
pub struct Params {
    pub mass: f32,
    pub inertia: f32,
    pub throttle: f32,
    pub drag: f32,
    pub resistance: f32,
    pub front: f32,
    pub rear: f32,
    pub wheelbase: f32,
    pub weight_ratio: f32,
    pub scale: f32,
    pub gravity: f32,
    pub dt: f32,
    pub static_resistance: f32,
}
impl Params {
    pub fn bus(a: &Assets) -> Self {
        let get = |k: &str, default: f32| {
            a.texts
                .get(k)
                .and_then(|s| s.parse().ok())
                .unwrap_or(default)
        };
        Self {
            mass: get("mass10.", 6000.),
            inertia: get("inertia10.", 6000.),
            throttle: get("maxthrottle10.", 4000.),
            drag: get("cdrag1.0", 50.) / 3.,
            resistance: get("crr1.0", 400.) / 3.,
            front: get("stiffnessfront0.1", -10.),
            rear: get("stiffnessrear0.1", -10.3),
            wheelbase: get("wheelbase0.1", 3.),
            weight_ratio: get("weightratio0.1", 0.5),
            scale: get("scale1.0", 20.),
            gravity: get("gravity0.1", 45.),
            dt: get("deltat.01", 0.05),
            static_resistance: get("csresist0.1", 0.2),
        }
    }
    pub fn hover() -> Self {
        Self {
            mass: 6000.,
            inertia: 2000.,
            throttle: 5000.,
            drag: 2.,
            resistance: 30.,
            front: -20.,
            rear: -20.3,
            wheelbase: 4.,
            weight_ratio: 0.5,
            scale: 80.,
            gravity: 45.,
            dt: 0.05,
            static_resistance: 0.2,
        }
    }
}
#[derive(Clone, Debug)]
pub struct Vehicle {
    pub hover_bounce: crate::hover_drive::Bounce,
    pub hover_boost: bool,
    pub hover_collision_ticks: i32,
    pub hover_actor: crate::hover_actor::Actor,
    pub hover_track: crate::hover_race::TrackPosition,
    pub hover_transfers: Vec<(usize, Vec2)>,
    pub hover_contact: String,
    pub kind: Kind,
    pub pos: Vec3,
    pub previous: Vec3,
    pub velocity: Vec2,
    pub yaw: f32,
    pub previous_yaw: f32,
    pub pitch: f32,
    pub roll: f32,
    pub angular_velocity: f32,
    pub speed: f32,
    pub reverse: bool,
    pub jumping: bool,
    pub vertical_speed: f32,
    pub turbo: i32,
    pub invincible: i32,
    pub damage: f32,
    pub surface: String,
    pub grounded: bool,
    pub acceleration: Vec2,
    pub stop_ticks: i32,
    pub params: Params,
    pub difficulty: u8,
    pub height: f32,
    pub crash: bool,
    pub crash_object: Option<usize>,
    pub crash_velocity: Vec2,
    pub crash_speed: f32,
    pub jump_time: f32,
    pub jump_start: f32,
    pub jump_initial_speed: f32,
    pub ground_pitch: f32,
    pub ground_object: Option<usize>,
    pub ground_contact_speed: f32,
    pub ending: bool,
    pub last_brake: f32,
    pub side_slip: f32,
    pub travel_yaw: f32,
}
fn sign(x: f32) -> f32 {
    if x >= 0. { 1. } else { -1. }
}
impl Vehicle {
    pub fn new(kind: Kind, pos: Vec3, params: Params, difficulty: u8) -> Self {
        let yaw = if kind == Kind::Bus { -30. } else { 0. };
        Self {
            hover_bounce: Default::default(),
            hover_boost: false,
            hover_collision_ticks: 0,
            hover_actor: Default::default(),
            hover_track: Default::default(),
            hover_transfers: Vec::new(),
            hover_contact: String::new(),
            kind,
            pos,
            previous: pos,
            velocity: Vec2::ZERO,
            yaw,
            previous_yaw: yaw,
            pitch: 0.,
            roll: 0.,
            angular_velocity: 0.,
            speed: 0.,
            reverse: false,
            jumping: false,
            vertical_speed: 0.,
            turbo: 0,
            invincible: 0,
            damage: 0.,
            surface: String::new(),
            grounded: false,
            acceleration: Vec2::ZERO,
            stop_ticks: 0,
            params,
            difficulty,
            height: if kind == Kind::Bus { 100. } else { 150. },
            crash: false,
            crash_object: None,
            crash_velocity: Vec2::ZERO,
            crash_speed: 0.,
            jump_time: 0.,
            jump_start: pos.z,
            jump_initial_speed: 0.,
            ground_pitch: 0.,
            ground_object: None,
            ground_contact_speed: 0.,
            ending: false,
            last_brake: 0.,
            side_slip: 0.,
            travel_yaw: yaw,
        }
    }
    pub fn forward(&self) -> Vec3 {
        let a = self.yaw.to_radians();
        vec3(a.sin(), -a.cos(), 0.)
    }
    pub fn tick(&mut self, input: Input, world: &CollisionWorld) {
        if self.kind == Kind::Bus {
            crate::bus_drive::tick(self, input, world);
            return;
        }
        let old_pitch = self.pitch;
        let old_roll = self.roll;
        self.hover_collision_ticks -= 1;
        self.hover_transfers.clear();
        self.hover_contact.clear();
        if self.jumping {
            self.jump_time += self.params.dt;
        }
        self.previous = self.pos;
        self.previous_yaw = self.yaw;
        self.crash = false;
        self.crash_object = None;
        self.turbo = (self.turbo - 1).max(0);
        self.stop_ticks -= 1;
        let p = &self.params;
        let dt = p.dt;
        let hover = self.kind == Kind::Hover;
        let mut max_throttle = p.throttle * if self.turbo > 0 { 2. } else { 1. };
        let mut throttle = 0.;
        let mut brake = 0.;
        let mut slip = input.slide;
        if hover && self.turbo > 0 {
            throttle = max_throttle
        }
        if hover && input.slide {
            max_throttle = p.throttle * 1.5;
            throttle = max_throttle;
            slip = true
        }
        if self.speed == 0. {
            self.reverse = false;
        }
        let y = if input.throttle > 0. {
            -input.throttle
        } else {
            input.brake
        };
        if y < 0. || throttle != 0. {
            if self.reverse {
                brake = max_throttle * y.abs().round();
            } else {
                throttle = if max_throttle > p.throttle {
                    max_throttle
                } else {
                    max_throttle * y.abs().round()
                };
            }
        }
        if y > 0. {
            if self.speed == 0. {
                self.reverse = true;
            }
            if self.reverse {
                throttle = max_throttle * y.abs().round();
            } else {
                brake = max_throttle * y.abs().round();
            }
        }
        if self.ending && self.speed > 10. {
            self.speed -= 100.;
            throttle = 0.;
        }
        let speed = self.speed;
        let steer_degrees = if speed <= 10. {
            if hover { 10. } else { 0. }
        } else {
            (260. / speed).clamp(2., if hover { 20. } else { 10. })
        };
        let steer = if self.ending && speed > 10. {
            0.5
        } else {
            -input.steer * steer_degrees.to_radians() * if self.reverse { -1. } else { 1. }
        };
        if speed < 10. {
            self.angular_velocity = 0.;
            if self.acceleration.x <= 0.5 || self.ending {
                self.velocity = Vec2::ZERO;
                self.speed = 0.
            }
        }
        if self.ending && self.speed < 30. {
            self.speed = 0.;
            self.velocity = Vec2::ZERO;
        }
        self.hover_boost = input.slide || self.turbo > 0;
        if !self.jumping && !(self.speed == 0. && throttle == 0.) {
            let a = (self.yaw - 90.).to_radians();
            let (sn, cs) = a.sin_cos();
            let mut v = vec2(
                cs * self.velocity.x + sn * self.velocity.y,
                -sn * self.velocity.x + cs * self.velocity.y,
            );
            let rot = if v.x != 0. {
                (p.wheelbase * 0.5 * self.angular_velocity / v.x).atan()
            } else {
                0.
            };
            let side = if v.x != 0. { (v.y / v.x).atan() } else { 0. };
            self.side_slip = side;
            let weight = p.mass * 9.8 * 0.5;
            let factor = if slip { 0.1 } else { 1. };
            let front = p.front * (side + rot - steer) * weight * factor;
            let rear = p.rear * (side - rot) * weight * factor;
            let force_x = 100. * (throttle - brake * sign(v.x))
                - p.resistance * v.x
                - p.drag * v.x * v.x.abs()
                - if throttle != 0. {
                    p.static_resistance * p.mass * v.x.abs()
                } else {
                    0.
                };
            let front_sign = if sign(front) == sign(v.y) { -1. } else { 1. };
            let rear_sign = if sign(rear) == sign(v.y) { -1. } else { 1. };
            let force_y = front_sign * front + rear_sign * rear
                - p.resistance * v.y
                - p.drag * v.y * v.y.abs();
            self.acceleration = vec2(force_x, force_y) / p.mass;
            v += dt * self.acceleration;
            self.velocity = vec2(cs * v.x - sn * v.y, sn * v.x + cs * v.y);
            self.speed = v.length();
            let torque = p.wheelbase * 0.5 * (front - rear);
            let limit = (self.speed / 20.).round()
                * if hover {
                    3.
                } else {
                    (4 - self.difficulty) as f32
                };
            self.angular_velocity += dt * (torque / p.inertia).clamp(-limit, limit);
        }
        let was_air = self.jumping;
        crate::hover_drive::move_and_collide(self, world, input, old_pitch, old_roll);
        if !self.ending && self.speed < 10. {
            self.yaw = (self.yaw + steer.to_degrees()).rem_euclid(360.);
        }
        if was_air && !self.jumping || self.crash && !self.jumping {
            self.hover_bounce.start(self.jump_initial_speed);
        }
        self.hover_bounce.tick(!self.jumping);

        self.hover_actor
            .tick(input.steer, self.reverse, self.jumping);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn flat_world() -> CollisionWorld {
        let m = crate::model::Model {
            vertices: vec![
                vec3(-1e7, -1e7, 0.),
                vec3(1e7, -1e7, 0.),
                vec3(1e7, 1e7, 0.),
                vec3(-1e7, 1e7, 0.),
            ],
            faces: vec![crate::model::Face {
                indices: vec![0, 1, 2, 3],
                uv: vec![Vec2::ZERO; 4],
                texture: "road".into(),
                group: 0,
            }],
            min: Vec3::splat(-1e7),
            max: Vec3::splat(1e7),
            animation: Default::default(),
        };
        let mut w = CollisionWorld::new(1e7);
        w.add(&m, Mat4::IDENTITY, usize::MAX);
        w
    }
    #[test]
    fn bus_acceleration_matches_original_recorded_demo() {
        let pack = crate::assets::Pack::open();
        let manifest: crate::assets::Manifest =
            serde_json::from_slice(pack.get("runaway-bus/manifest.json").unwrap()).unwrap();
        let recording = crate::lingo_data::parse(&manifest.texts["pathdata"]).unwrap();
        let assets = crate::assets::Assets {
            models: Default::default(),
            textures: Default::default(),
            sounds: Default::default(),
            sound_loops: Default::default(),
            texts: manifest.texts,
        };
        let mut bus = Vehicle::new(Kind::Bus, vec3(0., 0., 100.), Params::bus(&assets), 1);
        let floor = flat_world();
        for row in recording.as_array().unwrap().iter().take(4) {
            bus.tick(
                Input {
                    throttle: 1.,
                    ..Default::default()
                },
                &floor,
            );
            let speed = row[8].as_f64().unwrap() as f32;
            assert!(
                (bus.speed - speed).abs() < 0.00015,
                "native {} vs original {speed}",
                bus.speed
            );
            assert_eq!(bus.pos.x.round(), row[0].as_f64().unwrap() as f32);
            assert_eq!(bus.pos.y.round(), row[1].as_f64().unwrap() as f32);
        }
    }
    fn bus_for_test() -> Vehicle {
        let pack = crate::assets::Pack::open();
        let manifest: crate::assets::Manifest =
            serde_json::from_slice(pack.get("runaway-bus/manifest.json").unwrap()).unwrap();
        let a = Assets {
            models: Default::default(),
            textures: Default::default(),
            sounds: Default::default(),
            sound_loops: Default::default(),
            texts: manifest.texts,
        };
        let mut v = Vehicle::new(Kind::Bus, vec3(0., 0., 100.), Params::bus(&a), 1);
        v.yaw = 0.;
        v.previous_yaw = 0.;
        v.travel_yaw = 0.;
        v
    }
    #[test]
    fn bus_steering_matches_camera_right_not_world_positive_x() {
        let floor = flat_world();
        let mut straight = bus_for_test();
        for _ in 0..40 {
            straight.tick(
                Input {
                    throttle: 1.,
                    ..Default::default()
                },
                &floor,
            );
        }
        let mut right = straight.clone();
        let mut left = straight;
        right.tick(
            Input {
                throttle: 1.,
                steer: 1.,
                ..Default::default()
            },
            &floor,
        );
        left.tick(
            Input {
                throttle: 1.,
                steer: -1.,
                ..Default::default()
            },
            &floor,
        );
        let screen_right = vec3(0., -1., 0.).cross(Vec3::Z);
        assert!(
            right.forward().dot(screen_right) > 0.,
            "Right must turn toward screen right"
        );
        assert!(
            left.forward().dot(screen_right) < 0.,
            "Left must turn toward screen left"
        );
    }
    #[test]
    fn bus_braking_enters_reverse_after_stopping() {
        let floor = flat_world();
        let mut v = bus_for_test();
        for _ in 0..60 {
            v.tick(
                Input {
                    throttle: 1.,
                    ..Default::default()
                },
                &floor,
            );
        }
        for _ in 0..100 {
            v.tick(
                Input {
                    brake: 1.,
                    ..Default::default()
                },
                &floor,
            );
            if v.reverse {
                break;
            }
        }
        assert!(v.reverse);
        assert_eq!(v.speed, 0.);
        assert!(v.stop_ticks > 0);
        for _ in 0..16 {
            v.tick(
                Input {
                    brake: 1.,
                    ..Default::default()
                },
                &floor,
            );
        }
        assert!(v.speed > 0.);
        assert!(v.pos.y > v.previous.y);
    }
    #[test]
    fn bus_powerslide_reduces_tyre_forces_to_one_tenth() {
        let floor = flat_world();
        let mut normal = bus_for_test();
        normal.velocity = vec2(0., -80.);
        normal.speed = 80.;
        normal.acceleration = Vec2::X;
        let mut slide = normal.clone();
        normal.tick(
            Input {
                steer: 1.,
                ..Default::default()
            },
            &floor,
        );
        slide.tick(
            Input {
                steer: 1.,
                slide: true,
                ..Default::default()
            },
            &floor,
        );
        assert!((slide.acceleration.y / normal.acceleration.y - 0.1).abs() < 0.0001);
        assert!((slide.angular_velocity / normal.angular_velocity - 0.1).abs() < 0.0001);
    }
    #[test]
    fn bus_terrain_solid_and_breakable_impacts_use_original_speed_ratios() {
        let wall = crate::model::Model {
            vertices: vec![
                vec3(-1000., -300., 0.),
                vec3(1000., -300., 0.),
                vec3(1000., -300., 1000.),
                vec3(-1000., -300., 1000.),
            ],
            faces: vec![crate::model::Face {
                indices: vec![0, 1, 2, 3],
                uv: vec![Vec2::ZERO; 4],
                texture: "wall".into(),
                group: 0,
            }],
            min: vec3(-1000., -300., 0.),
            max: vec3(1000., -300., 1000.),
            animation: Default::default(),
        };
        let mut initial = bus_for_test();
        initial.velocity = vec2(0., -80.);
        initial.speed = 80.;
        let mut free = initial.clone();
        free.tick(Input::default(), &flat_world());
        for (object, breakable, ratio) in
            [(usize::MAX, false, 0.5), (7, false, 0.9), (7, true, 0.8)]
        {
            let mut world = flat_world();
            world.add(&wall, Mat4::IDENTITY, object);
            if breakable {
                world.mark_breakable(object);
            }
            let mut bus = initial.clone();
            bus.tick(Input::default(), &world);
            assert_eq!(bus.crash_object, Some(object));
            assert!((bus.speed / free.speed - ratio).abs() < 0.0001);
            assert_eq!(bus.velocity.y < 0., breakable);
            assert!(bus.angular_velocity.abs() < 0.0001);
        }
    }
    #[test]
    fn bus_airborne_motion_uses_original_parabola_and_ignores_reverse_input() {
        let mut bus = bus_for_test();
        bus.jumping = true;
        bus.jump_start = 5000.;
        bus.pos.z = 5000.;
        bus.previous = bus.pos;
        bus.jump_initial_speed = 200.;
        bus.jump_time = 0.05;
        let empty = CollisionWorld::new(1000.);
        for _ in 0..3 {
            bus.tick(
                Input {
                    brake: 1.,
                    ..Default::default()
                },
                &empty,
            );
        }
        // t=.20, original z = start + v*t - gravity*scale*t*t.
        assert!((bus.pos.z - 5004.).abs() < 0.001);
        assert!(!bus.reverse);
    }
    #[test]
    fn original_hover_force_equation_matches_first_tick() {
        let mut car = Vehicle::new(Kind::Hover, vec3(0., 0., 150.), Params::hover(), 1);
        car.stop_ticks = 0;
        car.tick(
            Input {
                throttle: 1.,
                ..Default::default()
            },
            &flat_world(),
        );
        // 100 * throttle / mass * dt = 4.1666667; world distance = speed * dt * 80.
        assert!((car.speed - 25. / 6.).abs() < 1e-4);
        assert!((car.pos.y + 50. / 3.).abs() < 1e-4);
        assert!(car.grounded);
    }
    #[test]
    fn right_input_turns_right_and_brakes_stop_forward_motion() {
        let world = flat_world();
        let mut car = Vehicle::new(Kind::Hover, vec3(0., 0., 150.), Params::hover(), 1);
        car.stop_ticks = 0;
        for _ in 0..90 {
            car.tick(
                Input {
                    throttle: 1.,
                    ..Default::default()
                },
                &world,
            );
        }
        let top = car.speed;
        assert!(top > 200.);
        for _ in 0..5 {
            car.tick(
                Input {
                    throttle: 1.,
                    steer: 1.,
                    ..Default::default()
                },
                &world,
            );
        }
        assert!(car.yaw > 270. && car.yaw < 360., "yaw {}", car.yaw);
        for _ in 0..50 {
            car.tick(
                Input {
                    brake: 1.,
                    ..Default::default()
                },
                &world,
            );
        }
        assert!(
            car.reverse || car.speed < top * 0.3,
            "braking speed {}",
            car.speed
        );
        assert!(car.pos.is_finite());
    }
    #[test]
    fn original_hover_parameters_accelerate_and_brake_without_nan() {
        let mut car = Vehicle::new(Kind::Hover, vec3(0., 0., 0.), Params::hover(), 1);
        let world = CollisionWorld::new(1000.);
        car.jumping = false;
        // A floor-free world deliberately exercises airborne recovery; assert finite state.
        for _ in 0..100 {
            car.tick(
                Input {
                    throttle: 1.,
                    ..Default::default()
                },
                &world,
            );
            assert!(car.pos.is_finite());
            assert!(car.velocity.is_finite());
        }
        assert_eq!(car.params.mass, 6000.);
        assert!(car.pos.z < 0.);
    }
}
