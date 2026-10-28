use nick_rust::{
    assets::{Manifest, Pack},
    model::Model,
};
fn main() {
    let pack = Pack::open();
    let manifest: Manifest =
        serde_json::from_slice(pack.get("runaway-bus/manifest.json").unwrap()).unwrap();
    for name in ["gerald", "arnold", "grandpa"] {
        let model = Model::parse(
            pack.get(&format!(
                "runaway-bus/{}",
                manifest.models[&format!("{name}.3gm")].file
            ))
            .unwrap(),
        )
        .unwrap();
        let bones = model
            .animation
            .matrices(if name == "grandpa" { 67. } else { 2. });
        println!("{name}");
        for f in model
            .faces
            .iter()
            .filter(|f| f.texture.contains("brow") || f.texture == "geyes")
        {
            let p: Vec<_> = f
                .indices
                .iter()
                .map(|&i| bones[f.group].transform_point3(model.vertices[i]))
                .collect();
            let normal = (p[1] - p[0]).cross(p[2] - p[0]).normalize_or_zero();
            println!(
                "{} group{} normal{:?} pts{:?}",
                f.texture, f.group, normal, p
            );
        }
    }
}
