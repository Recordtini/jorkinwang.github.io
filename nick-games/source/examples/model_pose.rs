use macroquad::prelude::*;
use nick_rust::{
    assets::{Manifest, Pack},
    model::Model,
};
use std::collections::HashSet;
fn main() {
    let p = Pack::open();
    let manifest: Manifest =
        serde_json::from_slice(p.get("runaway-bus/manifest.json").unwrap()).unwrap();
    for name in ["arnold", "helga", "gerald", "grandpa"] {
        let model = Model::parse(
            p.get(&format!(
                "runaway-bus/{}",
                manifest.models[&format!("{name}.3gm")].file
            ))
            .unwrap(),
        )
        .unwrap();
        let frames = if name == "grandpa" {
            vec![0., 1., 2., 67.]
        } else {
            vec![0., 1., 2., 25., 48.]
        };
        for frame in frames {
            let bones = model.animation.matrices(frame);
            println!("{name} frame {frame}");
            for (g, mat) in bones.iter().enumerate() {
                let faces: Vec<_> = model.faces.iter().filter(|f| f.group == g).collect();
                let vertices: HashSet<_> = faces
                    .iter()
                    .flat_map(|f| f.indices.iter().copied())
                    .collect();
                if vertices.is_empty() {
                    continue;
                }
                let mut lo = Vec3::splat(f32::INFINITY);
                let mut hi = Vec3::splat(f32::NEG_INFINITY);
                let mut local_lo = lo;
                let mut local_hi = hi;
                for &i in &vertices {
                    let v = model.vertices[i];
                    local_lo = local_lo.min(v);
                    local_hi = local_hi.max(v);
                    let v = mat.transform_point3(v);
                    lo = lo.min(v);
                    hi = hi.max(v);
                }
                let textures: HashSet<_> = faces.iter().map(|f| &f.texture).collect();
                println!(
                    "g{g} parent{} local {local_lo:?}..{local_hi:?} posed{lo:?}..{hi:?} tex{textures:?} pos{:?}",
                    model.animation.parents[g],
                    model.animation.positions[g]
                        .iter()
                        .take(2)
                        .collect::<Vec<_>>()
                );
            }
        }
    }
}
