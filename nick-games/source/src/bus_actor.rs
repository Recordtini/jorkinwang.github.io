//! gObstacles character movement. Path indices are zero-based; target counters
//! are decremented before movement, as in the original Director frame loop.
use crate::{bus_rules::manhattan, world::Entity};
use macroquad::prelude::*;
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Pose {
    #[default]
    Stand,
    Walk,
    Wave,
    Run,
}
#[derive(Clone, Debug)]
pub struct Actor {
    pub pose: Pose,
    pub phase: f32,
    pub remaining: i32,
    pub velocity: Vec3,
}
impl Default for Actor {
    fn default() -> Self {
        Self {
            pose: Pose::Stand,
            phase: 0.,
            remaining: 1,
            velocity: Vec3::ZERO,
        }
    }
}
#[derive(Clone, Debug)]
pub struct PathSpawn {
    pub points: Vec<Vec3>,
    pub loop_kind: String,
}
pub fn person(model: &str) -> bool {
    matches!(model, "arnold" | "gerald" | "helga" | "grandpa")
}
pub fn height(model: &str, scale: f32) -> f32 {
    scale * if model == "grandpa" { 1.875 } else { 0.6125 }
}
pub fn range(model: &str, pose: Pose) -> (f32, f32) {
    match (model, pose) {
        ("grandpa", Pose::Stand) => (1., 1.),
        ("grandpa", Pose::Wave) => (2., 25.),
        ("grandpa", Pose::Run) => (28., 42.),
        ("helga", Pose::Walk) => (48., 65.),
        ("gerald" | "grandpa", Pose::Walk) => (48., 63.),
        (_, Pose::Walk) => (48., 61.),
        (_, Pose::Wave) => (26., 44.),
        (_, Pose::Run) => (6., 21.),
        (_, Pose::Stand) => (25., 25.),
    }
}
impl Actor {
    pub fn pose(&mut self, pose: Pose) {
        if pose != self.pose {
            self.pose = pose;
            self.phase = 0.;
        }
    }
    pub fn frame(&self, model: &str) -> f32 {
        let (a, b) = range(model, self.pose);
        a + self.phase.rem_euclid((b - a).max(1.))
    }
}
pub fn random(rng: &mut u64, n: usize) -> usize {
    *rng = (*rng).max(1);
    *rng ^= *rng << 13;
    *rng ^= *rng >> 7;
    *rng ^= *rng << 17;
    *rng as usize % n
}
pub fn choose_person(reserved: &[String], rng: &mut u64) -> Option<String> {
    let choices: Vec<_> = ["arnold", "gerald", "helga", "grandpa"]
        .into_iter()
        .filter(|n| !reserved.iter().any(|r| r == n))
        .collect();
    if choices.is_empty() {
        None
    } else {
        Some(choices[random(rng, choices.len())].into())
    }
}
pub fn target(e: &mut Entity, ground_position: Vec3) {
    let delta = ground_position + Vec3::Z * height(&e.model, e.scale) - e.position;
    e.actor.velocity = delta.normalize_or_zero() * e.speed;
    e.actor.remaining = (delta.length() / e.speed.max(1.)).round().max(1.) as i32;
    if delta.truncate().length_squared() > 0. {
        e.rotation = delta.x.atan2(-delta.y).to_degrees();
    }
}
fn relocate(e: &mut Entity, paths: &[PathSpawn], hero: Vec3, reserved: &[String], rng: &mut u64) {
    let best = paths
        .iter()
        .filter(|p| !p.points.is_empty() && manhattan(p.points[0], hero) > 3500.)
        .min_by(|a, b| manhattan(a.points[0], hero).total_cmp(&manhattan(b.points[0], hero)));
    let Some(path) = best else {
        return;
    };
    if e.base == path.points[0] {
        return;
    }
    let mut occupied = reserved.to_vec();
    occupied.push(e.model.clone()); // Old walker is freed after choosing its replacement.
    if let Some(name) = choose_person(&occupied, rng) {
        e.model = name;
    }
    e.path = path.points.clone();
    e.path_loop = path.loop_kind.clone();
    e.path_index = 0;
    e.speed = 15.;
    e.actor.remaining = 1;
    e.base = path.points[0];
    e.position = e.base + Vec3::Z * height(&e.model, e.scale);
    e.previous = e.position;
    // changeAnimation assigns tempAnimDir=1 even after findNewPersonPath writes -1.
    e.actor.pose(Pose::Walk);
}
/// Call exactly once per original 30 Hz frame, including the destination overlay.
pub fn tick(
    e: &mut Entity,
    paths: &[PathSpawn],
    hero: Vec3,
    heading: f32,
    speed: f32,
    reserved: &[String],
    rng: &mut u64,
) {
    if !e.active {
        return;
    }
    e.previous = e.position;
    e.actor.phase += 1.;
    e.actor.remaining -= 1;
    if e.path.len() > 1 {
        if e.actor.remaining == 0 {
            let last = e.path_index + 1 == e.path.len();
            let mut next = None;
            if last {
                match e.path_loop.as_str() {
                    "pingpong" => e.path_direction = -1,
                    "hide" => {
                        e.active = false;
                        e.path = vec![e.path[0]];
                        next = Some(0);
                    }
                    "wave" => {
                        e.path = vec![*e.path.last().unwrap()];
                        e.actor.pose(Pose::Wave);
                        next = Some(0);
                    }
                    "new" => {
                        relocate(e, paths, hero, reserved, rng);
                    }
                    _ => next = Some(0),
                }
            } else if e.path_index == 0 {
                e.path_direction = 1;
            }
            e.path_index = next
                .unwrap_or_else(|| (e.path_index as i32 + e.path_direction).max(0) as usize)
                .min(e.path.len() - 1);
            target(e, e.path[e.path_index]);
        }
        // Deliberately no snap-to-waypoint: the original rounds distance/speed
        // and advances by its fixed velocity, including the final frame.
        e.position += e.actor.velocity;
    }
    if e.name == "path" && e.actor.remaining % 5 == 0 && e.speed != 60. {
        let d = manhattan(e.position, hero);
        if d > 4000. {
            relocate(e, paths, hero, reserved, rng);
        } else if d < speed * 20. {
            let direction =
                |angle: f32| vec3(angle.to_radians().sin(), -angle.to_radians().cos(), 0.);
            let mut dir = direction(heading + 90.);
            if manhattan(e.position + dir * 60., hero) < d {
                dir = direction(heading - 90.);
            }
            e.speed = 60.;
            target(e, e.position + dir * 2000.);
            e.actor.pose(Pose::Run);
            e.path_loop = "new".into();
            e.path.truncate(e.path_index + 1);
        }
    }
    if e.name == "passenger"
        && e.speed != 60.
        && e.actor.remaining % 5 == 0
        && e.path_loop == "wave"
        && manhattan(e.position, hero) < speed * 20.
    {
        let angle = (e.rotation + 180.).to_radians();
        let point = e.position + vec3(angle.sin(), -angle.cos(), 0.) * 2000.;
        e.speed = 60.;
        target(e, point);
        e.actor.pose(Pose::Run);
        e.path_loop = "hide".into();
        e.path.push(point);
        e.path_index += 1;
    }
}
