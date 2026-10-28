use macroquad::prelude::*;
use nick_rust::{
    assets::{Assets, Manifest, Pack},
    bus_actor::{self, Actor, PathSpawn, Pose},
    bus_rules::{Recovery, RoadFrame, Settings},
    model::Model,
    physics::{Input, Kind, Params, Vehicle},
    world::{Entity, World},
};
fn assets() -> Assets {
    let p = Pack::open();
    let m: Manifest = serde_json::from_slice(p.get("runaway-bus/manifest.json").unwrap()).unwrap();
    Assets {
        models: m
            .models
            .into_iter()
            .map(|(n, f)| {
                (
                    n,
                    Model::parse(p.get(&format!("runaway-bus/{}", f.file)).unwrap()).unwrap(),
                )
            })
            .collect(),
        textures: Default::default(),
        sounds: Default::default(),
        sound_loops: Default::default(),
        texts: m.texts,
    }
}
fn person() -> Entity {
    let a = assets();
    let w = World::build(&a, Kind::Bus, 1, 0, 123).unwrap();
    let mut e = w.entities.into_iter().find(|e| e.name == "path").unwrap();
    e.active = true;
    e.model = "arnold".into();
    e.name = "path".into();
    e.scale = 70.;
    e.path = vec![Vec3::ZERO, vec3(100., 0., 0.)];
    e.path_index = 0;
    e.path_direction = 1;
    e.path_loop = "pingpong".into();
    e.base = Vec3::ZERO;
    e.position = Vec3::Z * bus_actor::height(&e.model, e.scale);
    e.previous = e.position;
    e.speed = 15.;
    e.actor = Actor::default();
    e.actor.pose(Pose::Walk);
    e
}
#[test]
fn walkers_use_rounded_segment_counters_instead_of_snapping() {
    let mut e = person();
    let mut rng = 1;
    for _ in 0..7 {
        bus_actor::tick(&mut e, &[], vec3(500., 500., 0.), 0., 0., &[], &mut rng);
    }
    assert!((e.position.x - 105.).abs() < 0.001); // integer(100/15)=7 steps of 15.
    assert_eq!(e.path_index, 1);
    bus_actor::tick(&mut e, &[], vec3(500., 500., 0.), 0., 0., &[], &mut rng);
    assert_eq!(e.path_direction, -1);
    assert!((e.position.x - 90.).abs() < 0.001);
}
#[test]
fn waiting_passenger_flees_away_then_hides_with_grandpas_own_animation() {
    let mut e = person();
    e.model = "grandpa".into();
    e.name = "passenger".into();
    e.path = vec![vec3(0., 100., 0.)];
    e.path_loop = "wave".into();
    e.position = e.path[0] + Vec3::Z * bus_actor::height(&e.model, e.scale);
    e.rotation = 0.;
    e.speed = 10.;
    e.actor.pose(Pose::Wave);
    let original = e.position;
    let mut rng = 1;
    bus_actor::tick(&mut e, &[], Vec3::ZERO, 0., 30., &[], &mut rng);
    assert_eq!(e.speed, 60.);
    assert_eq!(e.actor.pose, Pose::Run);
    assert_eq!(e.actor.frame("grandpa"), 28.);
    assert_eq!(e.path_loop, "hide");
    assert_eq!(e.position, original);
    for _ in 0..40 {
        bus_actor::tick(&mut e, &[], Vec3::ZERO, 0., 30., &[], &mut rng);
    }
    assert!(!e.active);
    assert!(e.position.y > original.y + 1800.);
}
#[test]
fn offscreen_walker_relocates_to_nearest_eligible_path_and_free_character() {
    let mut e = person();
    e.position.x = 5000.;
    e.actor.remaining = 6;
    let paths = vec![
        PathSpawn {
            points: vec![vec3(3400., 0., 0.), vec3(3500., 0., 0.)],
            loop_kind: "loop".into(),
        },
        PathSpawn {
            points: vec![vec3(3600., 0., 0.), vec3(3700., 0., 0.)],
            loop_kind: "pingpong".into(),
        },
        PathSpawn {
            points: vec![vec3(5000., 0., 0.), vec3(5100., 0., 0.)],
            loop_kind: "loop".into(),
        },
    ];
    bus_actor::tick(
        &mut e,
        &paths,
        Vec3::ZERO,
        0.,
        0.,
        &["gerald".into(), "helga".into()],
        &mut 9,
    );
    assert_eq!(e.base.x, 3600.);
    assert_eq!(e.model, "grandpa");
    assert_eq!(e.path_loop, "pingpong");
    assert_eq!(e.actor.remaining, 1);
    assert_eq!(e.actor.pose, Pose::Walk);
}
#[test]
fn boarding_route_ends_waving_and_character_selection_respects_reservations() {
    let mut e = person();
    e.name = "passenger".into();
    e.path = vec![Vec3::ZERO, vec3(60., 0., 0.)];
    e.path_loop = "wave".into();
    e.speed = 10.;
    let mut rng = 1;
    for _ in 0..8 {
        bus_actor::tick(&mut e, &[], Vec3::ZERO, 0., 0., &[], &mut rng);
    }
    assert_eq!(e.path.len(), 1);
    assert_eq!(e.actor.pose, Pose::Wave);
    assert!((e.position.x - 60.).abs() < 0.001);
    assert_eq!(
        bus_actor::choose_person(
            &["arnold".into(), "gerald".into(), "grandpa".into()],
            &mut rng
        ),
        Some("helga".into())
    );
}
#[test]
fn all_nine_mode_difficulty_worlds_match_source_obstacle_filters() {
    let a = assets();
    let raw = nick_rust::lingo_data::parse(&a.texts["obstaclelist1"]).unwrap();
    for mode in 0..3 {
        for difficulty in 1..=3 {
            let w = World::build(&a, Kind::Bus, difficulty, mode, 123).unwrap();
            let cfg = Settings::new(mode, difficulty).unwrap();
            let count = |shape: &str| {
                w.entities
                    .iter()
                    .filter(|e| e.active && e.shape == shape)
                    .count()
            };
            assert_eq!(
                w.entities
                    .iter()
                    .filter(|e| e.active && e.shape.starts_with("coin"))
                    .count(),
                if mode == 0 {
                    5 + 5 * difficulty as usize
                } else {
                    0
                }
            );
            assert_eq!(
                count("time"),
                if mode == 0 {
                    5 * difficulty as usize
                } else {
                    0
                }
            );
            assert_eq!(
                count("jelly"),
                usize::from(mode == 0 || mode == 2 && difficulty >= 2)
            );
            assert_eq!(
                w.entities
                    .iter()
                    .filter(|e| e.active && e.name == "path")
                    .count(),
                usize::from(mode != 1)
            );
            for shape in [
                "roadblock1",
                "roadblock2",
                "ramp1",
                "ramp2",
                "ramp3",
                "ramp4",
                "point",
                "turbo",
                "target",
            ] {
                let original = raw
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|v| v["shape"] == shape)
                    .filter(|v| match shape {
                        "roadblock1" => mode == 0 && difficulty == 1,
                        "roadblock2" => mode == 0 && difficulty == 2,
                        "point" | "turbo" => mode != 1,
                        s if s.starts_with("ramp") => {
                            mode != 1 || v["path"][0][2].as_f64().unwrap() > 1000.
                        }
                        _ => true,
                    })
                    .count();
                assert_eq!(
                    count(shape),
                    original,
                    "mode{mode} difficulty{difficulty} {shape}"
                );
            }
            for e in w
                .entities
                .iter()
                .filter(|e| e.active && e.shape.starts_with("roadblock"))
            {
                assert_eq!(e.rotation, 0.);
                assert!(
                    !w.collision
                        .is_breakable(w.entities.iter().position(|x| std::ptr::eq(e, x)).unwrap())
                );
            }
            for &i in &w.targets {
                assert!(w.entities[i].path[0].length() <= cfg.radius());
            }
            for e in w.entities.iter().filter(|e| e.shape == "target") {
                assert_eq!(
                    e.scale,
                    500. * if mode == 1 {
                        2.5 - difficulty as f32 * 0.5
                    } else {
                        1.
                    }
                );
            }
        }
    }
}
#[test]
fn original_city_curb_is_crossable_in_every_mode() {
    let a = assets();
    for mode in 0..3 {
        for difficulty in 1..=3 {
            let w = World::build(&a, Kind::Bus, difficulty, mode, 123).unwrap();
            let mut v = Vehicle::new(Kind::Bus, w.start, Params::bus(&a), difficulty);
            for _ in 0..28 {
                v.tick(
                    Input {
                        throttle: 1.,
                        ..Default::default()
                    },
                    &w.collision,
                );
                assert!(
                    v.crash_object.is_none(),
                    "mode{mode} difficulty{difficulty} unexpected contact {:?}",
                    v.crash_object
                );
            }
            assert!(v.pos.y < -950.);
            assert!(v.speed > 70.);
        }
    }
}
#[test]
fn recovery_discards_twenty_road_samples_and_uses_original_drop_height() {
    let a = assets();
    let mut v = Vehicle::new(Kind::Bus, vec3(2500., 0., 100.), Params::bus(&a), 1);
    let mut history = Recovery::default();
    for i in 0..60 {
        history.frames.push(RoadFrame {
            position: vec3(i as f32 * 30., 0., 15.),
            angles: vec3(90., 2., 3.),
            road: true,
        });
    }
    assert!(history.revive(&mut v));
    assert_eq!(history.frames.len(), 40);
    assert_eq!(v.pos, vec3(1170., 0., 1015.));
    assert_eq!(v.pitch, 2.);
    assert_eq!(v.roll, 3.);
    assert!(v.jumping);
    assert_eq!(v.jump_time, 0.);
    let mut empty = Recovery::default();
    let before = v.pos;
    assert!(!empty.revive(&mut v));
    assert_eq!(v.pos, before);
}
#[test]
fn pursuit_capture_is_ground_only_and_cruise_cannot_lose() {
    for mode in 0..3 {
        for difficulty in 1..=3 {
            let cfg = Settings::new(mode, difficulty).unwrap();
            assert!(!cfg.caught(0., true));
            assert!(!cfg.caught(30., false));
            assert_eq!(cfg.caught(29.9, false), mode != 2);
        }
    }
    assert_eq!(
        nick_rust::bus_rules::manhattan(vec3(1., 2., 900.), vec3(4., 6., 0.)),
        7.
    ); // Original helper explicitly ignores Z.
}
#[test]
fn pickup_query_selects_one_group_object_in_three_dimensions() {
    let a = assets();
    let mut w = World::build(&a, Kind::Bus, 1, 0, 123).unwrap();
    let mut pickup = w
        .entities
        .iter()
        .find(|e| e.shape == "turbo")
        .unwrap()
        .clone();
    pickup.position = vec3(350., 0., 100.);
    pickup.active = true;
    let mut scenery = w
        .entities
        .iter()
        .find(|e| e.shape == "lamp")
        .unwrap()
        .clone();
    scenery.position = vec3(200., 0., 100.);
    scenery.active = true;
    w.entities = vec![pickup.clone(), scenery];
    assert_eq!(w.nearest_bus_good(vec3(0., 0., 100.)), Some(1)); // A closer lamp masks the turbo this frame.
    w.entities[1].crash_ticks = 9;
    assert_eq!(w.nearest_bus_good(vec3(0., 0., 100.)), Some(0));
    w.entities[0].position = vec3(400., 0., 100.);
    assert_eq!(w.nearest_bus_good(vec3(0., 0., 100.)), None); // Strict <400.
    w.entities[0].position = vec3(0., 0., 501.);
    assert_eq!(w.nearest_bus_good(vec3(0., 0., 100.)), None); // Different height is out of range.
    w.entities[0].shape = "coin1".into();
    w.entities[0].position = vec3(0., 0., 100.);
    assert_eq!(w.nearest_bus_good(vec3(0., 0., 100.)), None); // Coins use their separate Manhattan check.
}
#[test]
fn concave_world_boundaries_keep_open_space_clear_in_both_windings() {
    use nick_rust::{collision::CollisionWorld, model::Face};
    // U outline: a simple fan incorrectly fills the opening at x=2,y=2.
    let vertices = vec![
        vec3(0., 0., 0.),
        vec3(4., 0., 0.),
        vec3(4., 4., 0.),
        vec3(3., 4., 0.),
        vec3(3., 1., 0.),
        vec3(1., 1., 0.),
        vec3(1., 4., 0.),
        vec3(0., 4., 0.),
    ];
    for reverse in [false, true] {
        let mut indices: Vec<_> = (0..8).collect();
        if reverse {
            indices.reverse();
        }
        let m = Model {
            vertices: vertices.clone(),
            faces: vec![Face {
                indices,
                uv: vec![Vec2::ZERO; 8],
                texture: "road".into(),
                group: 0,
            }],
            min: Vec3::ZERO,
            max: vec3(4., 4., 0.),
            animation: Default::default(),
        };
        assert_eq!(m.triangulate(&m.faces[0]).len(), 6);
        let mut world = CollisionWorld::new(10.);
        world.add(&m, Mat4::IDENTITY, 0);
        assert!(
            world
                .segment(vec3(2., 2., 10.), vec3(2., 2., -10.))
                .is_none()
        );
        for (x, y) in [(0.5, 2.), (3.5, 2.), (2., 0.5)] {
            assert!(world.segment(vec3(x, y, 10.), vec3(x, y, -10.)).is_some());
        }
    }
}
#[test]
fn original_city_polygon_triangulations_preserve_boundary_area() {
    let a = assets();
    for (name, m) in a.models.iter().filter(|(n, _)| n.starts_with("city")) {
        for (i, f) in m.faces.iter().enumerate() {
            let tri = m.triangulate(f);
            assert!(!tri.is_empty(), "{name} face{i} cannot triangulate");
            let origin = m.vertices[f.indices[0]];
            let boundary: Vec3 = (1..f.indices.len() - 1)
                .map(|j| {
                    (m.vertices[f.indices[j]] - origin).cross(m.vertices[f.indices[j + 1]] - origin)
                })
                .sum();
            let normal = boundary.normalize_or_zero();
            let expected = boundary.length();
            let area: f32 = tri
                .into_iter()
                .map(|[ia, ib, ic]| {
                    let p = m.vertices[f.indices[ia]];
                    let q = m.vertices[f.indices[ib]];
                    let r = m.vertices[f.indices[ic]];
                    (q - p).cross(r - p).dot(normal).abs()
                })
                .sum();
            assert!(
                (area - expected).abs() <= expected * 0.0001 + 0.05,
                "{name} face{i}: triangles {area}, polygon {expected}"
            );
        }
    }
}
#[test]
fn mission_clocks_bonuses_and_destination_exclusion_match_recovered_rules() {
    use nick_rust::bus_mission::*;
    assert_eq!(time_limit(90000., 1, 1), 180.);
    assert_eq!(time_limit(90000., 1, 2), 180.);
    assert_eq!(time_limit(12345., 1, 3), 57.); // round(29.628)=30, then -3.
    assert_eq!(time_limit(12345., 2, 3), 42.);
    assert_eq!(time_limit(12345., 3, 3), 37.);
    assert_eq!(target_bonus(12.6, 0, 1, 3), 1000);
    assert_eq!(target_bonus(12.6, 1, 1, 4), 1300);
    assert_eq!(target_bonus(12.6, 1, 3, 4), 3900);
    assert_eq!(target_bonus(12.6, 2, 3, 4), 1000);
    assert_eq!(time_bonus(12.6, 3), 3900);
    for seed in 1..100 {
        assert_ne!(destination(&[2, 4, 8], 4, &mut { seed }), Some(4));
    }
    assert_eq!(destination(&[4], 4, &mut 1), None);
    assert!(arrival(7, Some(7), 0.));
    assert!(!arrival(7, Some(7), 0.01));
    assert!(!arrival(7, Some(8), 0.));
}
#[test]
fn boarding_and_exit_paths_match_original_bus_coordinates() {
    use nick_rust::bus_mission::passenger_route;
    let board = passenger_route(vec3(1000., 2000., 100.), 0., 0., 0., false);
    assert_eq!(
        board,
        vec![
            vec3(700., 1780., 0.),
            vec3(900., 1780., 0.),
            vec3(1000., 1780., 75.),
            vec3(1000., 2150., 75.)
        ]
    );
    let exit = passenger_route(vec3(1000., 2000., 100.), 0., 0., 0., true);
    assert_eq!(exit.len(), 5);
    assert_eq!(exit[0], vec3(1000., 2050., 75.));
    assert_eq!(exit[4], vec3(740., 1680., 0.));
    let turned = passenger_route(vec3(1000., 2000., 100.), 90., 0., 0., false);
    assert!(turned[0].distance(vec3(1220., 1700., 0.)) < 0.001);
}
#[test]
fn ending_bus_ignores_player_throttle_and_uses_source_stop_threshold() {
    let a = assets();
    let w = World::build(&a, Kind::Bus, 1, 0, 123).unwrap();
    let mut bus = Vehicle::new(Kind::Bus, w.start, Params::bus(&a), 1);
    bus.ending = true;
    bus.velocity = vec2(-10., -10.);
    bus.speed = 14.14;
    let before = bus.pos;
    bus.tick(
        Input {
            throttle: 1.,
            steer: 1.,
            ..Default::default()
        },
        &w.collision,
    );
    assert_eq!(bus.speed, 0.);
    assert_eq!(bus.pos, before);
}
#[test]
fn arnolds_original_driver_pose_keeps_head_above_torso_and_arms_forward() {
    let a = assets();
    let m = a.model("arnold").unwrap();
    let bones = m.animation.matrices(2.);
    let bounds = |group: usize| {
        let mut low = Vec3::splat(f32::INFINITY);
        let mut high = Vec3::splat(f32::NEG_INFINITY);
        for f in m.faces.iter().filter(|f| f.group == group) {
            for &i in &f.indices {
                let p = bones[group].transform_point3(m.vertices[i]);
                low = low.min(p);
                high = high.max(p);
            }
        }
        (low, high)
    };
    let (head_low, head_high) = bounds(18);
    let (_, torso_high) = bounds(9);
    let (_, left_hand_high) = bounds(12);
    let (_, right_hand_high) = bounds(15);
    assert!(head_low.z > torso_high.z);
    assert!(head_high.z > 90.);
    assert!(head_low.z > left_hand_high.z);
    assert!(head_low.z > right_hand_high.z);
    assert!(left_hand_high.y < -40. && right_hand_high.y < -40.); // Both hands face the wheel, along -Y.
    let (left_leg_low, _) = bounds(1);
    let (right_leg_low, _) = bounds(5);
    assert!(left_leg_low.y < -20. && right_leg_low.y < -20.);
}
#[test]
fn hud_uses_original_clock_ticks_spacing_and_portrait_coordinates() {
    use nick_rust::bus_hud::*;
    assert_eq!(CLOCK_X, [480., 492., 504., 522., 534., 546., 564.]);
    assert_eq!(clock(180.), "3:00:00");
    assert_eq!(clock(65.5), "1:05:30");
    assert_eq!(clock(-1.), "0:00:00");
    assert_eq!(clock(1.999), "0:02:00");
    assert_eq!(DRIVER, vec2(40., 290.));
    assert_eq!(PASSENGER, vec2(110., 290.));
    assert_eq!(SPEED, vec2(530., 295.));
    assert_eq!(MPH, vec2(580., 298.));
    let p = compass_position(Vec3::ZERO, vec3(0., -1., 0.));
    assert!(p.distance(vec3(0., -50., 20.)) < 0.001);
}
#[test]
fn original_center_messages_wrap_by_character_count_and_use_original_text() {
    use nick_rust::bus_hud::message_lines;
    let lines =
        message_lines("Avoid the bulldozers and collect all the tomatoes before time runs out!");
    assert_eq!(
        lines,
        vec![
            "Avoid the bulldozers and",
            "collect all the tomatoes",
            "before time runs out!"
        ]
    );
    assert!(message_lines("Ready!").len() == 1);
}
