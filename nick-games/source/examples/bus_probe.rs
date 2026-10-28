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
    let mut v = nick_rust::physics::Vehicle::new(
        Kind::Bus,
        w.start,
        nick_rust::physics::Params::bus(&a),
        1,
    );
    for tick in 0..90 {
        v.tick(
            nick_rust::physics::Input {
                throttle: 1.,
                ..Default::default()
            },
            &w.collision,
        );
        if v.crash_object.is_some() || tick % 10 == 0 {
            let obj = v
                .crash_object
                .and_then(|i| w.entities.get(i))
                .map(|e| (&e.shape, e.position));
            println!(
                "{tick}: pos{:?} speed{:.2} yaw{:.1} collision{:?} {:?}",
                v.pos, v.speed, v.yaw, v.crash_object, obj
            );
        }
    }
}
