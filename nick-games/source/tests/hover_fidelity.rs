use macroquad::prelude::*;
use nick_rust::{
    assets::{Assets, Manifest, Pack},
    collision::CollisionWorld,
    model::{Face, Model},
    physics::{Input, Kind, Params, Vehicle},
};
fn plane(points: Vec<Vec3>, texture: &str) -> Model {
    Model {
        faces: vec![Face {
            indices: (0..points.len()).collect(),
            uv: vec![Vec2::ZERO; points.len()],
            texture: texture.into(),
            group: 0,
        }],
        vertices: points,
        min: Vec3::ZERO,
        max: Vec3::ZERO,
        animation: Default::default(),
    }
}
fn floor() -> CollisionWorld {
    let mut w = CollisionWorld::new(10000.);
    w.add(
        &plane(
            vec![
                vec3(-100000., -100000., 0.),
                vec3(100000., -100000., 0.),
                vec3(100000., 100000., 0.),
                vec3(-100000., 100000., 0.),
            ],
            "dirt",
        ),
        Mat4::IDENTITY,
        usize::MAX,
    );
    w
}
fn hover() -> Vehicle {
    Vehicle::new(Kind::Hover, vec3(0., 0., 150.), Params::hover(), 3)
}
#[test]
fn space_is_source_one_and_a_half_throttle_with_tenth_grip() {
    let w = floor();
    let mut normal = hover();
    let mut space = hover();
    normal.tick(
        Input {
            throttle: 1.,
            ..Default::default()
        },
        &w,
    );
    space.tick(
        Input {
            slide: true,
            ..Default::default()
        },
        &w,
    );
    assert!((normal.speed - 5000. / 6000. * 5.).abs() < 0.0001);
    assert!((space.speed - normal.speed * 1.5).abs() < 0.0001);
    let mut turbo = hover();
    turbo.turbo = 100;
    turbo.tick(Input::default(), &w);
    assert!((turbo.speed - normal.speed * 2.).abs() < 0.0001);
}
#[test]
fn turning_uses_director_rounding_for_the_angular_acceleration_cap() {
    let mut v = hover();
    v.velocity = vec2(0., -30.);
    v.speed = 30.;
    v.acceleration.x = 1.;
    v.tick(
        Input {
            steer: 1.,
            ..Default::default()
        },
        &floor(),
    );
    let expected = -(v.speed / 20.).round() * 3. * v.params.dt;
    assert!((v.angular_velocity - expected).abs() < 0.00001);
}
#[test]
fn hover_jump_uses_analytic_height_and_five_frame_landing_grace() {
    let mut v = hover();
    v.jumping = true;
    v.grounded = false;
    v.jump_start = 150.;
    v.jump_initial_speed = 1500.;
    v.jump_time = 0.;
    let w = floor();
    for frame in 1..=5 {
        v.tick(Input::default(), &w);
        let t = frame as f32 * 0.05;
        assert!(v.jumping, "Premature landing at frame {frame}");
        assert!((v.pos.z - (150. + 1500. * t - 3600. * t * t / 2.)).abs() < 0.001);
    }
    for _ in 0..30 {
        v.tick(Input::default(), &w);
        if !v.jumping {
            break;
        }
    }
    assert!(!v.jumping);
    assert!((v.pos.z - 150.).abs() < 0.001);
}
#[test]
fn hover_launch_uses_last_ramp_surface_multiplier_and_radius() {
    let w = CollisionWorld::new(500.);
    let mut v = hover();
    v.surface = "ramp".into();
    v.tick(Input::default(), &w);
    assert!(v.jumping);
    assert_eq!(v.jump_initial_speed, 3000.);
    let mut plain = hover();
    plain.tick(Input::default(), &w);
    assert_eq!(plain.jump_initial_speed, 1500.);
}
#[test]
fn hover_wall_contact_has_original_normalized_lever_and_damping() {
    let mut w = floor();
    w.add(
        &plane(
            vec![
                vec3(-1000., -350., 0.),
                vec3(1000., -350., 0.),
                vec3(1000., -350., 1000.),
                vec3(-1000., -350., 1000.),
            ],
            "wall",
        ),
        Mat4::IDENTITY,
        usize::MAX,
    );
    let mut v = hover();
    v.params.throttle = 0.;
    v.params.drag = 0.;
    v.params.resistance = 0.;
    v.velocity = vec2(0., -100.);
    v.speed = 100.;
    v.acceleration.x = 1.;
    v.tick(Input::default(), &w);
    assert!(v.crash);
    assert!((v.velocity.y - 72.).abs() < 0.001, "{:?}", v.velocity);
    assert!((v.pos.y - 288.).abs() < 0.001);
    assert_eq!(v.damage, 0.);
}
#[test]
fn hover_landing_uses_four_height_radius_instead_of_snapping_to_nearby_ground() {
    let mut v = hover();
    v.pos.z = 3000.;
    v.previous = v.pos;
    v.jumping = true;
    v.jump_time = 0.3;
    v.jump_start = 3000.;
    v.jump_initial_speed = 0.;
    v.tick(Input::default(), &floor());
    assert!(v.jumping);
    assert!((v.pos.z - 2779.5).abs() < 0.01);
}
#[test]
fn timmy_defaults_match_original_equipment_and_ground_clearance() {
    let p = Pack::open();
    let m: Manifest =
        serde_json::from_slice(p.get("stupor-highway/manifest.json").unwrap()).unwrap();
    let a = Assets {
        models: m
            .models
            .into_iter()
            .map(|(n, f)| {
                (
                    n,
                    Model::parse(p.get(&format!("stupor-highway/{}", f.file)).unwrap()).unwrap(),
                )
            })
            .collect(),
        textures: Default::default(),
        sounds: Default::default(),
        sound_loops: Default::default(),
        texts: m.texts,
    };
    let w = nick_rust::world::World::build(&a, Kind::Hover, 3, 2, 123).unwrap();
    assert_eq!(hover().height, 150.);
    let ground = w.collision.ground(Vec3::ZERO, 2000., 2000.).unwrap();
    assert!((w.start.z - ground.pos.z - 150.).abs() < 0.001);
    assert_eq!(
        w.entities
            .iter()
            .filter(|e| e.active && e.shape == "racer")
            .count(),
        0
    );
}

