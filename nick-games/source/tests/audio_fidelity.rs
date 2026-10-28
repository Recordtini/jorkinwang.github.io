use nick_rust::{
    assets::{Manifest, Pack},
    audio::{Channel, Command, Mixer, bus_engine, dozer_gain},
};
use std::collections::HashMap;
fn loops() -> HashMap<String, bool> {
    let p = Pack::open();
    let m: Manifest = serde_json::from_slice(p.get("runaway-bus/manifest.json").unwrap()).unwrap();
    m.sounds.into_iter().map(|(n, s)| (n, s.looped)).collect()
}
#[test]
fn original_sound_metadata_distinguishes_one_shot_endings_from_music_loops() {
    let l = loops();
    for n in [
        "win.aif",
        "lose.aif",
        "coin.aif",
        "crash1.aif",
        "ready.aif",
        "click.aif",
        "rev.aif",
        "stop.aif",
    ] {
        assert_eq!(l.get(n), Some(&false), "{n}");
    }
    for n in [
        "gamemusic.aif",
        "turbo.aif",
        "idle.aif",
        "engine1.aif",
        "engine5.aif",
        "bulldozer.aif",
        "skid.aif",
    ] {
        assert_eq!(l.get(n), Some(&true), "{n}");
    }
}
#[test]
fn victory_replaces_background_loop_once_and_cannot_restart_after_finish() {
    let l = loops();
    let mut m = Mixer::default();
    assert!(
        m.music("gamemusic.aif", &l, 1.)
            .iter()
            .any(|c| matches!(c, Command::Play { looped: true, .. }))
    );
    let win = m.music("win.aif", &l, 1.);
    assert_eq!(win[0], Command::Stop("gamemusic.aif".into()));
    assert!(
        win.iter()
            .any(|c| matches!(c,Command::Play{name,looped:false,..}if name=="win.aif"))
    );
    for _ in 0..90 {
        assert!(m.refresh_music("win.aif", &l, 1., true).is_empty());
    }
    assert_eq!(
        m.refresh_music("win.aif", &l, 1., false),
        vec![Command::Stop("win.aif".into())]
    );
    for _ in 0..90 {
        assert!(m.refresh_music("win.aif", &l, 1., false).is_empty());
        assert!(m.refresh_music("win.aif", &l, 1., true).is_empty());
    }
}
#[test]
fn engine_skid_and_dozer_stop_at_pause_and_resume_without_duplicate_playback() {
    let mut m = Mixer::default();
    for (channel, name) in [
        (Channel::Hero, "engine3.aif"),
        (Channel::HeroEffect, "skid.aif"),
        (Channel::Dozer, "bulldozer.aif"),
    ] {
        assert!(matches!(
            m.set(channel, name, true, 0.4, false)[0],
            Command::Play { .. }
        ));
        assert!(m.set(channel, name, true, 0.4, false).is_empty());
    }
    let stopped = m.stop_gameplay();
    assert_eq!(stopped.len(), 3);
    assert!(stopped.contains(&Command::Stop("engine3.aif".into())));
    assert!(stopped.contains(&Command::Stop("skid.aif".into())));
    assert!(stopped.contains(&Command::Stop("bulldozer.aif".into())));
    assert!(m.stop_gameplay().is_empty());
    assert!(matches!(
        m.set(Channel::Hero, "engine3.aif", true, 0.4, false)[0],
        Command::Play { .. }
    ));
}
#[test]
fn same_channel_effects_replace_each_other_and_volume_changes_do_not_replay() {
    let mut m = Mixer::default();
    m.set(Channel::Effect, "crash1.aif", false, 1., true);
    let next = m.set(Channel::Effect, "bonus.aif", false, 0.5, true);
    assert_eq!(next[0], Command::Stop("crash1.aif".into()));
    assert!(matches!(&next[1],Command::Play{name,..}if name=="bonus.aif"));
    assert_eq!(
        m.set(Channel::Effect, "bonus.aif", false, 0.2, false),
        vec![Command::Gain {
            name: "bonus.aif".into(),
            gain: 0.2
        }]
    );
}
#[test]
fn source_engine_rounding_and_dozer_distance_falloff_are_preserved() {
    assert_eq!(bus_engine(0.), "idle.aif");
    assert_eq!(bus_engine(29.9), "engine1.aif");
    assert_eq!(bus_engine(30.), "engine2.aif");
    assert_eq!(bus_engine(50.), "engine3.aif");
    assert_eq!(bus_engine(200.), "engine5.aif");
    assert_eq!(dozer_gain(0.), 1.);
    assert_eq!(dozer_gain(6000.), 0.);
}
