use nick_rust::{
    assets::{Manifest, Pack},
    model::Model,
};
fn main() {
    let pack = Pack::open();
    for game in ["stupor-highway", "runaway-bus"] {
        let m: Manifest =
            serde_json::from_slice(pack.get(&format!("{game}/manifest.json")).unwrap()).unwrap();
        for (n, f) in m.models {
            let model = Model::parse(pack.get(&format!("{game}/{}", f.file)).unwrap()).unwrap();
            if n == "timmy.3gm" || n == "arnoldbus.3gm" || n == "nickfopfinishline.3gm" {
                println!(
                    "{n} ends {:?} parents {:?}",
                    model.animation.ends, model.animation.parents
                );
                let mut counts = std::collections::BTreeMap::new();
                for f in &model.faces {
                    *counts.entry(f.group).or_insert(0) += 1;
                }
                println!("groups {:?}", counts);
                if n == "timmy.3gm" {
                    let bones = model.animation.matrices(5.);
                    println!("timmy root {:?} envelope {:?}", bones[24], bones[23]);
                    for f in [5., 20., 40., 170.] {
                        let bones = model.animation.matrices(f);
                        let mut low = macroquad::prelude::Vec3::splat(f32::INFINITY);
                        let mut high = -low;
                        for face in &model.faces {
                            for i in &face.indices {
                                let p = bones[face.group].transform_point3(model.vertices[*i]);
                                low = low.min(p);
                                high = high.max(p);
                            }
                        }
                        println!("timmy frame{f} {low:?}..{high:?}");
                    }
                }
                let mut tex: Vec<_> = model.faces.iter().map(|f| &f.texture).collect();
                tex.sort();
                tex.dedup();
                if n == "foptrack.3gm" {
                    for (i, m) in model.animation.matrices(0.).iter().enumerate() {
                        println!("bone{i}: {:?}", m);
                    }
                }
                println!(
                    "{n} {:?}..{:?} tex:{:?} anim:{}",
                    model.min,
                    model.max,
                    tex,
                    model.animation.parents.len()
                );
            }
        }
    }
}
