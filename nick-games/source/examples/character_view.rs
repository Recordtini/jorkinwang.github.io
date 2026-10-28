//! Local rendering diagnostic: no game rules or character artwork are changed.
use macroquad::prelude::*;
use nick_rust::{assets::Assets, renderer::Renderer};
fn conf() -> Conf {
    Conf {
        window_title: "Character material audit".into(),
        window_width: 1000,
        window_height: 700,
        ..Default::default()
    }
}
#[macroquad::main(conf)]
async fn main() {
    let a = Assets::load("runaway-bus").await.unwrap();
    let renderer = Renderer::new(&a).unwrap();
    let mut index = 0;
    let mut native = false;
    let mut hide_eyes = false;
    let mut hide_hair = false;
    loop {
        if is_key_pressed(KeyCode::Right) {
            index = (index + 1) % 4;
        }
        if is_key_pressed(KeyCode::Left) {
            index = (index + 3) % 4;
        }
        if is_key_pressed(KeyCode::T) {
            native = !native;
        }
        if is_key_pressed(KeyCode::E) {
            hide_eyes = !hide_eyes;
        }
        if is_key_pressed(KeyCode::H) {
            hide_hair = !hide_hair;
        }
        let name = ["arnold", "gerald", "grandpa", "helga"][index];
        let frame = if name == "grandpa" { 67. } else { 2. };
        clear_background(Color::from_rgba(90, 110, 130, 255));
        set_camera(&Camera3D {
            position: vec3(0., -210., 100.),
            target: vec3(0., 0., 65.),
            up: Vec3::Z,
            fovy: 45_f32.to_radians(),
            z_near: 1.,
            z_far: 1000.,
            ..Default::default()
        });
        if !native {
            renderer.draw_model(&a, name, Mat4::IDENTITY, frame);
        } else {
            gl_use_default_material();
            let m = a.model(name).unwrap();
            let bones = m.animation.matrices(frame);
            for face in &m.faces {
                if hide_eyes && face.texture.contains("eye")
                    || hide_hair && (face.texture.contains("hair") || face.texture.contains("brow"))
                {
                    continue;
                }
                let vertices = face
                    .indices
                    .iter()
                    .zip(&face.uv)
                    .map(|(&i, &uv)| {
                        Vertex::new2(bones[face.group].transform_point3(m.vertices[i]), uv, WHITE)
                    })
                    .collect();
                let indices = m
                    .triangulate(face)
                    .into_iter()
                    .flatten()
                    .map(|i| i as u16)
                    .collect();
                draw_mesh(&Mesh {
                    vertices,
                    indices,
                    texture: a.texture(&face.texture).cloned(),
                });
            }
        }
        set_default_camera();
        draw_text(
            format!(
                "{name} | {} | E hide eyes: {hide_eyes} | H hide hair: {hide_hair}",
                if native {
                    "default renderer"
                } else {
                    "game renderer"
                }
            ),
            12.,
            30.,
            22.,
            WHITE,
        );
        draw_text(
            "Left/Right character · T compare renderer · E eyes · H hair",
            12.,
            60.,
            20.,
            WHITE,
        );
        next_frame().await;
    }
}
