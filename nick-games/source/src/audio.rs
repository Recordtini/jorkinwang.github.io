//! Original six sound channels, with explicit ownership of looping playback.
use std::collections::HashMap;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Channel {
    HeroEffect,
    Music,
    Hero,
    Effect,
    Voice,
    Dozer,
}
impl Channel {
    fn index(self) -> usize {
        self as usize
    }
}
#[derive(Clone, Debug, PartialEq)]
pub enum Command {
    Play {
        name: String,
        looped: bool,
        gain: f32,
    },
    Stop(String),
    Gain {
        name: String,
        gain: f32,
    },
}
#[derive(Clone, Debug)]
struct Voice {
    name: String,
    gain: f32,
}
#[derive(Default)]
pub struct Mixer {
    voices: [Option<Voice>; 6],
}
impl Mixer {
    pub fn set(
        &mut self,
        channel: Channel,
        name: &str,
        looped: bool,
        gain: f32,
        restart: bool,
    ) -> Vec<Command> {
        let slot = &mut self.voices[channel.index()];
        if let Some(old) = slot
            && old.name == name
            && !restart
        {
            if (old.gain - gain).abs() > 0.0001 {
                old.gain = gain;
                return vec![Command::Gain {
                    name: name.into(),
                    gain,
                }];
            }
            return vec![];
        }
        let mut out = Vec::new();
        if let Some(old) = slot.take() {
            out.push(Command::Stop(old.name));
        }
        if !name.is_empty() {
            *slot = Some(Voice {
                name: name.into(),
                gain,
            });
            out.push(Command::Play {
                name: name.into(),
                looped,
                gain,
            });
        }
        out
    }
    pub fn gain(&mut self, channel: Channel, gain: f32) -> Vec<Command> {
        let Some(voice) = self.voices[channel.index()].as_mut() else {
            return Vec::new();
        };
        if (voice.gain - gain).abs() < 0.0001 {
            return Vec::new();
        }
        voice.gain = gain;
        vec![Command::Gain {
            name: voice.name.clone(),
            gain,
        }]
    }
    pub fn stop(&mut self, channel: Channel) -> Vec<Command> {
        self.set(channel, "", false, 0., false)
    }
    pub fn stop_gameplay(&mut self) -> Vec<Command> {
        [Channel::HeroEffect, Channel::Hero, Channel::Dozer]
            .into_iter()
            .flat_map(|c| self.stop(c))
            .collect()
    }
    pub fn music(&mut self, name: &str, loops: &HashMap<String, bool>, gain: f32) -> Vec<Command> {
        self.set(
            Channel::Music,
            name,
            loops.get(name).copied().unwrap_or(false),
            gain,
            false,
        )
    }
    pub fn refresh_music(
        &mut self,
        name: &str,
        loops: &HashMap<String, bool>,
        gain: f32,
        allowed: bool,
    ) -> Vec<Command> {
        if !allowed {
            self.stop(Channel::Music)
        } else if loops.get(name).copied().unwrap_or(false) || self.has_music() {
            self.music(name, loops, gain)
        } else {
            Vec::new()
        }
    }
    pub fn has_music(&self) -> bool {
        self.voices[Channel::Music.index()].is_some()
    }
}
pub fn bus_engine(speed: f32) -> String {
    if speed == 0. {
        "idle.aif".into()
    } else {
        format!(
            "engine{}.aif",
            (speed.abs() / 20.).round().clamp(1., 5.) as u8
        )
    }
}
pub fn dozer_gain(distance: f32) -> f32 {
    (400. - distance * 0.075).round().clamp(0., 255.) / 255.
}

/// gHeroDrive.engineSound: a turbo pickup owns the boosted loop.
/// Space alone increases throttle/grip slip but does not select turbo audio.
pub fn hover_engine(speed: f32, turbo: i32) -> &'static str {
    if speed == 0. {
        ""
    } else if turbo > 0 {
        "turbo.aif"
    } else {
        "hoverengine.aif"
    }
}

/// SoundControl.cameraVolume: source Manhattan-distance falloff, then -100.
pub fn hover_gain(distance: f32) -> f32 {
    ((255. - 255. / 90000. * distance).min(255.) - 100.).max(10.) / 255.
}
