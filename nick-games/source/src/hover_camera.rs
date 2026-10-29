//! camera parent: source chase, start/end pan, first person and trackside replay.
use crate::{
    hover_race::{angle_range, manhattan},
    physics::Vehicle,
};
use macroquad::prelude::*;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    User(u8),
    Start,
    Orbit,
    End,
    Replay,
}
#[derive(Clone, Debug)]
pub struct Camera {
    pub position: Vec3,
    pub previous: Vec3,
    pub target: Vec3,
    pub previous_target: Vec3,
    pub mode: Mode,
    pub yaw: f32,
    pub perspective: f32,
    pub look_pitch: f32,
    pub replay: Vec<Vec3>,
}
impl Camera {
    pub fn new(v: &Vehicle) -> Self {
        let a = (v.yaw - 30. + 170.).to_radians();
        let position = v.pos - vec3(a.sin(), -a.cos(), 0.) * 10000.
            + Vec3::Z * (10000. * 15f32.to_radians().sin());
        Self {
            position,
            previous: position,
            target: v.pos + Vec3::Z * 100.,
            previous_target: v.pos + Vec3::Z * 100.,
            mode: Mode::Start,
            yaw: v.yaw - 30. + 170.,
            perspective: 120.,
            look_pitch: ((v.pos.z + 100. - position.z) / 10000.).atan().to_degrees(),
            replay: Vec::new(),
        }
    }
    pub fn replay_points(&mut self, track: &[Vec3], seed: &mut u64) {
        self.replay = track
            .iter()
            .enumerate()
            .filter_map(|(i, p)| {
                let point = *p
                    + vec3(
                        500. - (crate::bus_actor::random(seed, 1000) + 1) as f32,
                        500. - (crate::bus_actor::random(seed, 1000) + 1) as f32,
                        500. + (crate::bus_actor::random(seed, 2000) + 1) as f32,
                    );
                if (i + 4) % 4 == 0 { Some(point) } else { None }
            })
            .collect();
    }
    pub fn tick(&mut self, v: &Vehicle, mode: Mode) {
        self.previous = self.position;
        self.previous_target = self.target;
        self.mode = mode;
        self.perspective = if mode == Mode::Replay { 60. } else { 120. };
        let (dist, elevation, offset, pan) = match mode {
            Mode::User(1) => (2000., 25f32, 0., false),
            Mode::Start | Mode::End => (500., 15f32, 170., true),
            Mode::Orbit => (1000., 40., 20., true),
            _ => (1000., 40f32, 0., false),
        };
        let input_angle = if v.velocity.length() * v.params.dt * v.params.scale > 11. {
            v.velocity.x.atan2(-v.velocity.y).to_degrees().round()
        } else {
            v.yaw
        };
        let mut target = v.pos + Vec3::Z * (100. + if pan { 120. } else { 0. });
        match mode {
            Mode::Replay => {
                if let Some(p) = self
                    .replay
                    .iter()
                    .min_by(|a, b| manhattan(**a, v.pos).total_cmp(&manhattan(**b, v.pos)))
                {
                    self.position = *p - Vec3::Z * 100.;
                }
            }
            Mode::User(2) => {
                self.position = v.pos;
                target =
                    v.pos + v.forward() * 1000. + Vec3::Z * (-v.pitch.to_radians().sin() * 1000.);
            }
            Mode::User(3) => {
                self.position = v.pos + Vec3::Z * 3000.;
                target = v.pos - Vec3::Y;
            }
            _ => {
                self.yaw = angle_range(
                    self.yaw,
                    input_angle + offset,
                    if mode == Mode::Orbit {
                        1.
                    } else if pan {
                        0.1
                    } else {
                        0.2
                    },
                );
                let a = self.yaw.to_radians();
                let desired = v.pos - vec3(a.sin(), -a.cos(), 0.) * dist
                    + Vec3::Z * (dist * elevation.to_radians().sin()).abs();
                if pan {
                    let d = manhattan(v.pos, self.position);
                    let max = if d > dist * 1.5 { 20. * d / 250. } else { 20. };
                    self.position += (desired - self.position)
                        .clamp_length_max(max * if mode == Mode::Orbit { 5. } else { 1. });
                } else {
                    self.position = desired;
                }
            }
        }
        if !matches!(mode, Mode::User(2) | Mode::User(3)) {
            let d = target - self.position;
            let length = d.truncate().length();
            if length > 0.001 {
                self.look_pitch = angle_range(self.look_pitch, d.z.atan2(length).to_degrees(), 0.1);
                target = self.position
                    + d.truncate()
                        .extend(length * self.look_pitch.to_radians().tan());
            }
        }
        self.target = target;
        // Authored trackside cameras cut between stations rather than travelling
        // through the intervening scenery during render interpolation.
        if mode == Mode::Replay && self.position != self.previous {
            self.previous = self.position;
            self.previous_target = self.target;
        }
    }
}
