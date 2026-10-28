use macroquad::prelude::*;
use nick_rust::{
    assets::{Assets, Manifest, Pack},
    collision::CollisionWorld,
    hover_race::{self, TrackPosition},
    model::{Face, Model},
    physics::Kind,
    world::{Entity, World},
};
fn assets() -> Assets {
    let p = Pack::open();
    let m: Manifest =
        serde_json::from_slice(p.get("stupor-highway/manifest.json").unwrap()).unwrap();
    Assets {
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
    }
}
fn face(points: Vec<Vec3>, texture: &str) -> Model {
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
        &face(
            vec![
                vec3(-10000., -10000., 0.),
                vec3(10000., -10000., 0.),
                vec3(10000., 10000., 0.),
                vec3(-10000., 10000., 0.),
            ],
            "dirt",
        ),
        Mat4::IDENTITY,
        usize::MAX,
    );
    w
}
fn racer(a: &Assets) -> Entity {
    let w = World::build(a, Kind::Hover, 1, 0, 123).unwrap();
    let mut e = w
        .entities
        .into_iter()
        .find(|e| e.active && e.shape == "racer")
        .unwrap();
    e.position = vec3(0., 0., 150.);
    e.previous = e.position;
    e.rotation = 0.;
    e.tilt = 0.;
    e.speed = 100.;
    e.max_speed = 300.;
    e.racer = Default::default();
    e.racer.acceleration = 12.;
    e.path = vec![
        vec3(0., -5000., 0.),
        vec3(0., -9000., 0.),
        vec3(0., -10000., 0.),
    ];
    e
}
#[test]
fn hud_uses_original_centers_radar_projection_and_sixty_tick_clock() {
    use nick_rust::hover_hud::*;
    assert_eq!(CLOCK, vec2(20., 38.));
    assert_eq!(RANK, vec2(20., 85.));
    assert_eq!(BEST, vec2(20., 132.));
    assert_eq!(LAP, vec2(20., 180.));
    assert_eq!(SCORE, vec2(540., 20.));
    assert_eq!(radar_position(Vec3::ZERO), vec2(60., 260.));
    assert!(radar_position(vec3(10000., -10000., 500.)).distance(vec2(58.7, 258.7)) < 0.001);
    assert_eq!(clock(1.05), "0:01:03");
    assert_eq!(clock(65.5), "1:05:30");
    assert_eq!(clock(600.), "0:10:00");
    let chars = glyph_centers("1:0", CLOCK, |c| match c {
        '1' => 8.,
        ':' => 5.,
        _ => 10.,
    });
    assert_eq!(
        chars.iter().map(|(_, p)| p.x).collect::<Vec<_>>(),
        vec![20., 26., 33.]
    );
    assert_eq!(glyph_centers("123456789", SCORE, |_| 10.).len(), 8);
}
#[test]
fn source_racer_parameters_and_jittered_paths_are_created_for_each_difficulty() {
    let a = assets();
    for difficulty in 1..=3 {
        let w = World::build(&a, Kind::Hover, difficulty, 0, 123).unwrap();
        let mut paths = vec![];
        for e in w.entities.iter().filter(|e| e.active && e.shape == "racer") {
            let (low, high) = match difficulty {
                1 => (10., 13.),
                2 => (12., 17.),
                _ => (15., 20.),
            };
            assert!((low..=high).contains(&e.racer.acceleration));
            assert_eq!(e.speed, [0., 100., 150., 200.][difficulty as usize]);
            assert_eq!(e.path.len(), w.track.len());
            for (p, t) in e.path.iter().zip(&w.track) {
                assert!((p.x - t.x).abs() <= 1000. && (p.y - t.y).abs() <= 1000.);
                assert_eq!(p.z, t.z);
            }
            paths.push(e.path.clone());
        }
        assert_eq!(paths.len(), 5);
        assert!(paths.windows(2).all(|p| p[0] != p[1]));
    }
}
#[test]
fn racers_accelerate_by_their_own_source_increment_and_do_not_snap_to_waypoints() {
    let a = assets();
    let mut e = racer(&a);
    let track = e.path.clone();
    hover_race::tick(&mut e, 7, &floor(), &track, 2);
    assert_eq!(e.speed, 112.);
    assert!((e.position.y + 112.).abs() < 0.001);
    assert_eq!(e.position.z, 150.);
    e.speed = 10.;
    let previous = e.position;
    hover_race::tick(&mut e, 7, &floor(), &track, 2);
    assert_eq!(e.speed, 22.);
    assert!((e.position.distance(previous) - 22.).abs() < 0.001);
}
#[test]
fn source_turn_smoothing_wraps_angles_and_slowdown_is_three_times_the_turn() {
    assert!((hover_race::angle_range(359., 1., 0.1) - 359.2).abs() < 0.001);
    let a = assets();
    let mut e = racer(&a);
    e.path[0] = vec3(5000., 0., 0.);
    let track = e.path.clone();
    hover_race::tick(&mut e, 7, &floor(), &track, 2);
    assert!((e.rotation - 9.).abs() < 0.001);
    assert!((e.speed - 73.).abs() < 0.001);
}
#[test]
fn racer_axis_probes_stop_at_twenty_units_from_walls_and_respect_wall_material() {
    let a = assets();
    for (texture, expected_speed) in [("stopwall", 89.6), ("gridwall", 112.)] {
        let mut w = floor();
        w.add(
            &face(
                vec![
                    vec3(-1000., -100., 0.),
                    vec3(1000., -100., 0.),
                    vec3(1000., -100., 1000.),
                    vec3(-1000., -100., 1000.),
                ],
                texture,
            ),
            Mat4::IDENTITY,
            10,
        );
        let mut e = racer(&a);
        let track = e.path.clone();
        hover_race::tick(&mut e, 7, &w, &track, 2);
        assert!((e.position.y + 80.).abs() < 0.001);
        assert!((e.speed - expected_speed).abs() < 0.001);
    }
}
#[test]
fn racer_jump_uses_source_analytical_trajectory() {
    let a = assets();
    let mut e = racer(&a);
    e.position.z = 2000.;
    let track = e.path.clone();
    let w = floor();
    hover_race::tick(&mut e, 7, &w, &track, 2);
    assert!(e.air_ticks > 0);
    assert_eq!(e.racer.jump_speed, 1500.);
    hover_race::tick(&mut e, 7, &w, &track, 2);
    assert!((e.position.z - 2132.).abs() < 0.01);
}
#[test]
fn progress_requires_finish_texture_and_ranking_uses_lap_point_then_manhattan_distance() {
    let mut p = TrackPosition {
        point: 50,
        counter: 50,
        ..Default::default()
    };
    assert!(!p.finish(51, "dirt", ""));
    assert!(p.finish(51, "finishid", ""));
    assert_eq!(p.lap, 2);
    assert!(!p.finish(51, "finishid", ""));
    let a = TrackPosition {
        point: 5,
        distance: 100.,
        ..Default::default()
    };
    let mut b = a.clone();
    b.distance = 101.;
    assert!(a.ahead_of(&b, 51));
    b.point = 6;
    assert!(b.ahead_of(&a, 51));
    let wrap = TrackPosition {
        point: 1,
        counter: 50,
        ..Default::default()
    };
    let end = TrackPosition {
        point: 50,
        counter: 50,
        ..Default::default()
    };
    assert!(wrap.ahead_of(&end, 51));
}
#[test]
fn opponent_proxy_matches_the_original_box_and_follows_moving_racers() {
    let a = assets();
    let mut w = World::build(&a, Kind::Hover, 1, 0, 123).unwrap();
    let i = w
        .entities
        .iter()
        .position(|e| e.active && e.shape == "racer")
        .unwrap();
    let p = w.entities[i].position;
    let hit = w
        .collision
        .segment_object(p + Vec3::Y * 2000., p - Vec3::Y * 2000., i)
        .unwrap();
    assert_eq!(hit.object, i);
    w.entities[i].position.x += 5000.;
    w.sync_bus_colliders(&a);
    let p = w.entities[i].position;
    assert_eq!(
        w.collision
            .segment_object(p + Vec3::Y * 2000., p - Vec3::Y * 2000., i)
            .unwrap()
            .object,
        i
    );
    assert!(w.collision.velocity(i).is_some());
}

