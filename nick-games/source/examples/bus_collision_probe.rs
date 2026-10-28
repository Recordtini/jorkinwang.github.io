use macroquad::prelude::*;
use nick_rust::{
    assets::{Assets, Manifest, Pack},
    model::Model,
    physics::Kind,
    world::World,
};
use std::collections::HashMap;
fn main() {
    let pack = Pack::open();
    let game = "runaway-bus";
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
    let w = World::build(&a, Kind::Bus, 1, 0, 123).unwrap();
    let mut failures = 0;
    for heading in (0..360).step_by(15) {
        let mut v = nick_rust::physics::Vehicle::new(
            Kind::Bus,
            w.start,
            nick_rust::physics::Params::bus(&a),
            1,
        );
        v.yaw = heading as f32;
        for tick in 0..300 {
            v.tick(
                nick_rust::physics::Input {
                    throttle: 1.,
                    steer: if tick > 180 { 0.4 } else { 0. },
                    ..Default::default()
                },
                &w.collision,
            );
            if let Some(hit) = w.collision.walls(v.previous, v.pos)
                && hit.normal.z.abs() < 0.2
                && !w.collision.is_breakable(hit.object)
            {
                failures += 1;
                if failures < 20 {
                    println!(
                        "crossed wall heading{heading} tick{tick} {:?}->{:?} texture{} crash{:?} speed{}",
                        v.previous, v.pos, hit.texture, v.crash_object, v.speed
                    );
                }
            }
            if v.pos.z < -500. {
                break;
            }
        }
    }
    println!("solid wall centre crossings: {failures}");
}