#[test]
fn hover_audio_resolves_original_available_engine_and_turbo_members() {
    use nick_rust::audio::hover_engine;
    assert_eq!(hover_engine(0., 0), ""); // No idle member exists; gameAdjust resolves to none.
    assert_eq!(hover_engine(20., 0), "hoverengine.aif");
    assert_eq!(hover_engine(20., 100), "turbo.aif");
}

#[test]
fn hover_camera_audio_uses_original_distance_falloff_and_minimum() {
    use nick_rust::audio::hover_gain;
    assert!((hover_gain(0.) - 155. / 255.).abs() < 1e-6);
    assert!((hover_gain(45000.) - 27.5 / 255.).abs() < 1e-6);
    assert!((hover_gain(100000.) - 10. / 255.).abs() < 1e-6);
}

#[test]
fn timmy_turns_loop_and_return_through_original_authored_ranges() {
    use nick_rust::hover_actor::{Actor, Pose};
    let mut a = Actor::default();
    a.tick(1., false, false);
    assert_eq!(a.frame(), 90.);
    for _ in 0..9 {
        a.tick(1., false, false);
    }
    assert_eq!(a.pose, Pose::LeftLoop);
    assert_eq!(a.frame(), 100.);
    a.tick(0., false, false);
    assert_eq!(a.frame(), 116.);
    for _ in 0..9 {
        a.tick(0., false, false);
    }
    assert_eq!(a.frame(), 5.);
    a.tick(-1., false, false);
    assert_eq!(a.frame(), 50.);
    a.tick(0., false, true);
    assert!((5.0..40.0).contains(&a.frame()));
    a.tick(0., false, false);
    assert_eq!(a.frame(), 200.);
    for _ in 0..5 {
        a.tick(0., false, false);
    }
    assert_eq!(a.pose, Pose::Idle);
}
#[test]
fn reverse_switches_at_zero_and_up_takes_precedence_over_down() {
    let w = floor();
    let mut v = hover();
    v.speed = 5.;
    v.velocity = vec2(0., -5.);
    v.acceleration.x = 1.;
    v.tick(
        Input {
            brake: 1.,
            ..Default::default()
        },
        &w,
    );
    assert!(!v.reverse, "low speed alone must not switch to reverse");
    let mut v = hover();
    v.tick(
        Input {
            brake: 1.,
            ..Default::default()
        },
        &w,
    );
    assert!(v.reverse);
    let mut both = hover();
    both.tick(
        Input {
            throttle: 1.,
            brake: 1.,
            ..Default::default()
        },
        &w,
    );
    assert!(!both.reverse);
    assert!(both.pos.y < 0.);
}
