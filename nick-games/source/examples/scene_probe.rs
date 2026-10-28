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
    let w = World::build(&a, Kind::Hover, 1, 0, 123).unwrap();
    println!("start {:?}", w.start);
    println!("ground {:?}", w.collision.ground(Vec3::ZERO, 2000., 4000.));
    println!(
        "camera {:?}",
        w.collision
            .segment(w.start + Vec3::Z * 100., w.start + vec3(0., 2000., 1000.))
    );
    for e in &w.entities {
        if e.shape == "ramp" {
            println!("ramp {:?} scale{} model{}", e.position, e.scale, e.model);
        }
    }
    for i in 25..34 {
        let point = w.track[i];
        println!(
            "point{i} {point:?} floor {:?}",
            w.collision.ground(point, 5000., 15000.)
        );
    }
    for y in [
        170000., 180000., 190000., 195000., 199000., 200000., 205000., 210000.,
    ] {
        println!(
            "floor y{y}: {:?}",
            w.collision.ground(vec3(226630., y, 0.), 20000., 50000.)
        );
    }
    println!(
        "stuck wall {:?}",
        w.collision.walls(
            vec3(226630., 199000., -6119.),
            vec3(226630., 205000., -6119.)
        )
    );
    for name in ["foptrack", "nickfopfinishline"] {
        let model = a.model(name).unwrap();
        println!("{name} matrices {:?}", model.animation.matrices(0.));
    }
}
