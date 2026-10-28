//! The original Groove 3DGM data is decoded in Rust. No Director runtime is used.
use macroquad::prelude::*;
use std::collections::HashMap;
#[derive(Clone, Debug)]
pub struct Face {
    pub indices: Vec<usize>,
    pub uv: Vec<Vec2>,
    pub texture: String,
    pub group: usize,
}
#[derive(Clone, Debug)]
pub struct Model {
    pub vertices: Vec<Vec3>,
    pub faces: Vec<Face>,
    pub min: Vec3,
    pub max: Vec3,
    pub animation: crate::animation::Animation,
}
fn word(b: &[u8], p: usize) -> Result<u32, String> {
    Ok(u32::from_be_bytes(
        b.get(p..p + 4)
            .ok_or("Truncated 3DGM word")?
            .try_into()
            .unwrap(),
    ))
}
impl Model {
    pub fn parse(b: &[u8]) -> Result<Self, String> {
        if b.get(..4) != Some(b"3DGM") {
            return Err("Invalid 3DGM signature".into());
        }
        let mut chunks = HashMap::new();
        let mut offset = 12;
        let mut vertices = Vec::new();
        let mut prims = Vec::new();
        let mut names = HashMap::new();
        while offset + 8 <= b.len() {
            let tag = &b[offset..offset + 4];
            let n = word(b, offset + 4)? as usize;
            if n > b.len() - offset - 8 {
                break;
            } // Director may append cast padding after End.
            let data = &b[offset + 8..offset + 8 + n];
            chunks.insert(<[u8; 4]>::try_from(tag).unwrap(), data);
            match tag {
                b"FDot" => {
                    if !n.is_multiple_of(12) {
                        return Err("Misaligned FDot array".into());
                    }
                    for p in (0..n).step_by(12) {
                        vertices.push(vec3(
                            f32::from_bits(word(data, p)?),
                            f32::from_bits(word(data, p + 4)?),
                            f32::from_bits(word(data, p + 8)?),
                        ));
                    }
                }
                b"Prim" => {
                    if !n.is_multiple_of(4) {
                        return Err("Misaligned Prim array".into());
                    }
                    let mut p = 0;
                    while p + 4 <= n {
                        let tag = word(data, p)?;
                        if tag == 0xffff_fffe {
                            break;
                        }
                        let header = match tag {
                            0x780d => 13,
                            0x470e => 14,
                            _ => return Err(format!("Unknown primitive tag {tag:x} at {p}")),
                        };
                        let mut end = p + header * 4;
                        while end + 4 <= n && word(data, end)? != u32::MAX {
                            end += 4;
                        }
                        if end + 4 > n {
                            return Err("Unterminated primitive".into());
                        }
                        let r = (p..end)
                            .step_by(4)
                            .map(|i| word(data, i))
                            .collect::<Result<Vec<_>, _>>()?;
                        prims.push(r);
                        p = end + 4;
                    }
                }
                b"TxNm" => {
                    if n >= 2 {
                        let mut p = 2;
                        while p + 2 < n {
                            let id = u16::from_be_bytes(data[p..p + 2].try_into().unwrap()) as u32;
                            p += 2;
                            let end = data[p..]
                                .iter()
                                .position(|x| *x == 0)
                                .map(|i| p + i)
                                .unwrap_or(n);
                            names.insert(id, String::from_utf8_lossy(&data[p..end]).to_lowercase());
                            p = end + 1;
                        }
                    }
                }
                b"End " => break,
                _ => {}
            }
            offset += 8 + n;
        }
        if vertices.is_empty() {
            return Err("Model has no vertices".into());
        }
        if vertices.iter().any(|v| !v.is_finite()) {
            return Err("Nonfinite vertex".into());
        }
        let animation = crate::animation::Animation::parse(&chunks)?;
        let mut faces = Vec::new();
        for (primitive, r) in prims.into_iter().enumerate() {
            let extra = match r[0] {
                0x780d => 0,
                0x470e => 1,
                _ => continue,
            };
            let start = 13 + extra;
            if r.len() < start + 3 {
                continue;
            }
            let refs = if extra == 1
                || [r[10], r[11], r[12]]
                    .iter()
                    .any(|i| *i as usize >= vertices.len())
            {
                [
                    r[start] as usize,
                    r[start + 1] as usize,
                    r[start + 2] as usize,
                ]
            } else {
                [r[10] as usize, r[11] as usize, r[12] as usize]
            };
            if refs.iter().any(|i| *i >= vertices.len()) {
                return Err("UV reference index outside vertex array".into());
            }
            let indices: Vec<_> = r[start..].iter().map(|v| *v as usize).collect();
            if indices.iter().any(|i| *i >= vertices.len()) {
                return Err("Face index outside vertex array".into());
            }
            let uv0 = vec2(r[4 + extra] as i32 as f32, r[7 + extra] as i32 as f32) / 256.;
            let uv1 = vec2(r[5 + extra] as i32 as f32, r[8 + extra] as i32 as f32) / 256.;
            let uv2 = vec2(r[6 + extra] as i32 as f32, r[9 + extra] as i32 as f32) / 256.;
            let a = vertices[refs[0]];
            let e1 = vertices[refs[1]] - a;
            let e2 = vertices[refs[2]] - a;
            let d00 = e1.dot(e1);
            let d01 = e1.dot(e2);
            let d11 = e2.dot(e2);
            let det = d00 * d11 - d01 * d01;
            let uv = indices
                .iter()
                .map(|i| {
                    let d = vertices[*i] - a;
                    if det.abs() < 1e-12 {
                        return uv0;
                    }
                    let v = (d11 * d.dot(e1) - d01 * d.dot(e2)) / det;
                    let w = (d00 * d.dot(e2) - d01 * d.dot(e1)) / det;
                    uv0 + (uv1 - uv0) * v + (uv2 - uv0) * w
                })
                .collect();
            faces.push(Face {
                indices,
                uv,
                group: animation.group(primitive),
                texture: names.get(&r[3]).cloned().unwrap_or_default(),
            });
        }
        let min = vertices
            .iter()
            .copied()
            .fold(Vec3::splat(f32::INFINITY), Vec3::min);
        let max = vertices
            .iter()
            .copied()
            .fold(Vec3::splat(f32::NEG_INFINITY), Vec3::max);
        Ok(Self {
            vertices,
            faces,
            min,
            max,
            animation,
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::Pack;
    #[test]
    fn primitive_header_all_ones_does_not_split_the_skeleton() {
        let p = Pack::open();
        let m = Model::parse(p.get("stupor-highway/models/timmy.3gm").unwrap()).unwrap();
        assert_eq!(m.faces.len(), 599);
        assert_eq!(m.faces.iter().filter(|f| f.group == 0).count(), 22);
        assert_eq!(m.faces.iter().filter(|f| f.group == 23).count(), 5);
    }
    #[test]
    fn model_textures_resolve_to_original_cast_members() {
        let p = Pack::open();
        for game in ["runaway-bus", "stupor-highway"] {
            let m: crate::assets::Manifest =
                serde_json::from_slice(p.get(&format!("{game}/manifest.json")).unwrap()).unwrap();
            let mut missing = std::collections::BTreeSet::new();
            for f in m.models.values() {
                let model = Model::parse(p.get(&format!("{game}/{}", f.file)).unwrap()).unwrap();
                for face in model.faces {
                    let n = face.texture;
                    if n.is_empty() || n.starts_with("empty") {
                        continue;
                    }
                    if ![
                        n.clone(),
                        format!("{n}.t"),
                        format!("{n}.s"),
                        format!("{n}.l"),
                    ]
                    .iter()
                    .any(|n| m.textures.contains_key(n))
                    {
                        missing.insert(n);
                    }
                }
            }
            assert!(
                missing.is_empty(),
                "{game}: unresolved textures {missing:?}"
            );
        }
    }
    #[test]
    fn every_original_model_has_valid_geometry() {
        let pack = Pack::open();
        let mut total = 0;
        for game in ["runaway-bus", "stupor-highway"] {
            let m: crate::assets::Manifest =
                serde_json::from_slice(pack.get(&format!("{game}/manifest.json")).unwrap())
                    .unwrap();
            for (name, f) in m.models {
                let model = Model::parse(pack.get(&format!("{game}/{}", f.file)).unwrap())
                    .unwrap_or_else(|e| panic!("{name}: {e}"));
                assert!(!model.faces.is_empty(), "{name}");
                total += 1;
            }
        }
        assert_eq!(total, 60);
    }
}
