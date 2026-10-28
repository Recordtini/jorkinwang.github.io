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
    pub index: usize,
    pub pos: Vec3,
    pub yaw: f32,
    pub lap: u32,
    pub tilt: f32,
}
#[derive(Clone)]
pub struct Frame {
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
    pub won: bool,
    pub volume: f32,
    pub muted: bool,
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
    pub safe_pos: Vec3,
    pub safe_yaw: f32,
    pub accumulator: f32,
    pub active_music: String,
    pub engine: String,
    pub skidding: bool,
    pub ui_selection: usize,
    pub show_help_page: usize,
    pub seed: u64,
    pub clock_ticks: u64,
}
impl Game {
    pub async fn load(kind: Kind) -> Result<Self, String> {
        let name = if kind == Kind::Bus {
            "runaway-bus"
        } else {
            "stupor-highway"
        };
        let assets = Assets::load(name).await?;
        let world = World::build(&assets, kind, 1, 0, 1793130001)?;
        let params = if kind == Kind::Bus {
            Params::bus(&assets)
        } else {
            Params::hover()
        };
        let vehicle = Vehicle::new(kind, world.start, params, 1);
        let mut renderer = Renderer::new(&assets)?;
        renderer.reset_camera(&vehicle);
        renderer.smooth = platform::get(10) != 2.;
        renderer.filtering = platform::get(11) == 1.;
        renderer.widescreen = platform::get(12) == 1.;
        let mut game = Self {
            assets,
            world,
            vehicle,
            renderer,
            screen: Screen::Title,
            previous_screen: Screen::Title,
            options_return: Screen::Title,
            mode: 0,
            difficulty: 1,
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
            won: false,
            volume: if platform::get(13) == 0. {
                0.7
            } else {
                (platform::get(13) - 1.) as f32
            },
            muted: platform::get(14) == 1.,
            music_enabled: platform::get(15) != 2.,
            fps: false,
            minimap: false,
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
            safe_pos: Vec3::ZERO,
            safe_yaw: 0.,
            accumulator: 0.,
            active_music: String::new(),
            engine: String::new(),
            skidding: false,
            ui_selection: 0,
            show_help_page: 0,
            seed: 1793130001,
            clock_ticks: 0,
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
        self.world = World::build(&self.assets, kind, self.difficulty, self.mode, self.seed)?;
        let params = if kind == Kind::Bus {
            Params::bus(&self.assets)
        } else {
            Params::hover()
        };
        self.vehicle = Vehicle::new(kind, self.world.start, params, self.difficulty);
        self.renderer.driver = ["arnold", "helga", "gerald", "grandpa"][self.driver].into();
        self.safe_pos = self.vehicle.pos;
        self.safe_yaw = self.vehicle.yaw;
        self.renderer.reset_camera(&self.vehicle);
        self.screen = Screen::Ready;
        self.countdown = if kind == Kind::Bus { 2. } else { 3. };
        self.score = 0;
        self.best = platform::get(self.score_key()) as i32;
        self.collected = 0;
        self.elapsed = 0.;
        self.clock = if kind == Kind::Bus {
            (2. + self.difficulty as f32) * 60.
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
        self.replay_end = None;
        self.message.clear();
        self.message_timer = 0.;
        self.carrying = false;
        self.deliveries = 0;
        self.target_step = 0;
        self.target = 0;
        self.won = false;
        self.accumulator = 0.;
        self.clock_ticks = 0;
        self.music("");
        self.sound("ready.aif");
        if kind == Kind::Bus && self.mode != 0 {
            self.passenger = (self.driver + 1) % 4;
            self.next_target();
        }
        Ok(())
    }
    pub fn next_target(&mut self) {
        let valid: Vec<_> = self
            .world
            .targets
            .iter()
            .copied()
            .filter(|i| {
                self.world.entities[*i].position.truncate().length()
                    < [0., 20000., 60000., 80000.][self.difficulty as usize]
            })
            .collect();
        if valid.is_empty() {
            return;
        }
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 7;
        self.seed ^= self.seed << 17;
        let choices: Vec<_> = valid
            .iter()
            .copied()
            .filter(|i| *i != self.target || valid.len() == 1)
            .collect();
        self.target = choices[self.seed as usize % choices.len()];
        self.target_step += 1;
        self.target_bonus = if self.mode == 2 || self.difficulty == 1 && self.target_step <= 3 {
            1000
        } else {
            self.clock.max(0.).trunc() as i32 * 100 * self.difficulty as i32
        };
        self.world.selected_target = Some(self.target);
        let distance = self.world.entities[self.target]
            .position
            .distance(self.vehicle.pos);
        if self.carrying {
            self.world.passenger = None;
        } else {
            let mut passenger = self.world.entities[self.target].clone();
            passenger.shape = ["arnold", "helga", "gerald", "grandpa"][self.passenger % 4].into();
            passenger.model = passenger.shape.clone();
            passenger.position += vec3(80., 80., 50.);
            passenger.previous = passenger.position;
            passenger.scale = 80.;
            passenger.active = true;
            passenger.solid = false;
            self.world.passenger = Some(passenger);
        }
        self.clock = if self.difficulty == 1 && self.target_step <= 2 {
            180.
        } else {
            30. + (distance / 50000. * 120.).trunc() / self.difficulty as f32
                - self.target_step as f32
        };
        self.message = format!(
            "{} {} at {}",
            if self.carrying { "Drop off" } else { "Pick up" },
            ["Arnold", "Helga", "Gerald", "Grandpa"][self.passenger % 4],
            self.world.entities[self.target].name
        );
        self.message_timer = 5.;
        self.screen = Screen::Target;
        self.audio_update();
    }
    pub fn sound(&self, name: &str) {
        if self.muted {
            return;
        }
        if let Some(s) = self.assets.sounds.get(name) {
            play_sound(
                s,
                PlaySoundParams {
                    looped: false,
                    volume: self.volume,
                },
            );
        }
    }
    pub fn music(&mut self, name: &str) {
        let name = if name == "titlemusic.aif" && self.kind() == Kind::Bus {
            "gamemusic.aif"
        } else {
            name
        };
        if self.active_music == name {
            return;
        }
        if let Some(s) = self.assets.sounds.get(&self.active_music) {
            stop_sound(s)
        }
        self.active_music = name.into();
        if self.music_enabled
            && !self.muted
            && let Some(s) = self.assets.sounds.get(name)
        {
            play_sound(
                s,
                PlaySoundParams {
                    looped: true,
                    volume: self.volume * 0.55,
                },
            );
        }
    }
    pub fn audio_update(&mut self) {
        for (name, s) in &self.assets.sounds {
            let volume = if self.muted {
                0.
            } else if name == &self.active_music {
                if self.music_enabled {
                    self.volume * 0.55
                } else {
                    0.
                }
            } else if name == "skid.aif" {
                if self.skidding && self.screen == Screen::Playing {
                    self.volume * 0.25
                } else {
                    0.
                }
            } else if name == &self.engine {
                if matches!(self.screen, Screen::Playing | Screen::Replay) {
                    self.volume * 0.24
                } else {
                    0.
                }
            } else {
                self.volume
            };
            set_sound_volume(s, volume);
        }
    }
    fn engine_update(&mut self) {
        let engine = if self.kind() == Kind::Hover {
            "hoverengine.aif".to_string()
        } else if self.vehicle.jumping {
            "inair.aif".into()
        } else if self.vehicle.speed < 0.1 {
            "idle.aif".into()
        } else {
            format!(
                "engine{}.aif",
                ((self.vehicle.speed / 20.) as usize).clamp(1, 5)
            )
        };
        if engine != self.engine {
            if let Some(sound) = self.assets.sounds.get(&self.engine) {
                stop_sound(sound);
            }
            self.engine = engine;
            if let Some(sound) = self.assets.sounds.get(&self.engine) {
                play_sound(
                    sound,
                    PlaySoundParams {
                        looped: true,
                        volume: if self.muted { 0. } else { self.volume * 0.24 },
                    },
                );
            }
        }
        let skid =
            self.kind() == Kind::Bus && self.vehicle.speed > 10. && self.vehicle.roll.abs() > 10.;
        if skid != self.skidding {
            self.skidding = skid;
            if let Some(s) = self.assets.sounds.get("skid.aif") {
                if skid {
                    play_sound(
                        s,
                        PlaySoundParams {
                            looped: true,
                            volume: if self.muted { 0. } else { self.volume * 0.25 },
                        },
                    );
                } else {
                    stop_sound(s);
                }
            }
        }
        if self.kind() == Kind::Bus
            && self.vehicle.turbo > 0
            && self.active_music == "gamemusic.aif"
        {
            self.music("turbo.aif");
        }
        if self.kind() == Kind::Bus && self.vehicle.turbo == 0 && self.active_music == "turbo.aif" {
            self.music("gamemusic.aif");
        }
    }
    pub fn backup(&mut self) {
        if self.kind() == Kind::Hover && !self.world.track.is_empty() {
            let i = crate::world::nearest(&self.world.track, self.vehicle.pos);
            let point = self.world.track[i];
            let floor = self
                .world
                .collision
                .ground(point, 600., 1500.)
                .map(|h| h.pos)
                .unwrap_or(point);
            self.safe_pos = floor + Vec3::Z * self.vehicle.height;
            let delta = self.world.track[(i + 1) % self.world.track.len()] - point;
            self.safe_yaw = delta.x.atan2(-delta.y).to_degrees();
        }
        self.vehicle.pos = self.safe_pos + Vec3::Z * 400.;
        self.vehicle.previous = self.vehicle.pos;
        self.vehicle.yaw = self.safe_yaw;
        self.vehicle.previous_yaw = self.safe_yaw;
        self.vehicle.velocity = Vec2::ZERO;
        self.vehicle.speed = 0.;
        self.vehicle.angular_velocity = 0.;
        self.vehicle.jumping = true;
        self.vehicle.vertical_speed = 0.;
        self.vehicle.jump_time = 0.;
        self.vehicle.jump_start = self.vehicle.pos.z;
        self.vehicle.jump_initial_speed = 0.;
        self.vehicle.travel_yaw = self.safe_yaw;
        self.sound("hoverland.aif");
        self.renderer.reset_camera(&self.vehicle);
    }
    pub fn finish(&mut self, won: bool, message: &str) {
        self.won = won;
        self.message = message.into();
        self.message_timer = 1000.;
        self.screen = Screen::Finished;
        if won && self.kind() == Kind::Bus && self.mode == 0 {
            self.score += self.clock.max(0.) as i32 * 100 * self.difficulty as i32
        }
        self.best = self.best.max(self.score);
        platform::set(self.score_key(), self.best as f64);
        if self.kind() == Kind::Hover && won {
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
        self.music(if won { "win.aif" } else { "lose.aif" });
        self.audio_update();
    }
    pub fn update(&mut self) {
        if is_key_pressed(KeyCode::F11) {
            platform::fullscreen()
        }
        if is_key_pressed(KeyCode::F1) {
            if self.screen == Screen::Options {
                self.screen = self.options_return
            } else {
                self.options_return = self.screen;
                self.screen = Screen::Options
            }
            self.audio_update()
        }
        if is_key_pressed(KeyCode::M) {
            self.muted = !self.muted;
            platform::set(14, self.muted as u8 as f64);
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
                Screen::Playing | Screen::Ready | Screen::Replay => {
                    self.previous_screen = self.screen;
                    self.screen = Screen::Paused;
                }
                Screen::Paused => self.screen = self.previous_screen,
                Screen::Options => self.screen = self.options_return,
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
            let phase = get_time() as f32 * self.tick_rate();
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
        if self.screen == Screen::Target {
            self.world.tick_transitions(frame_dt);
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
        } else if self.screen == Screen::Replay {
            self.accumulator += frame_dt;
            while self.accumulator >= step {
                self.accumulator -= step;
                if let Some(f) = self.trace.get(self.replay_index).cloned() {
                    self.apply_frame(&f);
                    self.renderer.tick_bus_camera(&self.world, &self.vehicle);
                    self.replay_index += 1;
                } else {
                    if let Some(f) = self.replay_end.clone() {
                        self.apply_frame(&f);
                    }
                    self.screen = Screen::Finished;
                    break;
                }
            }
        } else {
            self.accumulator = 0.
        }
        if matches!(self.screen, Screen::Playing | Screen::Replay) {
            self.engine_update();
        }
        if self.clock_ticks.is_multiple_of(10) {
            platform::debug(&serde_json::json!({"screen":format!("{:?}",self.screen as u8),"pos":[self.vehicle.pos.x,self.vehicle.pos.y,self.vehicle.pos.z],"speed":self.vehicle.speed,"surface":self.vehicle.surface,"score":self.score,"collected":self.collected,"lap":self.lap,"checkpoint":self.checkpoint,"entities":self.world.entities.iter().filter(|e|e.active).count(),"nearest_tomato":self.world.entities.iter().filter(|e|e.active&&e.shape.starts_with("coin")).min_by(|a,b|a.position.distance_squared(self.vehicle.pos).total_cmp(&b.position.distance_squared(self.vehicle.pos))).map(|e|[e.position.x,e.position.y,e.position.z])}).to_string());
        }
    }
    fn tick(&mut self, input: Input, dt: f32) {
        self.clock_ticks += 1;
        self.elapsed += dt;
        if self.kind() == Kind::Bus && self.mode != 2 {
            self.clock -= crate::rules::bus_clock_step(dt);
            if self.clock <= 0. {
                self.finish(false, "TIME IS UP!");
                return;
            }
        } else if self.kind() == Kind::Hover {
            self.clock += dt
        }
        self.hit_cooldown = (self.hit_cooldown - 1).max(0);
        self.slow = (self.slow - 1).max(0);
        self.world.tick_entities(self.slow > 0, self.vehicle.pos);
        self.vehicle.tick(input, &self.world.collision);
        self.renderer.tick_bus_camera(&self.world, &self.vehicle);
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
        if self.vehicle.crash && self.hit_cooldown == 0 {
            self.sound(if self.kind() == Kind::Bus {
                "crash1.aif"
            } else {
                "hovercrash.aif"
            });
            self.hit_cooldown = 8
        }
        if self.vehicle.pos.z
            < if self.kind() == Kind::Bus {
                -500.
            } else {
                -20000.
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
        let mut caught = false;
        for e in &mut self.world.entities {
            if !e.active {
                continue;
            }
            let radius = if is_bus {
                if e.shape == "jelly" { 600. } else { 300. }
            } else {
                1200.
            };
            let delta = self.vehicle.pos - self.vehicle.previous;
            let t = if delta.length_squared() > 0. {
                ((e.position - self.vehicle.previous).dot(delta) / delta.length_squared())
                    .clamp(0., 1.)
            } else {
                0.
            };
            let closest = self.vehicle.previous + delta * t;
            let dist = if is_bus {
                (e.position.x - closest.x).abs() + (e.position.y - closest.y).abs()
            } else {
                e.position.distance(closest)
            };
            if dist > radius {
                continue;
            }
            let mut collected = false;
            match e.shape.as_str() {
                "coin1" | "coin2" | "coin3" => {
                    self.collected += 1;
                    self.score += 1000 * self.difficulty as i32;
                    effects.push("coin.aif");
                    collected = true;
                }
                "point" | "binary" | "heart" => {
                    self.score += 500;
                    if !is_bus && e.shape == "point" {
                        self.collected += 1
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
                    self.vehicle.turbo = if is_bus { 500 } else { 200 };
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
                    self.slow = 200;
                    effects.push("bonustimewarp.aif");
                    collected = true;
                }
                "racer" => {
                    if self.hit_cooldown == 0 {
                        self.vehicle.velocity *= 0.6;
                        self.vehicle.damage += 15.;
                        effects.push("hovercrash.aif");
                        self.hit_cooldown = 25
                    }
                }
                "jelly" | "bulldozer" => {
                    if self.vehicle.speed < 30. && self.mode != 2 {
                        caught = true
                    } else {
                        self.vehicle.velocity *= 0.9;
                    }
                }
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
        if is_bus && self.mode != 0 && !self.world.targets.is_empty() {
            let e = &self.world.entities[self.target];
            if e.position.truncate().distance(self.vehicle.pos.truncate()) < 550.
                && self.vehicle.speed < 1.
            {
                let old_name = ["arnold", "helga", "gerald", "grandpa"][self.passenger];
                let mut transition = self.world.entities[self.target].clone();
                transition.shape = old_name.into();
                transition.model = old_name.into();
                transition.scale = if old_name == "grandpa" { 40. } else { 50. };
                transition.speed = 10.;
                transition.path_index = 1;
                let points: &[(f32, f32, f32)] = if self.carrying {
                    &[
                        (0., 50., -25.),
                        (0., -220., -25.),
                        (-100., -220., -100.),
                        (-250., -220., -100.),
                        (-260., -320., -100.),
                    ]
                } else {
                    &[
                        (-300., -220., -100.),
                        (-100., -220., -100.),
                        (0., -220., -25.),
                        (0., 150., -25.),
                    ]
                };
                let m = crate::collision::transform(self.vehicle.pos, self.vehicle.yaw, 100.);
                let height = if old_name == "grandpa" { 1.875 } else { 0.6125 };
                transition.path = points
                    .iter()
                    .map(|(x, y, z)| {
                        m.transform_point3(vec3(*x, *y, *z)) + Vec3::Z * height * transition.scale
                    })
                    .collect();
                transition.position = transition.path[0];
                transition.previous = transition.position;
                self.world.transitions = vec![transition];
                if self.carrying {
                    self.deliveries += 1;
                    self.passenger = (self.passenger + 1) % 4;
                    if self.passenger == self.driver {
                        self.passenger = (self.passenger + 1) % 4;
                    }
                }
                self.carrying = !self.carrying;
                self.sound("bonus.aif");
                self.next_target();
            }
        }
        if !is_bus {
            if self.mode == 1
                && self
                    .world
                    .entities
                    .iter()
                    .any(|e| e.active && e.shape == "racer" && e.lap > 1)
            {
                self.finish(false, "You did not collect all the envelopes in time.");
                return;
            }
            let gate = self
                .world
                .entities
                .iter()
                .find(|e| e.shape == "finishline")
                .map(|e| e.position)
                .unwrap_or(Vec3::ZERO);
            let mut progress = crate::rules::Progress {
                checkpoint: self.checkpoint,
                furthest: self.max_checkpoint,
            };
            if progress.update(
                &self.world.track,
                self.vehicle.previous,
                self.vehicle.pos,
                gate,
            ) {
                self.lap += 1;
                self.lap_times.push(self.clock);
                self.best_lap = self.lap_times.iter().copied().fold(f32::INFINITY, f32::min);
                self.score += crate::rules::lap_bonus(self.clock, self.difficulty);
                self.clock = 0.;
                self.sound("bonus.aif");
            }
            self.checkpoint = progress.checkpoint;
            self.max_checkpoint = progress.furthest;
            if self.mode == 1 && self.collected >= [0, 5, 10, 15][self.difficulty as usize] {
                self.finish(true, "EMAILS RESCUED!");
                return;
            }
            let laps = if self.mode == 0 { 2 } else { 1 };
            if self.mode != 1 && self.lap > laps {
                let rank = self.world.rank(self.checkpoint, self.lap, self.vehicle.pos);
                self.finish(true, &format!("FINISHED IN POSITION {rank}"));
                return;
            }
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
                    index: i,
                    pos: e.position,
                    yaw: e.rotation,
                    lap: e.lap,
                    tilt: e.tilt,
                });
            }
        }
        Frame {
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
    fn apply_frame(&mut self, f: &Frame) {
        self.vehicle.previous = self.vehicle.pos;
        self.vehicle.previous_yaw = self.vehicle.yaw;
        self.vehicle.pos = f.pos;
        self.vehicle.yaw = f.yaw;
        self.vehicle.travel_yaw = f.yaw;
        self.vehicle.pitch = f.pitch;
        self.vehicle.roll = f.roll;
        self.vehicle.speed = f.speed;
        self.vehicle.jumping = f.jumping;
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
        );
        let alpha = (self.accumulator * self.tick_rate()).clamp(0., 1.);
        self.renderer.doors_open = self.screen == Screen::Target && self.target_step > 1;
        self.renderer.draw(
            &self.assets,
            &self.world,
            &self.vehicle,
            alpha,
            menu,
            get_time() as f32,
        );
        crate::ui::draw(self);
    }
}
