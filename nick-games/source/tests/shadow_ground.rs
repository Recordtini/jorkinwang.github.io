use macroquad::prelude::*;
use nick_rust::{
    collision::CollisionWorld,
    model::{Face, Model},
    renderer::shadow_ground,
};

fn plane(z: f32) -> Model {
    Model {
        vertices: vec![
            vec3(-1000., -1000., z),
            vec3(1000., -1000., z),
            vec3(1000., 1000., z),
            vec3(-1000., 1000., z),
        ],
        faces: vec![Face {
            indices: vec![0, 1, 2, 3],
            uv: vec![Vec2::ZERO; 4],
            texture: "road".into(),
            group: 0,
        }],
        min: vec3(-1000., -1000., z),
        max: vec3(1000., 1000., z),
        animation: Default::default(),
    }
}
#[test]
fn player_shadow_uses_ground_below_even_when_a_bridge_is_overhead() {
    let mut world = CollisionWorld::new(2000.);
    world.add(&plane(0.), Mat4::IDENTITY, usize::MAX);
    world.add(&plane(500.), Mat4::IDENTITY, usize::MAX);
    for player_height in [100., 150., 400.] {
        let hit = shadow_ground(&world, vec3(0., 0., player_height)).unwrap();
        assert!((hit.pos.z - 0.).abs() < 0.01, "height {player_height}");
    }
    let hit = shadow_ground(&world, vec3(0., 0., 650.)).unwrap();
    assert!((hit.pos.z - 500.).abs() < 0.01);
    assert!(shadow_ground(&world, vec3(0., 0., -50.)).is_none());
}
