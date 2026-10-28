//! Headless driving probe against the complete original FOP collision circuit.
use macroquad::prelude::*;
use nick_rust::{
    assets::{Assets, Manifest, Pack},
    model::Model,
    physics::{Input, Kind, Params, Vehicle},
    world::World,
};
use std::collections::HashMap;
fn main() {
    let pack = Pack::open();
    let game = "stupor-highway";
    let m: Manifest =
        serde_json::from_slice(pack.get(&format!("{game}/manifest.json")).unwrap()).unwrap();
    let models = m
        .models
        .into_iter()
        .map(|(n, f)| {
            (
                n,
                Model::parse(pack.get(&format!("{game}/{}", f.file)).unwrap()).unwrap(),
            )
        })
        .collect();
    let a = Assets {
        models,
        textures: HashMap::new(),
        sounds: HashMap::new(),
        sound_loops: HashMap::new(),
        texts: m.texts,
    };
    let mut world = World::build(&a, Kind::Hover, 1, 2, 123).unwrap();
    let mut v = Vehicle::new(Kind::Hover, world.start, Params::hover(), 1);
    let mut crashes = 0;
    for tick in 0..24000 {
        let target = (nick_rust::world::nearest(&world.track, v.pos) + 1) % world.track.len();
        let d = world.track[target] - v.pos;
        let aim = d.x.atan2(-d.y).to_degrees();
        let error = (aim - v.yaw + 180.).rem_euclid(360.) - 180.;
        let desired = if error.abs() > 30. { 80. } else { 180. };
        let input = Input {
            steer: (-error / 20. + v.angular_velocity * 0.6).clamp(-1., 1.),
            throttle: if v.speed < desired { 1. } else { 0. },
            brake: if v.speed > desired + 10. { 1. } else { 0. },
            slide: false,
        };
        world.tick_entities(false, v.pos);
        v.tick(input, &world.collision);
        if v.crash {
            crashes += 1;
        }
        if !v.pos.is_finite() || v.pos.z < -20000. {
            panic!(
                "fell off at tick {tick}, checkpoint {}, target {target}, position {:?}",
                v.hover_track.point, v.pos
            );
        }
        v.hover_track.update(&world.track, v.pos, false, &v.surface);
        if v.hover_track
            .finish(world.track.len(), &v.surface, &v.hover_contact)
        {
            println!(
                "Completed original circuit in {:.2}s; collisions {crashes}; final speed {:.1}",
                tick as f32 / 20.,
                v.speed
            );
            return;
        }
    }
    panic!(
        "did not complete; checkpoint {}, position {:?}",
        v.hover_track.point, v.pos
    );
}