#[test]
fn timewarp_resets_racer_speed_once_then_source_acceleration_resumes() {
    let a = assets();
    let mut w = World::build(&a, Kind::Hover, 1, 0, 123).unwrap();
    w.timewarp_racers();
    assert!(
        w.entities
            .iter()
            .filter(|e| e.active && e.shape == "racer")
            .all(|e| e.speed == 10.)
    );
    w.tick_entities(true, w.start);
    for e in w.entities.iter().filter(|e| e.active && e.shape == "racer") {
        assert!((e.speed - (10. + e.racer.acceleration)).abs() < 0.001);
        assert!(e.position.truncate().distance(e.previous.truncate()) > 10.);
    }
}
#[test]
fn player_contacts_use_a_quarter_of_racer_velocity_and_transfer_the_impulse() {
    use nick_rust::physics::{Input, Params, Vehicle};
    let mut w = floor();
    let wall = face(
        vec![
            vec3(-1000., -350., 0.),
            vec3(1000., -350., 0.),
            vec3(1000., -350., 1000.),
            vec3(-1000., -350., 1000.),
        ],
        "empty",
    );
    w.add_moving(&wall, Mat4::IDENTITY, 7);
    w.set_velocity(7, vec2(0., -120.));
    let mut v = Vehicle::new(Kind::Hover, vec3(0., 0., 150.), Params::hover(), 1);
    v.velocity = vec2(0., -100.);
    v.speed = 100.;
    v.acceleration.x = 1.;
    v.params.throttle = 0.;
    v.params.drag = 0.;
    v.params.resistance = 0.;
    v.tick(Input::default(), &w);
    assert!((v.velocity.y + 24.).abs() < 0.001, "{:?}", v.velocity);
    assert_eq!(v.hover_transfers.len(), 1);
    assert_eq!(v.hover_transfers[0].0, 7);
    assert!((v.hover_transfers[0].1.y - 70.).abs() < 0.001);
}
