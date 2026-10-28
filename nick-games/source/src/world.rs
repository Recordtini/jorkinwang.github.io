use crate::{
    assets::Assets,
    collision::{CollisionWorld, transform},
    lingo_data,
    physics::Kind,
};
use macroquad::prelude::*;
use serde_json::Value;
#[derive(Clone, Debug)]
pub struct Entity {
    pub shape: String,
    pub model: String,
    pub position: Vec3,
    pub previous: Vec3,
    pub rotation: f32,
    pub tilt: f32,
    pub scale: f32,
    pub path: Vec<Vec3>,
    pub path_index: usize,
    pub path_direction: i32,
    pub path_loop: String,
    pub speed: f32,
    pub max_speed: f32,
    pub name: String,
    pub data: Value,
    pub active: bool,
    pub cooldown: i32,
    pub collected: u8,
    pub solid: bool,
    pub sprite: String,
    pub base: Vec3,
    pub lap: u32,
    pub crash_ticks: i32,
    pub flying: Vec3,
    pub race_progress: crate::rules::Progress,
    pub air_ticks: i32,
    pub vertical_speed: f32,
    pub surface: String,
}
#[derive(Clone, Debug)]
pub struct DemoPose {
    pub position: Vec3,
    pub yaw: f32,
    pub pitch: f32,
    pub roll: f32,
    pub speed: f32,
}
#[derive(Clone, Debug)]
pub struct Particle {
    pub position: Vec3,
    pub velocity: Vec3,
    pub life: i32,
    pub size: f32,
}
pub struct World {
    pub kind: Kind,
    pub collision: CollisionWorld,
    pub terrain: Vec<String>,
    pub entities: Vec<Entity>,
    pub track: Vec<Vec3>,
    pub tomato_total: usize,
    pub start: Vec3,
    pub targets: Vec<usize>,
    pub selected_target: Option<usize>,
    pub passenger: Option<Entity>,
    pub difficulty: u8,
    pub mode: u8,
    pub demo: Vec<DemoPose>,
    pub particles: Vec<Particle>,
    pub transitions: Vec<Entity>,
}
pub fn num(v: &Value, key: &str, default: f32) -> f32 {
    v.get(key)
        .and_then(Value::as_f64)
        .map(|n| n as f32)
        .unwrap_or(default)
}
pub fn text(v: &Value, key: &str, default: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or(default)
        .to_string()
}
pub fn vec(v: &Value) -> Vec3 {
    vec3(
        v[0].as_f64().unwrap_or(0.) as f32,
        v[1].as_f64().unwrap_or(0.) as f32,
        v[2].as_f64().unwrap_or(0.) as f32,
    )
}
fn shuffled(items: &mut [usize], rng: &mut u64) {
    for i in (1..items.len()).rev() {
        *rng ^= *rng << 13;
        *rng ^= *rng >> 7;
        *rng ^= *rng << 17;
        items.swap(i, (*rng as usize) % (i + 1));
    }
}
impl World {
    pub fn build(
        a: &Assets,
        kind: Kind,
        difficulty: u8,
        mode: u8,
        seed: u64,
    ) -> Result<Self, String> {
        let is_bus = kind == Kind::Bus;
        let raw = a
            .texts
            .get(if is_bus {
                "obstaclelist1"
            } else {
                "fop1obstacles"
            })
            .ok_or("Original obstacle data missing")?;
        let data = lingo_data::parse(raw)?;
        let list = data.as_array().ok_or("Obstacle data is not a list")?;
        let mut world = Self {
            kind,
            collision: CollisionWorld::new(if is_bus { 4000. } else { 16000. }),
            terrain: vec![],
            entities: vec![],
            track: vec![],
            tomato_total: 0,
            start: Vec3::ZERO,
            targets: vec![],
            selected_target: None,
            passenger: None,
            difficulty,
            mode,
            demo: Vec::new(),
            particles: Vec::new(),
            transitions: Vec::new(),
        };
        if let Some(raw) = a.texts.get(if is_bus {
            "pathdata"
        } else {
            "foptrackpathdata"
        }) {
            let value = lingo_data::parse(raw)?;
            if let Some(rows) = value.as_array() {
                world.demo = rows
                    .iter()
                    .map(|v| DemoPose {
                        position: vec(v),
                        yaw: v[3].as_f64().unwrap_or(0.) as f32,
                        pitch: v[4].as_f64().unwrap_or(0.) as f32,
                        roll: v[5].as_f64().unwrap_or(0.) as f32,
                        speed: v[8].as_f64().unwrap_or(0.) as f32,
                    })
                    .collect();
            }
        }
        if is_bus {
            for i in 1..=6 {
                let name = format!("city{i}.3gm");
                let m = a.model(&name).ok_or("City sector missing")?;
                world
                    .collision
                    .add(m, transform(Vec3::ZERO, 0., 150.), usize::MAX);
                world.terrain.push(name);
            }
        } else {
            let name = "foptrack.3gm".to_string();
            world.collision.add(
                a.model(&name).ok_or("Track missing")?,
                transform(Vec3::ZERO, 0., 12000.),
                usize::MAX,
            );
            world.terrain.push(name);
        }
        let mut rng = seed.max(1);
        let mut coins = vec![];
        let mut timers = vec![];
        let mut racers = vec![];
        let mut stops = vec![];
        for v in list {
            let shape = text(v, "shape", "").to_lowercase();
            let path: Vec<Vec3> = v["path"]
                .as_array()
                .map(|a| a.iter().map(vec).collect())
                .unwrap_or_default();
            if path.is_empty() {
                continue;
            }
            if shape == "track" {
                world.track = path;
                continue;
            }
            let mut scale = num(v, "scale", 100.);
            let mut rotation = num(v, "rotx", 0.);
            let mut position = path[0];
            let mut model = shape.clone();
            let mut sprite = String::new();
            let solid = if is_bus {
                !matches!(
                    shape.as_str(),
                    "target"
                        | "path"
                        | "arnold"
                        | "gerald"
                        | "helga"
                        | "grandpa"
                        | "time"
                        | "point"
                        | "turbo"
                        | "coin1"
                        | "coin2"
                        | "coin3"
                        | "jelly"
                )
            } else {
                matches!(shape.as_str(), "ramp" | "stop" | "finishline")
            };
            if shape.starts_with("coin") {
                model = "coin".into();
                scale /= 5.;
            } else if matches!(
                shape.as_str(),
                "point" | "turbo" | "time" | "heart" | "binary" | "timewarp"
            ) {
                sprite = format!("{shape}sp.t");
                model.clear();
                position.z += scale * 0.5;
            } else if !is_bus {
                model = match shape.as_str() {
                    "racer" => "nickfopbaddie".into(),
                    "stop" | "ramp" => {
                        let n = format!("nickfop{shape}{}", rotation as i32);
                        rotation = 0.;
                        n
                    }
                    _ => format!("nickfop{shape}"),
                };
                if shape == "racer" {
                    position.z += scale * 0.5;
                }
            }
            if is_bus
                && matches!(
                    shape.as_str(),
                    "path" | "arnold" | "helga" | "gerald" | "grandpa"
                )
            {
                if shape == "path" {
                    model = "arnold".into()
                }
                scale = 70.;
                position.z += scale * if shape == "grandpa" { 1.875 } else { 0.6125 };
            }
            let idx = world.entities.len();
            let active = true;
            if shape.starts_with("coin") {
                let level = shape
                    .chars()
                    .last()
                    .and_then(|c| c.to_digit(10))
                    .unwrap_or(1);
                if level <= difficulty as u32 {
                    coins.push(idx)
                }
            }
            if shape == "time" {
                timers.push(idx)
            }
            if shape == "racer" {
                racers.push(idx)
            }
            if shape == "stop" {
                stops.push(idx)
            }
            if shape == "target" {
                world.targets.push(idx)
            }
            world.entities.push(Entity {
                shape,
                model,
                position,
                previous: position,
                rotation,
                tilt: 0.,
                scale,
                path,
                path_index: 1,
                path_direction: 1,
                path_loop: text(v, "pathloop", "loop"),
                speed: if text(v, "shape", "") == "path" {
                    15.
                } else {
                    num(v, "speed", 10.)
                },
                max_speed: 0.,
                name: text(v, "targetname", ""),
                data: v.get("data").cloned().unwrap_or(Value::Null),
                active,
                cooldown: 0,
                collected: 0,
                lap: 1,
                crash_ticks: 0,
                flying: Vec3::ZERO,
                race_progress: Default::default(),
                air_ticks: 0,
                vertical_speed: 0.,
                surface: String::new(),
                solid,
                sprite,
                base: position,
            });
        }
        if is_bus {
            let radius = [0., 20000., 60000., 80000.][difficulty as usize];
            shuffled(&mut coins, &mut rng);
            coins.truncate(5 + difficulty as usize * 5);
            world.tomato_total = coins.len();
            shuffled(&mut timers, &mut rng);
            timers.retain(|i| world.entities[*i].position.length() < radius);
            timers.truncate(difficulty as usize * 5);
            let dozer = world
                .entities
                .iter()
                .position(|e| e.shape == "jelly" && e.position.length() < radius);
            let pedestrian = world.entities.iter().position(|e| {
                matches!(
                    e.shape.as_str(),
                    "path" | "arnold" | "gerald" | "helga" | "grandpa"
                ) && e.position.length() < radius
            });
            for (i, e) in world.entities.iter_mut().enumerate() {
                if e.shape.starts_with("coin") {
                    e.active = mode == 0 && coins.contains(&i)
                }
                if e.shape == "time" {
                    e.active = mode == 0 && timers.contains(&i)
                }
                if e.shape.starts_with("roadblock") {
                    let level = e.shape.chars().last().and_then(|c| c.to_digit(10));
                    if let Some(level) = level {
                        e.active = mode == 0 && level == difficulty as u32
                    }
                    e.model = if e.rotation.abs() == 90. {
                        "roadblock90".into()
                    } else {
                        "roadblock".into()
                    };
                }
                if e.shape == "target" {
                    e.active = mode != 0
                }
                if e.shape == "jelly" {
                    e.model = "bulldozer".into();
                    e.position.z += e.scale * 0.8;
                    e.active = Some(i) == dozer && (mode == 0 || mode == 2 && difficulty >= 2);
                    e.speed = [0., 15., 20., 30.][difficulty as usize];
                }
                if matches!(
                    e.shape.as_str(),
                    "path" | "arnold" | "gerald" | "helga" | "grandpa"
                ) {
                    e.active = Some(i) == pedestrian && mode != 1;
                }
                if e.shape == "mailbox" {
                    e.position.z -= 60.;
                }
                if mode == 1 && e.shape.starts_with("ramp") && e.position.z <= 1000. {
                    e.active = false;
                }
                if mode == 1 && matches!(e.shape.as_str(), "point" | "turbo") {
                    e.active = false
                }
            }
        } else {
            shuffled(&mut racers, &mut rng);
            racers.truncate(if mode == 2 { 0 } else { 5 });
            shuffled(&mut stops, &mut rng);
            stops.truncate(match difficulty {
                1 => 0,
                2 => 3,
                _ => 20,
            });
            for (i, e) in world.entities.iter_mut().enumerate() {
                if e.shape == "racer" {
                    e.active = racers.contains(&i);
                    e.speed = [0., 100., 150., 200.][difficulty as usize];
                    e.max_speed = match difficulty {
                        1 => 800.,
                        2 => 1100.,
                        _ => 1200.,
                    } + e
                        .data
                        .as_f64()
                        .or_else(|| e.data.as_str().and_then(|s| s.parse().ok()))
                        .unwrap_or(0.) as f32
                        * if difficulty == 3 { 500. } else { 400. };
                    e.path = world.track.clone();
                    e.path_index =
                        nearest(&e.path, e.position).saturating_add(1) % e.path.len().max(1)
                }
                if e.shape == "stop" {
                    e.active = stops.contains(&i)
                }
            }
            let mut locations: Vec<_> = (1..world.track.len()).collect();
            shuffled(&mut locations, &mut rng);
            for (shape, n) in [
                ("point", if mode == 1 { 20 } else { 0 }),
                (
                    "turbo",
                    if mode == 2 {
                        10 / difficulty as usize
                    } else if difficulty == 1 {
                        3
                    } else {
                        2
                    },
                ),
                (
                    "timewarp",
                    if mode == 2 {
                        0
                    } else if difficulty == 1 {
                        3
                    } else {
                        2
                    },
                ),
                ("binary", 10),
                ("heart", 10),
            ] {
                for _ in 0..n {
                    let Some(i) = locations.pop() else { break };
                    let base = world.track[i] + vec3(0., 0., 500.);
                    world.entities.push(Entity {
                        shape: shape.into(),
                        model: String::new(),
                        sprite: format!("{shape}sp.t"),
                        position: base,
                        previous: base,
                        base,
                        rotation: 0.,
                        tilt: 0.,
                        scale: 1000.,
                        path: vec![base],
                        path_index: 0,
                        path_direction: 1,
                        path_loop: "loop".into(),
                        speed: 10.,
                        max_speed: 0.,
                        name: String::new(),
                        data: Value::Null,
                        active: true,
                        cooldown: 0,
                        collected: 0,
                        lap: 1,
                        crash_ticks: 0,
                        flying: Vec3::ZERO,
                        race_progress: Default::default(),
                        air_ticks: 0,
                        vertical_speed: 0.,
                        surface: String::new(),
                        solid: false,
                    });
                }
            }
        }
        for e in &mut world.entities {
            e.previous = e.position;
            e.base = e.position;
        }
        // Static geometry shares one spatial index; moving actors are resolved separately.
        for (i, e) in world.entities.iter().enumerate() {
            if e.active
                && e.solid
                && let Some(m) = a.model(&e.model)
            {
                world
                    .collision
                    .add(m, transform(e.position, e.rotation, e.scale), i);
            }
        }
        if let Some(floor) = world.collision.ground(Vec3::ZERO, 2000., 4000.) {
            world.start.z = floor.pos.z + if is_bus { 100. } else { 150. };
        }
        Ok(world)
    }
    pub fn tick_transitions(&mut self, dt: f32) {
        for e in &mut self.transitions {
            e.previous = e.position;
            if let Some(target) = e.path.get(e.path_index) {
                let delta = *target - e.position;
                e.rotation = delta.x.atan2(-delta.y).to_degrees();
                let distance = e.speed * 30. * dt;
                if delta.length() <= distance {
                    e.position = *target;
                    e.path_index += 1;
                } else {
                    e.position += delta.normalize_or_zero() * distance;
                }
            }
        }
    }
    pub fn burst(&mut self, position: Vec3) {
        let scale = if self.kind == Kind::Bus { 0.2 } else { 1. };
        for i in 0..12 {
            let angle = i as f32 * std::f32::consts::TAU / 12.;
            self.particles.push(Particle {
                position,
                velocity: vec3(
                    angle.cos() * 80.,
                    angle.sin() * 80.,
                    50. + (i % 3) as f32 * 15.,
                ) * scale,
                life: 20,
                size: 180. * scale,
            });
        }
        if self.particles.len() > 240 {
            self.particles.drain(..self.particles.len() - 240);
        }
    }
    pub fn tick_entities(&mut self, slow: bool, hero: Vec3) {
        for p in &mut self.particles {
            p.position += p.velocity;
            p.velocity.z -= 3.;
            p.life -= 1;
        }
        self.particles.retain(|p| p.life > 0);
        let spawns: Vec<Vec3> = self
            .entities
            .iter()
            .filter(|e| e.shape == "jelly")
            .map(|e| e.path[0])
            .collect();
        let gate = self
            .entities
            .iter()
            .find(|e| e.shape == "finishline")
            .map(|e| e.position)
            .unwrap_or(Vec3::ZERO);
        for e in &mut self.entities {
            e.previous = e.position;
            if !e.active {
                if e.cooldown > 0 {
                    e.cooldown -= 1;
                    if e.cooldown == 0 {
                        e.active = true
                    }
                }
                continue;
            }
            if e.crash_ticks > 0 {
                e.crash_ticks -= 1;
                let planted = e.shape.contains("lamp")
                    || e.shape.contains("tree")
                    || e.shape.contains("sign");
                if !planted {
                    e.position += e.flying;
                    e.flying.z -= 4.;
                }
                e.tilt += if planted { 10. } else { -30. };
                if e.crash_ticks == 0 {
                    e.active = false
                }
                continue;
            }
            if e.shape == "jelly" {
                let territory = [0., 4000., 5000., 7000.][self.difficulty as usize];
                if e.base.truncate().distance(hero.truncate()) > territory
                    && e.position.truncate().distance(hero.truncate()) > 5000.
                    && let Some(pos) = spawns
                        .iter()
                        .filter(|p| p.truncate().distance(hero.truncate()) > 4500.)
                        .min_by(|a, b| {
                            a.distance_squared(hero)
                                .total_cmp(&b.distance_squared(hero))
                        })
                {
                    e.base = *pos + Vec3::Z * e.scale * 0.8;
                    e.position = e.base;
                }
                let target = if e.base.truncate().distance(hero.truncate()) < territory {
                    hero
                } else {
                    e.base
                };
                let direction = (target - e.position).with_z(0.).normalize_or_zero();
                let candidate = e.position + direction * e.speed;
                if self.collision.segment(e.position, candidate).is_none() {
                    e.position = candidate
                }
                if let Some(h) = self.collision.ground(e.position, 200., 2000.) {
                    e.position.z = h.pos.z + e.scale * 0.8
                }
                e.rotation = direction.x.atan2(-direction.y).to_degrees();
                continue;
            }
            if matches!(
                e.shape.as_str(),
                "racer" | "bulldozer" | "path" | "arnold" | "helga" | "gerald" | "grandpa"
            ) && e.path.len() > 1
            {
                let height = if e.shape == "racer" {
                    0.
                } else {
                    e.scale * if e.model == "grandpa" { 1.875 } else { 0.6125 }
                };
                let destination = e.path[e.path_index % e.path.len()] + Vec3::Z * height;
                let d = destination - e.position;
                let target_angle = d.x.atan2(-d.y).to_degrees();
                let delta = (target_angle - e.rotation + 180.).rem_euclid(360.) - 180.;
                if e.shape == "racer" {
                    let change = if delta.abs() <= 0.1 {
                        delta
                    } else {
                        delta.signum() * (delta.abs() * 0.1).max(0.1)
                    };
                    e.rotation += change;
                    if e.speed < 100. {
                        e.speed += 10.
                    } else if change.abs() > 0.1 {
                        e.speed = (e.speed - change.abs().min(10.) * 3.).max(10.)
                    } else {
                        e.speed = (e.speed + 10.).min(e.max_speed)
                    }
                } else {
                    e.rotation = target_angle;
                }
                let speed = if slow && e.shape == "racer" {
                    10.
                } else {
                    e.speed
                };
                if d.length() < speed.max(1.) * 2. {
                    e.position = if e.shape == "racer" {
                        destination.with_z(e.position.z)
                    } else {
                        destination
                    };
                    if e.path_loop == "pingpong" {
                        if e.path_direction > 0 && e.path_index + 1 >= e.path.len() {
                            e.path_direction = -1;
                        }
                        if e.path_direction < 0 && e.path_index == 0 {
                            e.path_direction = 1;
                        }
                        e.path_index = (e.path_index as i32 + e.path_direction) as usize;
                    } else {
                        e.path_index = (e.path_index + 1) % e.path.len();
                    }
                } else {
                    let a = e.rotation.to_radians();
                    e.position += vec3(a.sin(), -a.cos(), 0.) * speed;
                    if e.shape != "racer" {
                        e.position.z += d.z / d.length().max(1.) * speed;
                    }
                }
                if e.shape == "racer"
                    && e.race_progress
                        .update(&self.track, e.previous, e.position, gate)
                {
                    e.lap += 1;
                }
                if e.shape == "racer" {
                    let floor = self.collision.ground(e.position, e.scale + 200., 5000.);
                    let height = e.scale * 0.5;
                    let on_ground = floor.as_ref().map(|h| h.pos.z + height);
                    if e.air_ticks == 0 && on_ground.is_none_or(|z| e.position.z - z > 1200.) {
                        let slope = (e.speed * 10. * e.tilt.to_radians().sin()).abs();
                        e.vertical_speed = ((500. + slope)
                            * 3.
                            * if e.surface.contains("ramp") { 2. } else { 1. })
                        .min(3000.);
                        e.air_ticks = 1;
                    }
                    if e.air_ticks > 0 {
                        e.air_ticks += 1;
                        e.position.z += e.vertical_speed * 0.05 - 4.5;
                        e.vertical_speed -= 180.;
                        if let Some(z) = on_ground
                            && e.air_ticks > 5
                            && e.vertical_speed < 0.
                            && e.position.z <= z + 100.
                        {
                            e.air_ticks = 0;
                            e.position.z = z;
                        }
                    } else if let Some(z) = on_ground {
                        e.position.z = z;
                    }
                    if e.air_ticks == 0
                        && let Some(hit) = floor
                    {
                        e.surface = hit.texture;
                        let angle = e.rotation.to_radians();
                        let d = -(hit.normal.x * angle.sin() - hit.normal.y * angle.cos())
                            / hit.normal.z.abs().max(0.1);
                        e.tilt = (-d.atan().to_degrees()).clamp(-20., 20.);
                    }
                }
            }
        }
    }
    pub fn rank(&self, checkpoint: usize, lap: u32, pos: Vec3) -> usize {
        let n = self.track.len().max(1);
        let progress = lap as f32 * n as f32 + checkpoint as f32;
        1 + self
            .entities
            .iter()
            .filter(|e| e.active && e.shape == "racer")
            .filter(|e| {
                let point = nearest(&self.track, e.position);
                let other = e.lap as f32 * n as f32 + point as f32;
                other > progress
                    || other == progress
                        && self
                            .track
                            .get((point + 1) % n)
                            .is_some_and(|p| p.distance(e.position) < p.distance(pos))
            })
            .count()
    }
}
pub fn nearest(path: &[Vec3], p: Vec3) -> usize {
    path.iter()
        .enumerate()
        .min_by(|(_, a), (_, b)| a.distance_squared(p).total_cmp(&b.distance_squared(p)))
        .map(|(i, _)| i)
        .unwrap_or(0)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::{Manifest, Pack};
    #[test]
    fn original_obstacle_and_path_literals_parse_completely() {
        let p = Pack::open();
        for game in ["runaway-bus", "stupor-highway"] {
            let m: Manifest =
                serde_json::from_slice(p.get(&format!("{game}/manifest.json")).unwrap()).unwrap();
            for (key, text) in m.texts {
                if key.starts_with("obstaclelist")
                    || key == "fop1obstacles"
                    || key.ends_with("pathdata")
                {
                    let v =
                        lingo_data::parse(&text).unwrap_or_else(|e| panic!("{game}/{key}: {e}"));
                    assert!(v.is_array());
                }
            }
        }
    }
}
#[cfg(test)]
mod scene_tests {
    use super::*;
    use std::collections::HashMap;
    #[test]
    fn both_worlds_build_with_ground_at_original_start() {
        let pack = crate::assets::Pack::open();
        for (kind, game) in [(Kind::Bus, "runaway-bus"), (Kind::Hover, "stupor-highway")] {
            let m: crate::assets::Manifest =
                serde_json::from_slice(pack.get(&format!("{game}/manifest.json")).unwrap())
                    .unwrap();
            let models = m
                .models
                .into_iter()
                .map(|(n, f)| {
                    (
                        n,
                        crate::model::Model::parse(
                            pack.get(&format!("{game}/{}", f.file)).unwrap(),
                        )
                        .unwrap(),
                    )
                })
                .collect();
            let a = Assets {
                models,
                textures: HashMap::new(),
                sounds: HashMap::new(),
                texts: m.texts,
            };
            for difficulty in 1..=3 {
                for mode in 0..=2 {
                    let w = World::build(&a, kind, difficulty, mode, 123).unwrap();
                    assert!(
                        w.collision.ground(w.start, 2000., 4000.).is_some(),
                        "{game} {difficulty} {mode}: no start floor at {:?}",
                        w.start
                    );
                    assert!(w.collision.triangles.len() > 100);
                    let count = |shape: &str| {
                        w.entities
                            .iter()
                            .filter(|e| e.active && e.shape == shape)
                            .count()
                    };
                    for e in w
                        .entities
                        .iter()
                        .filter(|e| e.active && !e.model.is_empty())
                    {
                        assert!(
                            a.model(&e.model).is_some(),
                            "{game} missing active model {} ({})",
                            e.model,
                            e.shape
                        );
                    }
                    if kind == Kind::Bus {
                        assert_eq!(
                            w.entities
                                .iter()
                                .filter(|e| e.active && e.shape.starts_with("coin"))
                                .count(),
                            if mode == 0 {
                                5 + difficulty as usize * 5
                            } else {
                                0
                            }
                        );
                        assert_eq!(
                            count("time"),
                            if mode == 0 {
                                difficulty as usize * 5
                            } else {
                                0
                            }
                        );
                        assert_eq!(
                            count("jelly"),
                            usize::from(mode == 0 || mode == 2 && difficulty >= 2)
                        );
                    } else {
                        assert_eq!(count("racer"), if mode == 2 { 0 } else { 5 });
                        assert_eq!(count("point"), if mode == 1 { 20 } else { 0 });
                        assert_eq!(count("stop"), [0, 0, 3, 7][difficulty as usize]);
                    }
                }
            }
        }
    }
}
