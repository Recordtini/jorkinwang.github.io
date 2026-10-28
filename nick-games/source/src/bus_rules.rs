//! Runaway Bus mode/difficulty rules from gGameControl, gObstacles and gHeroDrive.
use crate::physics::Vehicle;
use macroquad::prelude::*;

#[derive(Clone, Copy, Debug)]
pub struct Settings {
    pub mode: u8, // 0 Runaway, 1 Crazy, 2 Cruise
    pub difficulty: u8,
}
impl Settings {
    pub fn new(mode: u8, difficulty: u8) -> Result<Self, String> {
        if mode > 2 || !(1..=3).contains(&difficulty) {
            return Err("Invalid Runaway Bus mode or difficulty".into());
        }
        Ok(Self { mode, difficulty })
    }
    pub fn radius(self) -> f32 {
        [20000., 60000., 80000.][self.difficulty as usize - 1]
    }
    pub fn within(self, position: Vec3, start: Vec3) -> bool {
        position.distance(start) <= self.radius()
    }
    pub fn tomatoes(self) -> usize {
        if self.mode == 0 {
            5 + 5 * self.difficulty as usize
        } else {
            0
        }
    }
    pub fn clocks(self) -> usize {
        if self.mode == 0 {
            5 * self.difficulty as usize
        } else {
            0
        }
    }
    pub fn dozer(self) -> bool {
        self.mode == 0 || self.mode == 2 && self.difficulty >= 2
    }
    pub fn enabled(self, shape: &str, position: Vec3) -> bool {
        match shape {
            "bulldozer" => false, // The list entry is unused; "jelly" instantiates it.
            "roadblock1" => self.mode == 0 && self.difficulty == 1,
            "roadblock2" => self.mode == 0 && self.difficulty == 2,
            "ramp1" | "ramp2" | "ramp3" | "ramp4" => self.mode != 1 || position.z > 1000.,
            "point" | "turbo" => self.mode != 1,
            _ => true,
        }
    }
    pub fn start_clock(self) -> f32 {
        if self.mode == 0 {
            (2. + self.difficulty as f32) * 60.
        } else {
            0.
        }
    }
    pub fn caught(self, speed: f32, jumping: bool) -> bool {
        self.mode != 2 && speed < 30. && !jumping
    }
    pub fn target_scale(self) -> f32 {
        if self.mode == 1 {
            2.5 - self.difficulty as f32 * 0.5
        } else {
            1.
        }
    }
}
pub fn manhattan(a: Vec3, b: Vec3) -> f32 {
    // Despite six arguments, MovieScript 1.manhatDist ignores both Z values.
    (a.x - b.x).abs() + (a.y - b.y).abs()
}

#[derive(Clone, Debug)]
pub struct RoadFrame {
    pub position: Vec3, // Original recordPath saves ground-relative Z.
    pub angles: Vec3,
    pub road: bool,
}
#[derive(Default)]
pub struct Recovery {
    pub frames: Vec<RoadFrame>,
}
impl Recovery {
    pub fn record(&mut self, bus: &Vehicle) {
        self.frames.push(RoadFrame {
            position: vec3(
                bus.pos.x.round(),
                bus.pos.y.round(),
                (bus.pos.z - bus.height).round(),
            ),
            angles: vec3(bus.yaw.round(), bus.pitch.round(), bus.roll.round()),
            road: bus.surface.contains("road"),
        });
    }
    pub fn revive(&mut self, bus: &mut Vehicle) -> bool {
        let current = bus.pos.with_z(0.);
        let mut roads = 0;
        while let Some(frame) = self.frames.last() {
            if frame.road {
                roads += 1;
                // Lingo's i is one-based: i < 10 means at most nine records remain.
                if roads > 20
                    && (manhattan(current, frame.position.with_z(0.)) > 1000.
                        || self.frames.len() < 10)
                {
                    bus.pos = frame.position + Vec3::Z * 1000.;
                    bus.previous = bus.pos;
                    bus.yaw = frame.angles.x;
                    bus.previous_yaw = bus.yaw;
                    bus.pitch = frame.angles.y;
                    bus.roll = frame.angles.z;
                    bus.travel_yaw = bus.yaw;
                    bus.velocity = Vec2::ZERO;
                    bus.speed = 0.;
                    bus.angular_velocity = 0.;
                    bus.surface = "none".into();
                    bus.jumping = true;
                    bus.grounded = false;
                    bus.vertical_speed = 0.;
                    bus.jump_initial_speed = 0.;
                    bus.jump_time = 0.;
                    bus.jump_start = bus.pos.z;
                    return true;
                }
            }
            self.frames.pop();
        }
        false
    }
}
