use crate::{
    assets::Assets,
    physics::{Input, Kind, Params, Vehicle},
    platform,
    renderer::Renderer,
    world::World,
};
use macroquad::{
    audio::{PlaySoundParams, play_sound, set_sound_volume, stop_sound},
    prelude::*,
};
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    Title,
    Mode,
    Players,
    Difficulty,
    Driver,
    Instructions,
    Scores,
    Ready,
    Playing,
    Paused,
    Options,
    Finished,
    Replay,
    Target,
    ScoreEntry,
    Quit,
    ClearScores,
    Ending,
    Instructs,
}
#[derive(Clone)]
pub struct Player {
    pub name: String,
    pub difficulty: u8,
    pub score: i32,
    pub done: bool,
}
#[derive(Clone)]
pub struct ActorFrame {
    pub racer: crate::hover_race::Racer,
    pub index: usize,
    pub pos: Vec3,
    pub yaw: f32,
    pub lap: u32,
    pub tilt: f32,
}
#[derive(Clone)]
pub struct Frame {
    pub surface: String,
    pub bounce: crate::hover_drive::Bounce,
    pub boost: bool,
    pub hover_track: crate::hover_race::TrackPosition,
    pub hover_actor: crate::hover_actor::Actor,
    pub pos: Vec3,
    pub yaw: f32,
    pub pitch: f32,
    pub roll: f32,
    pub speed: f32,
    pub jumping: bool,
    pub actors: Vec<ActorFrame>,
    pub active: Vec<u64>,
    pub score: i32,
    pub collected: usize,
    pub clock: f32,
    pub elapsed: f32,
    pub lap: u32,
    pub checkpoint: usize,
    pub target: usize,
    pub carrying: bool,
    pub best_lap: f32,
}
pub struct Game {
    pub assets: Assets,
    pub world: World,
    pub vehicle: Vehicle,
    pub renderer: Renderer,
    pub screen: Screen,
    pub previous_screen: Screen,
    pub options_return: Screen,
    pub options_tab: u8,
    pub options_selection: usize,
    pub last_audio_screen: Screen,
    pub mode: u8,
    pub difficulty: u8,
    pub driver: usize,
    pub player_count: usize,
    pub player_index: usize,
    pub players: Vec<Player>,
    pub score: i32,
    pub collected: usize,
    pub clock: f32,
    pub elapsed: f32,
    pub countdown: f32,
    pub message: String,
    pub message_timer: f32,
    pub mini_message: String,
    pub mini_message_timer: f32,
    pub won: bool,
    pub volume: f32,
    pub muted: bool,
    pub effects_volume: f32,
    pub music_volume: f32,
    pub mixer: std::cell::RefCell<crate::audio::Mixer>,
    pub relaxed_opponents: bool,
    pub unlimited_time: bool,
    pub practice_used: bool,
    pub music_enabled: bool,
    pub fps: bool,
    pub minimap: bool,
    pub best: i32,
    pub target: usize,
    pub carrying: bool,
    pub passenger: usize,
    pub deliveries: usize,
    pub target_step: usize,
    pub target_bonus: i32,
    pub lap: u32,
    pub checkpoint: usize,
    pub max_checkpoint: usize,
    pub lap_times: Vec<f32>,
    pub best_lap: f32,
    pub slow: i32,
    pub hit_cooldown: i32,
    pub trace: std::collections::VecDeque<Frame>,
    pub replay_index: usize,
    pub replay_end: Option<Frame>,
    pub recovery: crate::bus_rules::Recovery,
    pub safe_pos: Vec3,
    pub safe_yaw: f32,
    pub accumulator: f32,
    pub active_music: String,
    pub engine: String,
    pub skidding: bool,
    pub ui_selection: usize,
    pub show_help_page: usize,
    pub original_words: serde_json::Value,
    pub score_name: String,
    pub score_page: usize,
    pub demo_phase: f32,
    pub seed: u64,
    pub clock_ticks: u64,
    pub camera_accumulator: f32,
}
impl Game {
    pub async fn load(kind: Kind) -> Result<Self, String> {
        let name = if kind == Kind::Bus {
            "runaway-bus"
        } else {
            "stupor-highway"
        };
        let assets = Assets::load(name).await?;
        let initial_difficulty = if kind == Kind::Bus { 1 } else { 3 };
        let world = World::build(&assets, kind, initial_difficulty, 0, 1793130001)?;
        let params = if kind == Kind::Bus {
            Params::bus(&assets)
        } else {
            Params::hover()
        };
        let vehicle = Vehicle::new(kind, world.start, params, initial_difficulty);
        let mut renderer = Renderer::new(&assets)?;
        renderer.reset_camera(&vehicle);
        renderer.smooth = platform::get(10) != 2.;
        renderer.filtering = platform::get(11) == 1.;
        renderer.widescreen = platform::get(12) == 1.;
        renderer.camera_mode = (platform::get(20) as u8).min(if kind == Kind::Bus { 2 } else { 3 });
        if kind == Kind::Hover
            && let Some(rig) = &mut renderer.hover_camera
        {
            rig.replay_points(&world.track, &mut 1793130001);
        }
        let original_words = assets
            .texts
            .get(if kind == Kind::Bus {
                "defaulttext"
            } else {
                "gametextnickfop"
            })
            .map(|text| crate::lingo_data::parse(text))
            .transpose()?
            .unwrap_or_default();
        let mut game = Self {
            assets,
            world,
            vehicle,
            renderer,
            screen: Screen::Title,
            previous_screen: Screen::Title,
            options_return: Screen::Title,
            options_tab: 0,
            options_selection: 0,
            last_audio_screen: Screen::Title,
            mode: 0,
            difficulty: initial_difficulty,
            driver: 0,
            player_count: 1,
            player_index: 0,
            players: vec![],
            score: 0,
            collected: 0,
            clock: 180.,
            elapsed: 0.,
            countdown: 2.,
            message: String::new(),
            message_timer: 0.,
            mini_message: String::new(),
            mini_message_timer: 0.,
            won: false,
            volume: if platform::get(13) == 0. {
                0.7
            } else {
                (platform::get(13) - 1.) as f32
            },
            muted: platform::get(14) == 1.,
            effects_volume: if platform::get(17) == 0. {
                1.
            } else {
                (platform::get(17) - 1.) as f32
            },
            music_volume: if platform::get(18) == 0. {
                1.
            } else {
                (platform::get(18) - 1.) as f32
            },
            mixer: Default::default(),
            relaxed_opponents: kind == Kind::Hover && platform::get(22) == 1.,
            unlimited_time: platform::get(16) == 1.,
            practice_used: false,
            music_enabled: platform::get(15) != 2.,
            fps: platform::get(21) == 1.,
            minimap: platform::get(19) == 1.,
            best: platform::get(if kind == Kind::Bus { 100 } else { 101 }) as i32,
            target: 0,
            carrying: false,
            passenger: 1,
            deliveries: 0,
            target_step: 0,
            target_bonus: 0,
            lap: 1,
            checkpoint: 0,
            max_checkpoint: 0,
            lap_times: Vec::new(),
            best_lap: 0.,
            slow: 0,
            hit_cooldown: 0,
            trace: std::collections::VecDeque::new(),
            replay_index: 0,
            replay_end: None,
            recovery: Default::default(),
            safe_pos: Vec3::ZERO,
            safe_yaw: 0.,
            accumulator: 0.,
            active_music: String::new(),
            engine: String::new(),
            skidding: false,
            ui_selection: 0,
            show_help_page: 0,
            original_words,
            score_name: crate::scores::last_name(),
            score_page: 0,
            demo_phase: 0.,
            seed: 1793130001,
            clock_ticks: 0,
            camera_accumulator: 0.,
        };
        game.music("titlemusic.aif");
        Ok(game)
    }
    pub fn kind(&self) -> Kind {
        self.vehicle.kind
    }
    pub fn score_key(&self) -> i32 {
        200 + if self.kind() == Kind::Hover { 10 } else { 0 }
            + self.mode as i32 * 3
            + self.difficulty as i32
            - 1
    }
    pub fn tick_rate(&self) -> f32 {
        if self.kind() == Kind::Bus { 30. } else { 20. }
    }
    pub fn start(&mut self) -> Result<(), String> {
        let kind = self.kind();
        self.seed = self.seed.wrapping_add(0x9e3779b97f4a7c15);
        self.practice_used = self.unlimited_time || self.relaxed_opponents;
        self.world = World::build(&self.assets, kind, self.difficulty, self.mode, self.seed)?;
        if self.relaxed_opponents {
            self.world.set_opponent_pace(0.75);
        }
        let params = if kind == Kind::Bus {
            Params::bus(&self.assets)
        } else {
            Params::hover()
        };
        self.vehicle = Vehicle::new(kind, self.world.start, params, self.difficulty);
        self.renderer.driver = ["arnold", "helga", "gerald", "grandpa"][self.driver].into();
        if kind == Kind::Bus {
            for e in &mut self.world.entities {
                if e.active
                    && e.name == "path"
                    && let Some(name) = crate::bus_actor::choose_person(
                        std::slice::from_ref(&self.renderer.driver),
                        &mut self.seed,
                    )
                {
                    e.model = name;
                    e.position = e.path[0] + Vec3::Z * crate::bus_actor::height(&e.model, e.scale);
                    e.previous = e.position;
                }
            }
        }
        self.safe_pos = self.vehicle.pos;
        self.safe_yaw = self.vehicle.yaw;
        self.renderer.reset_camera(&self.vehicle);
        if kind == Kind::Hover
            && let Some(rig) = &mut self.renderer.hover_camera
        {
            rig.replay_points(&self.world.track, &mut self.seed);
        }
        self.screen = Screen::Instructs;
        self.countdown = 10.;
        if kind == Kind::Bus {
            self.renderer.dropoff_camera(&self.vehicle);
        }
        self.score = 0;
        self.best = platform::get(self.score_key()) as i32;
        self.collected = 0;
        self.elapsed = 0.;
        self.clock = if kind == Kind::Bus {
            crate::bus_rules::Settings::new(self.mode, self.difficulty)?.start_clock()
        } else {
            0.
        };
        self.lap = 1;
        self.checkpoint = 0;
        self.max_checkpoint = 0;
        self.lap_times.clear();
        self.best_lap = 0.;
        self.slow = 0;
        self.hit_cooldown = 0;
        self.trace.clear();
        self.recovery.frames.clear();
        self.replay_end = None;
        self.message = if kind == Kind::Hover {
            match self.mode {
                1 => format!(
                    "Collect {} envelopes before any of the other racers finish!",
                    [0, 5, 10, 15][self.difficulty as usize]
                ),
                2 => "Complete the circuit as fast as you can!".into(),
                _ => "Beat the other racers to the finish!".into(),
            }
        } else {
            String::new()
        };
        self.message_timer = if kind == Kind::Hover { 20. } else { 0. };
        self.mini_message.clear();
        self.mini_message_timer = 0.;
        self.carrying = false;
        self.deliveries = 0;
        self.target_step = 0;
        self.target = self
            .world
            .entities
            .iter()
            .position(|e| e.name == "Arnold's Apartment")
            .unwrap_or(usize::MAX);
        self.won = false;
        self.accumulator = 0.;
        self.camera_accumulator = 0.;
        self.clock_ticks = 0;
        self.music("");
        if kind == Kind::Bus && self.mode == 0 {
            self.message = self.original_words["levelmessage"]
                .as_str()
                .unwrap_or("")
                .into();
            if self.player_count > 1 {
                self.message = format!("PLAYER {}: {}", self.player_index + 1, self.message);
            }
            self.message_timer = 20.;
        }
        if kind == Kind::Bus && self.mode != 0 {
            self.passenger = (self.driver + 1) % 4;
            self.next_target();
        }
        Ok(())
    }
    pub fn next_target(&mut self) {
        let valid = self.world.targets.clone();
        if valid.is_empty() {
            return;
        }
        let Some(next) = crate::bus_mission::destination(&valid, self.target, &mut self.seed)
        else {
            return;
        };
        self.target = next;
        self.target_step += 1;
        self.target_bonus = crate::bus_mission::target_bonus(
            self.clock,
            self.mode,
            self.difficulty,
            self.target_step,
        );
        self.world.selected_target = Some(self.target);
        let distance = self.world.entities[self.target]
            .position
            .distance(self.vehicle.pos);
        if !self.carrying {
            let names = ["arnold", "helga", "gerald", "grandpa"];
            let mut occupied = vec![names[self.driver].to_string()];
            occupied.extend(
                self.world
                    .entities
                    .iter()
                    .filter(|e| e.active && e.name == "path")
                    .map(|e| e.model.clone()),
            );
            if self.target_step > 1 {
                occupied.push(names[self.passenger].to_string());
            }
            if let Some(name) = crate::bus_actor::choose_person(&occupied, &mut self.seed) {
                self.passenger = names.iter().position(|n| *n == name).unwrap();
            }
            let mut passenger = self.world.entities[self.target].clone();
            passenger.shape = names[self.passenger].into();
            passenger.model = passenger.shape.clone();
            passenger.name = "passenger".into();
            passenger.path = passenger.path.iter().map(|p| *p + Vec3::Z * 15.).collect();
            passenger.path_index = 0;
            passenger.path_direction = 1;
            passenger.path_loop = "wave".into();
            passenger.scale = 70.;
            passenger.speed = 10.;
            passenger.actor = Default::default();
            passenger.actor.pose(crate::bus_actor::Pose::Wave);
            passenger.position = passenger.path[0]
                + Vec3::Z * crate::bus_actor::height(&passenger.model, passenger.scale);
            passenger.previous = passenger.position;
            passenger.active = true;
            passenger.solid = false;
            self.world.passenger = Some(passenger);
        } else if let Some(e) = &mut self.world.passenger {
            e.active = false; // The visible boarding copy is in transitions until Continue.
        }
        self.clock = crate::bus_mission::time_limit(distance, self.difficulty, self.target_step);
        self.message.clear();
        self.message_timer = 0.;
        self.mini_message.clear();
        self.mini_message_timer = 0.;
        self.screen = Screen::Target;
        self.renderer.dropoff_camera(&self.vehicle);
        self.audio_update();
    }
    fn apply_audio(&self, commands: Vec<crate::audio::Command>) {
        for command in commands {
            use crate::audio::Command;
            match command {
                Command::Play { name, looped, gain } => {
                    if let Some(s) = self.assets.sounds.get(&name) {
                        play_sound(
                            s,
                            PlaySoundParams {
                                looped,
                                volume: gain,
                            },
                        );
                    }
                }
                Command::Stop(name) => {
                    if let Some(s) = self.assets.sounds.get(&name) {
                        stop_sound(s);
                    }
                }
                Command::Gain { name, gain } => {
                    if let Some(s) = self.assets.sounds.get(&name) {
                        set_sound_volume(s, gain);
                    }
                }
            }
        }
    }
    pub fn sound(&self, name: &str) {
        if self.muted {
            return;
        }
        let channel = if matches!(
            name,
            "click.aif" | "rollover.aif" | "baddielaugh.aif" | "win.aif" | "lose.aif"
        ) {
            crate::audio::Channel::Voice
        } else if self.kind() == Kind::Hover
            && matches!(name, "jump.aif" | "hoverland.aif" | "hovercrash.aif")
        {
            crate::audio::Channel::HeroEffect
        } else {
            crate::audio::Channel::Effect
        };
        let commands = self.mixer.borrow_mut().set(
            channel,
            name,
            self.assets.sound_loops.get(name).copied().unwrap_or(false),
            self.volume
                * self.effects_volume
                * if channel == crate::audio::Channel::HeroEffect {
                    crate::audio::hover_gain(crate::hover_race::manhattan(
                        self.vehicle.pos,
                        self.renderer.camera_position,
                    ))
                } else {
                    1.
                },
            true,
        );
        self.apply_audio(commands);
    }
    pub fn music(&mut self, name: &str) {
        let name = if name == "titlemusic.aif" && self.kind() == Kind::Bus {
            "gamemusic.aif"
        } else {
            name
        };
        self.active_music = name.into();
        let gain = if self.music_enabled && !self.muted {
            self.volume * self.music_volume
        } else {
            0.
        };
        let commands = if self.music_enabled && !self.muted {
            self.mixer
                .borrow_mut()
                .music(name, &self.assets.sound_loops, gain)
        } else {
            self.mixer.borrow_mut().stop(crate::audio::Channel::Music)
        };
        self.apply_audio(commands);
    }
    pub fn audio_update(&mut self) {
        use crate::audio::Channel;
        let gameplay = matches!(
            self.screen,
            Screen::Playing | Screen::Replay | Screen::Ending
        );
        let music_allowed = self.music_enabled
            && !self.muted
            && !matches!(
                self.screen,
                Screen::Paused
                    | Screen::Finished
                    | Screen::ScoreEntry
                    | Screen::Instructions
                    | Screen::Scores
                    | Screen::ClearScores
            );
        let mut commands = Vec::new();
        {
            let mut mixer = self.mixer.borrow_mut();
            if !gameplay {
                commands.extend(mixer.stop_gameplay());
                self.engine.clear();
                self.skidding = false;
            }
            commands.extend(mixer.refresh_music(
                &self.active_music,
                &self.assets.sound_loops,
                self.volume * self.music_volume,
                music_allowed,
            ));
        }
        let effect_gain = if self.muted {
            0.
        } else {
            self.volume * self.effects_volume
        };
        {
            let mut mixer = self.mixer.borrow_mut();
            commands.extend(mixer.gain(Channel::Effect, effect_gain));
            commands.extend(mixer.gain(Channel::Voice, effect_gain));
        }
        if self.last_audio_screen != self.screen
            && matches!(
                self.screen,
                Screen::Paused
                    | Screen::Options
                    | Screen::Finished
                    | Screen::Instructions
                    | Screen::Scores
            )
        {
            let mut mixer = self.mixer.borrow_mut();
            commands.extend(mixer.stop(Channel::Effect));
            commands.extend(mixer.stop(Channel::Voice));
        }
        self.last_audio_screen = self.screen;
        self.apply_audio(commands);
    }
    fn engine_update(&mut self) {
        use crate::audio::Channel;
        let bus = self.kind() == Kind::Bus;
        let engine = if bus {
            crate::audio::bus_engine(self.vehicle.speed)
        } else {
            crate::audio::hover_engine(self.vehicle.speed, self.vehicle.turbo).into()
        };
        let gain = if self.muted {
            0.
        } else {
            self.volume * self.effects_volume
        };
        let mut commands = Vec::new();
        {
            let mut mixer = self.mixer.borrow_mut();
            let hero_gain = gain
                * if bus {
                    100. / 255.
                } else {
                    crate::audio::hover_gain(crate::hover_race::manhattan(
                        self.vehicle.pos,
                        self.renderer.camera_position,
                    ))
                };
            commands.extend(mixer.set(Channel::Hero, &engine, true, hero_gain, false));
            self.engine = engine;
            let hero_effect = if bus && self.vehicle.speed == 0. && self.vehicle.acceleration.x > 0.
            {
                "rev.aif"
            } else if bus && self.vehicle.speed == 0. {
                "stop.aif"
            } else if bus && self.vehicle.speed > 10. && self.vehicle.roll.abs() > 10. {
                "skid.aif"
            } else {
                ""
            };
            if bus {
                commands.extend(
                    mixer.set(
                        Channel::HeroEffect,
                        hero_effect,
                        self.assets
                            .sound_loops
                            .get(hero_effect)
                            .copied()
                            .unwrap_or(false),
                        gain * 100. / 255.,
                        false,
                    ),
                );
            } else {
                commands.extend(mixer.gain(Channel::HeroEffect, hero_gain));
            }
            self.skidding = hero_effect == "skid.aif";
            let dozer = self
                .world
                .entities
                .iter()
                .find(|e| e.active && e.shape == "jelly");
            if bus
                && self.screen == Screen::Playing
                && let Some(e) = dozer
            {
                let distance = crate::bus_rules::manhattan(e.position, self.vehicle.pos);
                commands.extend(mixer.set(
                    Channel::Dozer,
                    "bulldozer.aif",
                    true,
                    gain * crate::audio::dozer_gain(distance),
                    false,
                ));
            } else {
                commands.extend(mixer.stop(Channel::Dozer));
            }
        }
        self.apply_audio(commands);
        if bus && self.vehicle.turbo > 0 && self.active_music == "gamemusic.aif" {
            self.music("turbo.aif");
        }
        if bus && self.vehicle.turbo == 0 && self.active_music == "turbo.aif" {
            self.music("gamemusic.aif");
        }
    }
    pub fn close_options(&mut self) {
        self.screen = self.options_return;
        self.ui_selection = self.options_selection;
        self.audio_update();
    }
    pub fn toggle_opponent_pace(&mut self) {
        if self.kind() != Kind::Hover {
            return;
        }
        self.relaxed_opponents = !self.relaxed_opponents;
        self.world
            .set_opponent_pace(if self.relaxed_opponents { 0.75 } else { 1. });
        platform::set(22, self.relaxed_opponents as u8 as f64);
        if self.relaxed_opponents {
            self.practice_used = true;
        }
    }
    pub fn reset_options(&mut self) {
        self.renderer.smooth = false;
        self.renderer.filtering = false;
        self.renderer.widescreen = false;
        self.renderer.camera_mode = 0;
        self.relaxed_opponents = false;
        self.world.set_opponent_pace(1.);
        platform::set(22, 0.);
        self.unlimited_time = false;
        self.minimap = false;
        self.fps = false;
        self.volume = 0.7;
        self.effects_volume = 1.;
        self.music_volume = 1.;
        self.music_enabled = true;
        self.muted = false;
        for (key, value) in [
            (10, 2.),
            (11, 0.),
            (12, 0.),
            (13, 1.7),
            (14, 0.),
            (15, 1.),
            (16, 0.),
            (17, 2.),
            (18, 2.),
            (19, 0.),
            (20, 0.),
            (21, 0.),
        ] {
            platform::set(key, value);
        }
        self.audio_update();
    }
    pub fn backup(&mut self) {
        if self.kind() == Kind::Bus {
            if self.recovery.revive(&mut self.vehicle) {
                self.renderer.recovery_camera(&self.vehicle);
            }
            return;
        }
        let mut roads = 0;
        let found = self.trace.iter().enumerate().rev().find_map(|(i, f)| {
            if ["track", "dirt", "road", "TK", "platform"]
                .iter()
                .any(|s| f.surface.contains(s))
            {
                roads += 1;
                if (roads > 20 || i < 9)
                    && (crate::hover_race::manhattan(self.vehicle.pos, f.pos) > 2000. || i < 9)
                {
                    return Some(f.clone());
                }
            }
            None
        });
        if let Some(f) = found {
            self.vehicle.pos = vec3(
                f.pos.x.round(),
                f.pos.y.round(),
                (f.pos.z + f.bounce.offset - self.vehicle.height).round()
                    + self.vehicle.height
                    + 1000.,
            );
            self.vehicle.previous = self.vehicle.pos;
            self.vehicle.yaw = f.yaw.round();
            self.vehicle.previous_yaw = self.vehicle.yaw;
            self.vehicle.pitch = f.pitch.round();
            self.vehicle.roll = f.roll.round();
            self.vehicle.velocity = Vec2::ZERO;
            self.vehicle.speed = 0.;
            self.vehicle.angular_velocity = 0.;
            self.vehicle.surface = "none".into();
            self.vehicle.jumping = true;
            self.vehicle.grounded = false;
            self.vehicle.jump_time = self.vehicle.params.dt;
            self.vehicle.jump_start = self.vehicle.pos.z;
            self.vehicle.jump_initial_speed = -100.;
        }
    }
    pub fn finish(&mut self, won: bool, message: &str) {
        self.won = won;
        self.message = message.into();
        self.message_timer = if won && self.kind() == Kind::Bus {
            0.
        } else {
            1000.
        };
        if self.kind() == Kind::Bus && !self.vehicle.ending {
            self.vehicle.ending = true;
            self.screen = Screen::Ending;
            self.countdown = 3.;
            self.music(if won { "win.aif" } else { "lose.aif" });
            self.audio_update();
            return;
        }
        self.screen = Screen::Finished;
        if self.kind() == Kind::Bus {
            self.message_timer = 0.;
        }
        if won && self.kind() == Kind::Bus && self.mode == 0 {
            self.score += crate::bus_mission::time_bonus(self.clock, self.difficulty)
        }
        if !self.practice_used {
            self.best = self.best.max(self.score);
            platform::set(self.score_key(), self.best as f64);
        }
        if self.kind() == Kind::Hover && won && !self.practice_used {
            if self.mode == 1 {
                self.best_lap = self.elapsed;
            }
            let key = self.score_key() + 200;
            let old = platform::get(key);
            if self.best_lap > 0. && (old == 0. || (self.best_lap as f64) < old) {
                platform::set(key, self.best_lap as f64);
            }
        }
        if let Some(p) = self.players.get_mut(self.player_index) {
            p.score = self.score;
            p.done = true
        }
        self.replay_end = Some(self.capture_frame());
        if self.kind() == Kind::Hover {
            self.vehicle.ending = true;
            self.vehicle.hover_actor.end(won);
            self.countdown = 2.;
            self.music("");
            self.audio_update();
            self.sound(if won { "win.aif" } else { "lose.aif" });
        } else {
            self.music(if won { "win.aif" } else { "lose.aif" });
            self.audio_update();
        }
    }
    pub fn update(&mut self) {
        if is_key_pressed(KeyCode::F11) {
            platform::fullscreen()
        }
        if is_key_pressed(KeyCode::F1) || platform::input(9) > 0.5 {
            if self.screen == Screen::Options {
                self.close_options();
            } else {
                self.options_selection = self.ui_selection;
                self.options_return = self.screen;
                self.screen = Screen::Options
            }
            self.audio_update()
        }
        let mobile_option = platform::input(10) as u32;
        if mobile_option > 0 && self.screen == Screen::Options {
            crate::options_ui::browser_action(self, mobile_option);
        }
        if self.screen == Screen::ScoreEntry {
            if is_key_pressed(KeyCode::Escape) {
                self.screen = Screen::Finished;
            }
            return;
        }
        if is_key_pressed(KeyCode::M) {
            self.music_enabled = !self.music_enabled;
            platform::set(15, if self.music_enabled { 1. } else { 2. });
            let track = self.active_music.clone();
            self.active_music.clear();
            self.music(&track);
            self.audio_update()
        }
        if is_key_pressed(KeyCode::C) || platform::input(8) > 0.5 {
            self.renderer.camera_mode =
                (self.renderer.camera_mode + 1) % if self.kind() == Kind::Bus { 3 } else { 4 }
        }
        if is_key_pressed(KeyCode::Tab) {
            self.minimap = !self.minimap
        }
        if is_key_pressed(KeyCode::Escape) || is_key_pressed(KeyCode::P) || platform::input(4) > 0.5
        {
            match self.screen {
                Screen::Playing
                | Screen::Ready
                | Screen::Replay
                | Screen::Ending
                | Screen::Instructs => {
                    self.previous_screen = self.screen;
                    self.screen = Screen::Paused;
                    if self.kind() == Kind::Bus {
                        self.message_timer = 0.;
                        self.mini_message_timer = 0.;
                    }
                }
                Screen::Paused => self.screen = self.previous_screen,
                Screen::Options => self.close_options(),
                Screen::Title => {}
                _ => self.screen = Screen::Title,
            }
            self.audio_update();
        }
        if is_key_pressed(KeyCode::B) && matches!(self.screen, Screen::Playing | Screen::Paused) {
            self.backup()
        }
        let frame_dt = get_frame_time().min(0.15);
        self.message_timer = (self.message_timer - frame_dt).max(0.);
        self.mini_message_timer = (self.mini_message_timer - frame_dt).max(0.);
        if self.screen == Screen::Instructs {
            self.countdown -= frame_dt;
            let pressed = [
                KeyCode::Up,
                KeyCode::Down,
                KeyCode::Left,
                KeyCode::Right,
                KeyCode::Space,
            ]
            .iter()
            .any(|&key| is_key_down(key))
                || is_mouse_button_down(MouseButton::Left)
                || (0..4).any(|i| platform::input(i).abs() > 0.3);
            if pressed || self.countdown < 0. {
                self.screen = Screen::Ready;
                self.countdown = if self.kind() == Kind::Hover { 2. } else { 1. };
                self.message.clear();
                self.sound("ready.aif");
            }
        }
        if self.screen == Screen::Ready {
            let before = self.countdown.ceil() as i32;
            self.countdown -= frame_dt;
            let after = self.countdown.ceil() as i32;
            if before != after && after > 0 {
                self.sound("ready.aif")
            }
            if self.countdown <= 0. {
                self.screen = Screen::Playing;
                self.audio_update();
                self.sound(if self.kind() == Kind::Bus {
                    ["arnold.aif", "helga.aif", "gerald.aif", "grandpa.aif"][self.driver]
                } else {
                    "go.aif"
                });
                self.music("gamemusic.aif");
                if self.kind() == Kind::Hover {
                    self.message = "Go!".into();
                    self.message_timer = 2.;
                }
                if self.kind() == Kind::Bus {
                    self.message = "Go!".into();
                    self.message_timer = 2.;
                }
            }
        }
        if matches!(
            self.screen,
            Screen::Title
                | Screen::Mode
                | Screen::Players
                | Screen::Difficulty
                | Screen::Driver
                | Screen::Instructions
                | Screen::Scores
        ) && !self.world.demo.is_empty()
        {
            self.demo_phase += frame_dt * self.tick_rate();
            let phase = self.demo_phase;
            let index = phase as usize % self.world.demo.len();
            let a = &self.world.demo[index];
            let b = &self.world.demo[(index + 1) % self.world.demo.len()];
            self.vehicle.pos = a.position.lerp(b.position, phase.fract());
            self.vehicle.previous = self.vehicle.pos;
            self.vehicle.yaw =
                a.yaw + ((b.yaw - a.yaw + 180.).rem_euclid(360.) - 180.) * phase.fract();
            self.vehicle.previous_yaw = self.vehicle.yaw;
            self.vehicle.pitch = a.pitch;
            self.vehicle.roll = a.roll;
            self.vehicle.speed = a.speed;
        }
        let step = 1. / self.tick_rate();
        if self.screen == Screen::Playing {
            let key = |a, b| is_key_down(a) || is_key_down(b);
            let input = Input {
                steer: ((key(KeyCode::Right, KeyCode::D) as i32
                    - key(KeyCode::Left, KeyCode::A) as i32) as f32
                    + platform::input(0))
                .clamp(-1., 1.),
                throttle: (key(KeyCode::Up, KeyCode::W) as u8 as f32).max(platform::input(1)),
                brake: (key(KeyCode::Down, KeyCode::S) as u8 as f32).max(platform::input(2)),
                slide: is_key_down(KeyCode::Space) || platform::input(3) > 0.5,
            };
            self.accumulator = (self.accumulator + frame_dt).min(step * 5.);
            while self.accumulator >= step && self.screen == Screen::Playing {
                self.accumulator -= step;
                self.tick(input, step);
            }
        } else if matches!(self.screen, Screen::Instructs | Screen::Ready)
            && self.kind() == Kind::Bus
        {
            self.accumulator += frame_dt;
            while self.accumulator >= step {
                self.accumulator -= step;
                self.world.tick_entities(false, self.vehicle.pos);
                self.world
                    .tick_bus_walkers(&self.vehicle, &self.renderer.driver, &mut self.seed);
                if self.screen == Screen::Ready {
                    self.renderer.tick_bus_camera(&self.world, &self.vehicle);
                }
            }
        } else if matches!(self.screen, Screen::Instructs | Screen::Ready)
            && self.kind() == Kind::Hover
        {
            self.accumulator += frame_dt;
            while self.accumulator >= step {
                self.accumulator -= step;
                self.vehicle.hover_actor.tick(0., false, false);
                self.tick_hover_camera();
            }
        } else if self.screen == Screen::Ending {
            self.countdown -= frame_dt;
            self.accumulator += frame_dt;
            while self.accumulator >= step {
                self.accumulator -= step;
                self.world.tick_entities(false, self.vehicle.pos);
                self.world
                    .tick_bus_walkers(&self.vehicle, &self.renderer.driver, &mut self.seed);
                self.world.sync_bus_colliders(&self.assets);
                self.vehicle.tick(Input::default(), &self.world.collision);
                self.renderer.tick_bus_end_camera(&self.vehicle);
            }
            if self.countdown <= 0. {
                let message = self.message.clone();
                self.finish(self.won, &message);
            }
        } else if self.screen == Screen::Finished && self.kind() == Kind::Hover {
            self.countdown -= frame_dt;
            self.accumulator += frame_dt;
            while self.accumulator >= step {
                self.accumulator -= step;
                self.world.tick_entities(false, self.vehicle.pos);
                self.vehicle.tick(Input::default(), &self.world.collision);
                self.tick_hover_camera();
            }
        } else if self.screen == Screen::Target {
            self.accumulator += frame_dt;
            while self.accumulator >= step {
                self.accumulator -= step;
                self.world
                    .tick_bus_walkers(&self.vehicle, &self.renderer.driver, &mut self.seed);
                self.world
                    .tick_bus_passengers(&self.vehicle, &mut self.seed);
            }
        } else if self.screen == Screen::Replay {
            self.accumulator += frame_dt;
            while self.accumulator >= step {
                self.accumulator -= step;
                if let Some(f) = self.trace.get(self.replay_index).cloned() {
                    self.apply_frame(&f);
                    self.renderer.tick_bus_camera(&self.world, &self.vehicle);
                    self.tick_hover_camera();
                    self.replay_index += 1;
                } else {
                    if let Some(f) = self.replay_end.clone() {
                        self.apply_frame(&f);
                    }
                    self.screen = Screen::Finished;
                    break;
                }
            }
        } else if !matches!(self.screen, Screen::Paused | Screen::Options) {
            self.accumulator = 0.
        }
        if self.kind() == Kind::Hover
            && !matches!(
                self.screen,
                Screen::Paused | Screen::Options | Screen::ScoreEntry
            )
        {
            if matches!(
                self.screen,
                Screen::Playing
                    | Screen::Ready
                    | Screen::Instructs
                    | Screen::Finished
                    | Screen::Replay
            ) {
                self.camera_accumulator = self.accumulator;
            } else {
                self.camera_accumulator += frame_dt;
                while self.camera_accumulator >= step {
                    self.camera_accumulator -= step;
                    self.tick_hover_camera();
                }
            }
        }
        if matches!(
            self.screen,
            Screen::Playing | Screen::Replay | Screen::Ending
        ) {
            self.engine_update();
        }
        self.audio_update();
        if self.clock_ticks.is_multiple_of(10) || self.screen != Screen::Playing {
            platform::debug(&serde_json::json!({"browser_options":crate::options_ui::browser_state(self),"opponent_pace":self.world.opponent_pace,"smooth":self.renderer.smooth,"camera":[self.renderer.camera_position.x,self.renderer.camera_position.y,self.renderer.camera_position.z],"screen":format!("{:?}",self.screen as u8),"mode":self.mode,"unlimited_time":self.unlimited_time,"practice":self.practice_used,"music":self.active_music,"engine":self.engine,"difficulty":self.difficulty,"clock":self.clock,"yaw":self.vehicle.yaw,"jumping":self.vehicle.jumping,"last_collision":self.vehicle.crash_object,"pos":[self.vehicle.pos.x,self.vehicle.pos.y,self.vehicle.pos.z],"speed":self.vehicle.speed,"surface":self.vehicle.surface,"score":self.score,"collected":self.collected,"lap":self.lap,"checkpoint":self.checkpoint,"entities":self.world.entities.iter().filter(|e|e.active).count(),"nearest_tomato":self.world.entities.iter().filter(|e|e.active&&e.shape.starts_with("coin")).min_by(|a,b|a.position.distance_squared(self.vehicle.pos).total_cmp(&b.position.distance_squared(self.vehicle.pos))).map(|e|[e.position.x,e.position.y,e.position.z])}).to_string());
        }
    }
    fn tick_hover_camera(&mut self) {
        use crate::hover_camera::Mode;
        let mode = match self.screen {
            Screen::Playing => Mode::User(self.renderer.camera_mode),
            Screen::Ready if self.countdown < 1. => Mode::User(self.renderer.camera_mode),
            Screen::Ready => Mode::Orbit,
            Screen::Instructs => Mode::Start,
            Screen::Finished => Mode::End,
            _ => Mode::Replay,
        };
        if let Some(rig) = &mut self.renderer.hover_camera {
            rig.tick(&self.vehicle, mode);
        }
    }
    fn tick(&mut self, input: Input, dt: f32) {
        let previous_rank = if self.kind() == Kind::Hover {
            self.world.hover_rank(&self.vehicle.hover_track)
        } else {
            1
        };
        self.clock_ticks += 1;
        self.elapsed += dt;
        if self.kind() == Kind::Bus && self.mode != 2 && !self.unlimited_time {
            self.clock -= crate::rules::bus_clock_step(dt);
            if self.clock < 0. && !self.vehicle.jumping {
                self.finish(false, "TIME IS UP!");
                return;
            }
        } else if self.kind() == Kind::Hover {
            self.clock += dt
        }
        self.hit_cooldown = (self.hit_cooldown - 1).max(0);
        self.slow = (self.slow - 1).max(0);
        self.world.tick_entities(self.slow > 0, self.vehicle.pos);
        self.world
            .tick_bus_walkers(&self.vehicle, &self.renderer.driver, &mut self.seed);
        self.world.tick_bus_dozer(&self.vehicle);
        let dozer_caught_before_drive = self.kind() == Kind::Bus
            && crate::bus_rules::Settings::new(self.mode, self.difficulty)
                .unwrap()
                .caught(self.vehicle.speed, self.vehicle.jumping)
            && self
                .world
                .entities
                .iter()
                .any(|e| e.active && e.dozer_contact);
        self.world.sync_bus_colliders(&self.assets);
        let was_jumping = self.vehicle.jumping;
        self.vehicle.tick(input, &self.world.collision);
        if self.kind() == Kind::Hover {
            for &(index, impulse) in &self.vehicle.hover_transfers {
                if let Some(e) = self.world.entities.get_mut(index) {
                    e.racer.velocity -= impulse.extend(0.);
                }
            }
            self.vehicle.hover_track.update(
                &self.world.track,
                self.vehicle.pos,
                false,
                &self.vehicle.surface,
            );
        }
        if self.kind() == Kind::Hover && was_jumping != self.vehicle.jumping {
            self.sound(if self.vehicle.jumping {
                "jump.aif"
            } else {
                "hoverland.aif"
            });
        }
        self.renderer.tick_bus_camera(&self.world, &self.vehicle);
        self.tick_hover_camera();
        if self.kind() == Kind::Bus {
            self.world
                .tick_bus_passengers(&self.vehicle, &mut self.seed);
        }
        if self.kind() == Kind::Bus
            && let Some(index) = self.vehicle.crash_object
            && self.world.collision.is_breakable(index)
            && let Some(e) = self.world.entities.get_mut(index)
            && e.solid
        {
            e.solid = false;
            e.crash_ticks =
                if e.shape.contains("lamp") || e.shape.contains("tree") || e.shape.contains("sign")
                {
                    9
                } else {
                    30
                };
            e.flying = (self.vehicle.crash_velocity * 1.5).extend(self.vehicle.crash_speed / 2.);
            self.world.collision.disable(index);
        }
        if self.vehicle.crash && (self.kind() == Kind::Bus || self.hit_cooldown == 0) {
            self.sound(if self.kind() == Kind::Bus {
                "crash1.aif"
            } else {
                "hoverland.aif"
            });
            self.hit_cooldown = 8
        }
        if self.vehicle.pos.z
            < if self.kind() == Kind::Bus {
                -500.
            } else {
                -40000.
            }
            || !self.vehicle.pos.is_finite()
            || self.kind() == Kind::Bus && self.vehicle.surface == "wat"
        {
            if self.kind() == Kind::Bus {
                self.sound("splash.aif");
            }
            self.backup()
        }
        if self.clock_ticks.is_multiple_of(15)
            && self.vehicle.grounded
            && (self.vehicle.surface.contains("road") || self.vehicle.surface.contains("dirt"))
        {
            self.safe_pos = self.vehicle.pos;
            self.safe_yaw = self.vehicle.yaw;
        }
        let is_bus = self.kind() == Kind::Bus;
        let mut effects = Vec::new();
        let mut bursts = Vec::new();
        let mut timewarped = false;
        let mut caught = dozer_caught_before_drive;
        if is_bus
            && crate::bus_rules::Settings::new(self.mode, self.difficulty)
                .unwrap()
                .caught(self.vehicle.crash_speed, self.vehicle.jumping)
            && self
                .vehicle
                .crash_object
                .and_then(|i| self.world.entities.get(i))
                .is_some_and(|e| e.shape == "jelly")
        {
            caught = true;
        }
        let nearest_good = if is_bus {
            self.world.nearest_bus_good(self.vehicle.pos)
        } else {
            None
        };
        for (entity_index, e) in self.world.entities.iter_mut().enumerate() {
            if !e.active {
                continue;
            }
            if is_bus {
                if e.shape.starts_with("coin") {
                    if crate::bus_rules::manhattan(e.position, self.vehicle.previous) >= 300. {
                        continue;
                    }
                } else if nearest_good != Some(entity_index) {
                    continue;
                }
            } else {
                if !crate::hover_drive::collectable(self.vehicle.previous, e.position) {
                    continue;
                }
            }
            let mut collected = false;
            match e.shape.as_str() {
                "coin1" | "coin2" | "coin3" => {
                    self.collected += 1;
                    self.score += 1000 * self.difficulty as i32;
                    if self.collected < self.world.tomato_total {
                        self.mini_message = format!(
                            "{} of {} TOMATOES!",
                            self.collected, self.world.tomato_total
                        );
                        self.mini_message_timer = 3.;
                        effects.push("coin.aif");
                    }
                    collected = true;
                }
                "point" | "binary" | "heart" => {
                    self.score += 500;
                    if is_bus {
                        self.vehicle.invincible = 200;
                    }
                    if !is_bus && e.shape == "point" {
                        self.collected += 1;
                        if self.mode == 1 {
                            self.message = format!(
                                "{} of {} emails rescued",
                                self.collected,
                                [0, 5, 10, 15][self.difficulty as usize]
                            );
                            self.message_timer = 2.;
                        }
                    }
                    effects.push(if is_bus {
                        "bonus.aif"
                    } else {
                        "bonuspoint.aif"
                    });
                    collected = true;
                }
                "turbo" => {
                    self.score += if is_bus { 50 } else { 500 };
                    self.vehicle.turbo = if is_bus {
                        500
                    } else {
                        self.vehicle.turbo.max(100)
                    };
                    effects.push(if is_bus {
                        "bonus.aif"
                    } else {
                        "bonusturbo.aif"
                    });
                    collected = true;
                }
                "time" => {
                    self.score += 50;
                    self.clock += 30.;
                    effects.push("bonus.aif");
                    collected = true;
                }
                "timewarp" => {
                    self.score += 500;
                    timewarped = true;
                    effects.push("bonustimewarp.aif");
                    collected = true;
                }
                "racer" => {} // Original moving proxy and relative-velocity impulse.

                "jelly" | "bulldozer" => {} // Source dozer probes/contacts above; no extra drag.
                _ => {}
            }
            if collected {
                bursts.push(e.position);
                e.active = false;
                e.collected += 1;
                if !is_bus && e.shape != "point" && e.collected <= 3 {
                    e.cooldown = 200
                }
            }
        }
        if timewarped {
            self.world.timewarp_racers();
        }
        for p in bursts {
            self.world.burst(p);
        }
        for s in effects {
            self.sound(s)
        }
        if caught {
            self.finish(false, "FutureTek caught you!");
            return;
        }
        if is_bus
            && self.mode == 0
            && self.collected >= self.world.tomato_total
            && self.world.tomato_total > 0
        {
            self.finish(true, "YOU SAVED THE NEIGHBORHOOD!");
            return;
        }
        if is_bus
            && self.mode != 0
            && let Some(i) = self.vehicle.ground_object.filter(|&i| {
                self.world
                    .entities
                    .get(i)
                    .is_some_and(|e| e.shape == "target")
            })
            && (i != self.target || self.vehicle.ground_contact_speed != 0.)
        {
            self.mini_message = if i != self.target {
                self.world.entities[i].name.clone()
            } else if self.carrying {
                format!("{}! Stop!", self.world.entities[i].name)
            } else {
                format!(
                    "There's {}! Stop!",
                    ["arnold", "helga", "gerald", "grandpa"][self.passenger]
                )
            };
            self.mini_message_timer = 0.2;
        }
        if is_bus
            && self.mode != 0
            && !self.world.targets.is_empty()
            && crate::bus_mission::arrival(
                self.target,
                self.vehicle.ground_object,
                self.vehicle.ground_contact_speed,
            )
        {
            let old_name = ["arnold", "helga", "gerald", "grandpa"][self.passenger];
            let mut transition = self.world.entities[self.target].clone();
            transition.shape = old_name.into();
            transition.model = old_name.into();
            transition.scale = if old_name == "grandpa" { 40. } else { 50. };
            transition.speed = 10.;
            transition.path_index = 0;
            transition.path_direction = 1;
            transition.path_loop = "wave".into();
            transition.name = "passenger".into();
            transition.actor = Default::default();
            transition.actor.pose(crate::bus_actor::Pose::Walk);
            transition.path = crate::bus_mission::passenger_route(
                self.vehicle.pos,
                self.vehicle.yaw,
                self.vehicle.pitch,
                self.vehicle.roll,
                self.carrying,
            );
            transition.position =
                transition.path[0] + Vec3::Z * crate::bus_actor::height(old_name, transition.scale);
            transition.previous = transition.position;
            let first = transition.path[0];
            crate::bus_actor::target(&mut transition, first);
            self.world.transitions = vec![transition];
            if self.carrying {
                self.deliveries += 1;
            }
            self.carrying = !self.carrying;
            self.sound("bonus.aif");
            self.next_target();
        }
        if !is_bus {
            if self.mode == 1
                && !self.unlimited_time
                && !self.vehicle.jumping
                && self
                    .world
                    .entities
                    .iter()
                    .any(|e| e.active && e.shape == "racer" && e.lap > 1)
            {
                self.finish(false, "You did not collect all the envelopes in time.");
                return;
            }
            if self.world.hover_rank(&self.vehicle.hover_track) > previous_rank {
                self.sound("baddielaugh.aif");
            }
            let track = &mut self.vehicle.hover_track;
            let completed = self.mode != 1
                && track.finish(
                    self.world.track.len(),
                    &self.vehicle.surface,
                    &self.vehicle.hover_contact,
                );
            self.checkpoint = track.point;
            self.max_checkpoint = track.counter;
            self.lap = track.lap;
            if track.wrong_way > 10 && self.vehicle.surface.contains("dirt") {
                self.message = "WRONG WAY".into();
                self.message_timer = 1.;
            }
            if completed {
                self.lap_times.push(self.clock);
                self.best_lap = self.lap_times.iter().copied().fold(f32::INFINITY, f32::min);
                if self.lap <= if self.mode == 0 { 2 } else { 1 } {
                    let bonus = crate::rules::lap_bonus(self.clock, self.difficulty);
                    if bonus > 0 {
                        self.score += bonus;
                        self.message = format!("Lap Time Bonus: {bonus}");
                        self.message_timer = 2.;
                        self.sound("bonus.aif");
                    }
                    self.clock = 0.;
                }
            }
            if self.mode == 1
                && !self.vehicle.jumping
                && self.collected >= [0, 5, 10, 15][self.difficulty as usize]
            {
                self.finish(true, "EMAILS RESCUED!");
                return;
            }
            let laps = if self.mode == 0 { 2 } else { 1 };
            if self.mode != 1 && !self.vehicle.jumping && self.lap > laps {
                let rank = self.world.hover_rank(&self.vehicle.hover_track);
                self.finish(true, &format!("FINISHED IN POSITION {rank}"));
                return;
            }
        }
        if is_bus {
            self.recovery.record(&self.vehicle);
        }
        // Ten minutes bounds memory on WASM; only moving actors have transforms.
        if self.trace.len() >= self.tick_rate() as usize * 600 {
            self.trace.pop_front();
        }
        self.trace.push_back(self.capture_frame());
    }
    fn capture_frame(&self) -> Frame {
        let mut active = vec![0; self.world.entities.len().div_ceil(64)];
        let mut actors = Vec::new();
        for (i, e) in self.world.entities.iter().enumerate() {
            if e.active {
                active[i / 64] |= 1 << (i % 64);
            }
            if e.path.len() > 1 || e.crash_ticks > 0 || e.shape == "jelly" {
                actors.push(ActorFrame {
                    racer: e.racer.clone(),
                    index: i,
                    pos: e.position,
                    yaw: e.rotation,
                    lap: e.lap,
                    tilt: e.tilt,
                });
            }
        }
        Frame {
            surface: self.vehicle.surface.clone(),
            bounce: self.vehicle.hover_bounce.clone(),
            boost: self.vehicle.hover_boost,
            hover_track: self.vehicle.hover_track.clone(),
            hover_actor: self.vehicle.hover_actor.clone(),
            pos: self.vehicle.pos,
            yaw: self.vehicle.yaw,
            pitch: self.vehicle.pitch,
            roll: self.vehicle.roll,
            speed: self.vehicle.speed,
            jumping: self.vehicle.jumping,
            actors,
            active,
            score: self.score,
            collected: self.collected,
            clock: self.clock,
            elapsed: self.elapsed,
            lap: self.lap,
            checkpoint: self.checkpoint,
            target: self.target,
            carrying: self.carrying,
            best_lap: self.best_lap,
        }
    }
    pub(crate) fn apply_frame(&mut self, f: &Frame) {
        self.vehicle.hover_previous_pose = vec3(
            self.vehicle.pitch,
            self.vehicle.roll,
            self.vehicle.hover_bounce.offset,
        );
        self.vehicle.previous = self.vehicle.pos;
        self.vehicle.previous_yaw = self.vehicle.yaw;
        self.vehicle.pos = f.pos;
        self.vehicle.yaw = f.yaw;
        self.vehicle.travel_yaw = f.yaw;
        self.vehicle.pitch = f.pitch;
        self.vehicle.roll = f.roll;
        self.vehicle.speed = f.speed;
        self.vehicle.jumping = f.jumping;
        self.vehicle.hover_actor = f.hover_actor.clone();
        self.vehicle.surface = f.surface.clone();
        self.vehicle.hover_bounce = f.bounce.clone();
        self.vehicle.hover_boost = f.boost;
        self.vehicle.hover_track = f.hover_track.clone();
        for (i, e) in self.world.entities.iter_mut().enumerate() {
            if e.path.len() <= 1 && e.shape != "jelly" {
                e.position = e.base;
                e.previous = e.base;
            }
            e.active = f
                .active
                .get(i / 64)
                .is_some_and(|bits| bits & (1 << (i % 64)) != 0);
        }
        for actor in &f.actors {
            if let Some(e) = self.world.entities.get_mut(actor.index) {
                e.racer = actor.racer.clone();
                e.previous = e.position;
                e.position = actor.pos;
                e.rotation = actor.yaw;
                e.lap = actor.lap;
                e.tilt = actor.tilt;
            }
        }
        self.score = f.score;
        self.collected = f.collected;
        self.clock = f.clock;
        self.elapsed = f.elapsed;
        self.lap = f.lap;
        self.checkpoint = f.checkpoint;
        self.target = f.target;
        self.carrying = f.carrying;
        self.best_lap = f.best_lap;
        if self.kind() == Kind::Bus && self.mode != 0 {
            self.world.selected_target = Some(f.target);
        }
    }
    pub fn draw(&mut self) {
        let menu = !matches!(
            self.screen,
            Screen::Playing
                | Screen::Ready
                | Screen::Paused
                | Screen::Options
                | Screen::Replay
                | Screen::Finished
                | Screen::Target
                | Screen::Ending
                | Screen::Instructs
        );
        let alpha = (self.accumulator * self.tick_rate()).clamp(0., 1.);
        self.renderer.doors_open = self.screen == Screen::Target && self.target_step > 1;
        self.renderer.draw(
            &self.assets,
            &self.world,
            &self.vehicle,
            (
                alpha,
                (self.camera_accumulator * self.tick_rate()).clamp(0., 1.),
            ),
            menu,
            get_time() as f32,
        );
        crate::ui::draw(self);
    }
}
