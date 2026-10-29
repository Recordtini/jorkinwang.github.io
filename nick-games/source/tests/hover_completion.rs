use macroquad::prelude::*;
use nick_rust::{
    assets::{Manifest, Pack},
    hover_actor::{Actor, Pose},
    hover_camera::{Camera, Mode},
    hover_drive::{Bounce, collectable},
    physics::{Kind, Params, Vehicle},
};
fn hero() -> Vehicle {
    Vehicle::new(Kind::Hover, vec3(0., 0., 150.), Params::hover(), 3)
}
#[test]
fn pickup_range_is_strict_manhattan_with_independent_height_not_a_swept_sphere() {
    assert!(collectable(Vec3::ZERO, vec3(500., 500., 1199.)));
    assert!(!collectable(Vec3::ZERO, vec3(700., 700., 0.)));
    assert!(!collectable(Vec3::ZERO, vec3(1200., 0., 0.)));
    assert!(!collectable(Vec3::ZERO, vec3(0., 0., 1200.)));
}
#[test]
fn end_poses_retain_authored_ranges_and_loss_loop_reverses() {
    let mut a = Actor::default();
    a.end(true);
    for _ in 0..90 {
        assert!((170. ..=205.).contains(&a.frame()));
        a.tick(1., true, true);
        assert_eq!(a.pose, Pose::Win);
    }
    a.end(false);
    assert_eq!(a.frame(), 130.);
    for _ in 0..17 {
        a.tick(0., false, false);
    }
    assert_eq!(a.pose, Pose::LoseLoop);
    assert_eq!(a.frame(), 165.);
    for _ in 0..17 {
        a.tick(0., false, false);
    }
    assert_eq!(a.frame(), 148.);
}
#[test]
fn landing_bounce_has_source_amplitude_decay_and_lifetime() {
    let mut b = Bounce::default();
    b.start(3000.);
    assert_eq!(b.multiplier, 2.);
    assert_eq!(b.offset, 0.);
    b.tick(true);
    let expected = -2. * (200. / 3.) * 30f32.to_radians().sin();
    assert!((b.offset - expected).abs() < 0.001);
    for _ in 0..200 {
        b.tick(true);
    }
    assert_eq!(b.offset, 0.);
    b.start(0.);
    assert_eq!(b.multiplier, 0.5);
}
#[test]
fn camera_preserves_source_chase_distances_fov_and_first_person_origin() {
    let v = hero();
    let mut c = Camera::new(&v);
    c.yaw = 0.;
    c.tick(&v, Mode::User(0));
    assert!((c.position.y - 1000.).abs() < 0.001);
    assert!((c.position.z - v.pos.z - 1000. * 40f32.to_radians().sin()).abs() < 0.001);
    assert_eq!(c.perspective, 120.);
    c.tick(&v, Mode::User(1));
    assert!((c.position.y - 2000.).abs() < 0.001);
    c.tick(&v, Mode::User(2));
    assert_eq!(c.position, v.pos);
    c.replay = vec![vec3(10., 20., 800.), vec3(10000., 0., 500.)];
    c.tick(&v, Mode::Replay);
    assert_eq!(c.position, vec3(10., 20., 700.));
    assert_eq!(c.perspective, 60.);
}
#[test]
fn recovered_menu_words_and_bitmap_font_cover_original_menu_labels() {
    let p = Pack::open();
    let m: Manifest =
        serde_json::from_slice(p.get("stupor-highway/manifest.json").unwrap()).unwrap();
    let words = nick_rust::lingo_data::parse(&m.texts["gametextnickfop"]).unwrap();
    assert_eq!(words["firstplay"], "PLAY");
    assert_eq!(words["gamecomplete"], "You Did It!");
    for label in [
        "play",
        "how to play",
        "high scores",
        "race",
        "time trial",
        "email rescue",
        "choose difficulty",
        "watch replay",
        "add score",
        "main menu",
    ] {
        for c in label.chars().filter(|c| !c.is_whitespace()) {
            assert!(
                m.textures.contains_key(&format!("{c}sp")),
                "missing original glyph {c}"
            );
        }
    }
    let raw: serde_json::Value =
        serde_json::from_slice(p.get("stupor-highway/manifest.json").unwrap()).unwrap();
    assert_eq!(raw["textures"]["buttonsp.s"]["width"], 147);
    assert_eq!(raw["textures"]["buttonsp.s"]["height"], 34);
    assert!(m.texts["instructions2"].contains("Powerslide"));
}
#[test]
fn hover_trail_uses_percent_scale_and_authored_speed_length() {
    use nick_rust::hover_visual::trail_matrix;
    let p = vec3(50., 100., 150.);
    let m = trail_matrix(p, 0., 0., 0., 400.);
    assert!((m.transform_point3(Vec3::ZERO) - (p + vec3(0., 270., -10.))).length() < 0.001);
    for axis in [Vec3::X, Vec3::Y, Vec3::Z] {
        assert!((m.transform_vector3(axis).length() - 2.4).abs() < 0.001);
    }
    assert_eq!(
        trail_matrix(p, 0., 0., 0., 50.).transform_vector3(Vec3::Y),
        Vec3::ZERO
    );
    assert!(
        (trail_matrix(p, 0., 0., 0., 225.)
            .transform_vector3(Vec3::Y)
            .length()
            - 1.2)
            .abs()
            < 0.001
    );
    let rotated = trail_matrix(p, 90., 0., 0., 400.);
    assert!((rotated.transform_point3(Vec3::ZERO) - (p + vec3(-270., 0., -10.))).length() < 0.001);
}
#[test]
fn replay_station_changes_cut_without_interpolating_through_world_geometry() {
    let mut v = hero();
    let mut c = Camera::new(&v);
    assert!((c.position.truncate().distance(v.pos.truncate()) - 10000.).abs() < 0.01);
    c.replay = vec![vec3(0., 0., 500.), vec3(10000., 0., 500.)];
    c.tick(&v, Mode::Replay);
    assert_eq!(c.previous, c.position);
    v.pos.x = 10000.;
    c.tick(&v, Mode::Replay);
    assert_eq!(c.previous, c.position);
    assert_eq!(c.previous_target, c.target);
    assert!((nick_rust::hover_visual::angle(359., 1., 0.5) - 360.).abs() < 0.001);
}
