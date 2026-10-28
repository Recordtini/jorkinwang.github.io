//! Exercise original racer rules on the full track, including hard-mode blockers.
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
    for difficulty in 1..=3 {
        let mut world = World::build(&a, Kind::Hover, difficulty, 0, 123).unwrap();
        let mut finishes = 0;
        for tick in 0..16000 {
            world.tick_entities(false, world.start);
            world.sync_bus_colliders(&a);
            if std::env::args().any(|s| s == "--trace") && difficulty == 3 && tick < 250 {
                let e = world
                    .entities
                    .iter()
                    .rfind(|e| e.active && e.shape == "racer")
                    .unwrap();
                if e.position.y < -28000. && e.position.y > -40000. {
                    println!(
                        "TRACE {tick} pos{:?} yaw{} speed{} air{} pitch{} ground{} surface{} shadow{}",
                        e.position,
                        e.rotation,
                        e.speed,
                        e.air_ticks,
                        e.tilt,
                        e.racer.shadow_pitch,
                        e.surface,
                        e.racer.shadow_z
                    );
                }
            }
            let count = world
                .entities
                .iter()
                .filter(|e| e.active && e.shape == "racer" && e.racer.finished)
                .count();
            if count > finishes {
                finishes = count;
                println!("difficulty{difficulty} tick{tick} finished{finishes}");
            }
            if finishes == 5 {
                break;
            }
        }
        for e in world
            .entities
            .iter()
            .filter(|e| e.active && e.shape == "racer")
        {
            println!(
                "difficulty{difficulty} pos{:?} speed{} point{} counter{} lap{} surface{} collision{} finished{}",
                e.position,
                e.speed,
                e.racer.track.point,
                e.racer.track.counter,
                e.lap,
                e.surface,
                e.racer.collision,
                e.racer.finished
            );
        }
        assert!(
            finishes >= 4,
            "Racers failed to navigate at difficulty {difficulty}"
        );
    }
}
