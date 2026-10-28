use macroquad::prelude::*;
use nick_rust::{
    assets::{Manifest, Pack},
    model::Model,
};
fn main() {
    let p = Pack::open();
    let manifest: Manifest =
        serde_json::from_slice(p.get("runaway-bus/manifest.json").unwrap()).unwrap();
    for (name, file) in manifest.models {
        let m = Model::parse(p.get(&format!("runaway-bus/{}", file.file)).unwrap()).unwrap();
        let transforms = m.animation.matrices(0.);
        let changed = transforms.iter().filter(|m| **m != Mat4::IDENTITY).count();
        if name.contains("city")
            || name.contains("roadblock")
            || name.contains("rubble")
            || name.contains("bulldozer")
        {
            println!(
                "{name} bounds {:?}..{:?} faces{} empty{}",
                m.min,
                m.max,
                m.faces.len(),
                m.faces
                    .iter()
                    .filter(|f| f.texture.starts_with("empty"))
                    .count()
            );
        }
        if changed > 0 {
            println!(
                "{name}: {} transformed groups, {} parents; {:?}..{:?}",
                changed,
                m.animation.parents.len(),
                m.min,
                m.max
            );
            for (i, t) in transforms.iter().enumerate().take(3) {
                println!("  {i}: {:?}", t);
            }
        }
    }
}
