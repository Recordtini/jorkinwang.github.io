use crate::model::Model;
use macroquad::{
    audio::{Sound, load_sound_from_bytes},
    prelude::*,
};
use serde::Deserialize;
use std::collections::HashMap;

static PACK: &[u8] = include_bytes!("../assets.pak");
pub struct Pack {
    index: HashMap<String, [usize; 2]>,
    base: usize,
    bytes: Vec<u8>,
}
impl Pack {
    pub fn open() -> Self {
        use std::io::Read;
        assert_eq!(&PACK[..8], b"NICKZ001");
        let expected = u32::from_le_bytes(PACK[8..12].try_into().unwrap()) as usize;
        let mut bytes = Vec::with_capacity(expected);
        flate2::read::ZlibDecoder::new(&PACK[12..])
            .read_to_end(&mut bytes)
            .expect("Embedded asset archive");
        assert_eq!(bytes.len(), expected);
        assert_eq!(&bytes[..8], b"NICKPAK1");
        let n = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
        Self {
            index: serde_json::from_slice(&bytes[12..12 + n]).unwrap(),
            base: 12 + n,
            bytes,
        }
    }
    pub fn get(&self, name: &str) -> Option<&[u8]> {
        let [offset, len] = *self.index.get(name)?;
        self.bytes.get(self.base + offset..self.base + offset + len)
    }
}
#[derive(Deserialize)]
pub struct FileAsset {
    pub file: String,
}
#[derive(Deserialize)]
pub struct Manifest {
    pub models: HashMap<String, FileAsset>,
    pub textures: HashMap<String, FileAsset>,
    pub sounds: HashMap<String, FileAsset>,
    pub texts: HashMap<String, String>,
}
pub struct Assets {
    pub models: HashMap<String, Model>,
    pub textures: HashMap<String, Texture2D>,
    pub sounds: HashMap<String, Sound>,
    pub texts: HashMap<String, String>,
}
/// Extract the section 2 text from a Director XMED styled-text member.
fn xmed_plain_text(bytes: &[u8]) -> Option<String> {
    let marker = bytes.windows(5).position(|w| w == b"\x030002")?;
    let section = &bytes[marker + 5..];
    let start = section.iter().position(|b| *b == 0)? + 1;
    let field = &section[start..];
    let comma = field.iter().position(|b| *b == b',')?;
    let len = usize::from_str_radix(std::str::from_utf8(&field[..comma]).ok()?, 16).ok()?;
    let text = field.get(comma + 1..comma + 1 + len)?;
    Some(String::from_utf8_lossy(text).replace('\r', "\n"))
}
impl Assets {
    pub async fn load(game: &str) -> Result<Self, String> {
        let pack = Pack::open();
        let manifest: Manifest = serde_json::from_slice(
            pack.get(&format!("{game}/manifest.json"))
                .ok_or("Missing game manifest")?,
        )
        .map_err(|e| e.to_string())?;
        macroquad::logging::info!("Loading {game}");
        let mut models = HashMap::new();
        let mut textures = HashMap::new();
        let mut images = HashMap::new();
        let mut sounds = HashMap::new();
        for (name, f) in manifest.models {
            let b = pack
                .get(&format!("{game}/{}", f.file))
                .ok_or("Missing model")?;
            models.insert(
                name.clone(),
                Model::parse(b).map_err(|e| format!("{name}: {e}"))?,
            );
        }
        macroquad::logging::info!("Decoded {} models", models.len());
        for (name, f) in manifest.textures {
            let b = pack
                .get(&format!("{game}/{}", f.file))
                .ok_or("Missing texture")?;
            let image = Image::from_file_with_format(b, Some(ImageFormat::Png))
                .map_err(|e| e.to_string())?;
            images.insert(name, image);
        }
        // Combine color and mask before uploading; GPU readback is unnecessary.
        let masks: Vec<_> = images
            .keys()
            .filter(|n| n.ends_with(".s"))
            .cloned()
            .collect();
        for name in masks {
            let mask = format!("{}.a", &name[..name.len() - 2]);
            if let Some(alpha) = images.get(&mask).cloned()
                && let Some(image) = images.get_mut(&name)
                && image.width == alpha.width
                && image.height == alpha.height
            {
                for (p, a) in image
                    .bytes
                    .as_chunks_mut::<4>()
                    .0
                    .iter_mut()
                    .zip(alpha.bytes.as_chunks::<4>().0)
                {
                    p[3] = a[0];
                }
            }
        }
        for (name, mut image) in images {
            if (name.contains("sp") || name.ends_with(".t"))
                && !name.ends_with(".a")
                && !name.ends_with(".s")
                && image.bytes.len() >= 4
            {
                let key = [image.bytes[0], image.bytes[1], image.bytes[2]];
                for p in image.bytes.as_chunks_mut::<4>().0 {
                    if p[..3] == key {
                        p[3] = 0;
                    }
                }
            }
            if name.ends_with(".l") {
                for p in image.bytes.as_chunks_mut::<4>().0 {
                    let alpha = p[0].max(p[1]).max(p[2]);
                    *p = [0, 0, 0, alpha];
                }
            }
            if name.ends_with(".add") {
                for p in image.bytes.as_chunks_mut::<4>().0 {
                    p[3] = p[0].max(p[1]).max(p[2]);
                }
            }
            let texture = Texture2D::from_image(&image);
            texture.set_filter(FilterMode::Nearest);
            textures.insert(name, texture);
        }
        macroquad::logging::info!("Loading audio");
        for (name, f) in manifest.sounds {
            let b = pack
                .get(&format!("{game}/{}", f.file))
                .ok_or("Missing sound")?;
            sounds.insert(
                name,
                load_sound_from_bytes(b).await.map_err(|e| e.to_string())?,
            );
        }
        let mut texts = manifest.texts;
        if game == "runaway-bus"
            && let Some(data) = pack.get("runaway-bus/media/instructions3a")
            && let Some(copy) = xmed_plain_text(data)
        {
            texts.insert("instructions3a".into(), copy);
        }
        macroquad::logging::info!("Assets ready");
        Ok(Self {
            models,
            textures,
            sounds,
            texts,
        })
    }
    pub fn model(&self, name: &str) -> Option<&Model> {
        let n = name.to_lowercase();
        self.models
            .get(&n)
            .or_else(|| self.models.get(&format!("{n}.3gm")))
    }
    pub fn texture(&self, name: &str) -> Option<&Texture2D> {
        let n = name.to_lowercase();
        self.textures
            .get(&n)
            .or_else(|| self.textures.get(&format!("{n}.t")))
            .or_else(|| self.textures.get(&format!("{n}.s")))
            .or_else(|| self.textures.get(&format!("{n}.l")))
    }
}

#[cfg(test)]
mod text_tests {
    #[test]
    fn cruise_instructions_are_recovered_from_original_styled_member() {
        let pack = super::Pack::open();
        let bytes = pack.get("runaway-bus/media/instructions3a").unwrap();
        let text = super::xmed_plain_text(bytes).unwrap();
        assert!(text.starts_with("CRUISE MODE\n\n"));
        assert!(text.contains("The FutureTek Bulldozers are still there"));
        assert!(text.ends_with("then submit your score."));
    }
}
