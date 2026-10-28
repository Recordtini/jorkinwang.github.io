//! Groove subobject position, scale and compressed Euler keyframes.
use macroquad::prelude::*;
#[derive(Clone, Debug, Default)]
pub struct Animation {
    pub ends: Vec<usize>,
    pub parents: Vec<i32>,
    pub positions: Vec<Vec<(f32, Vec3)>>,
    pub scales: Vec<Vec<(f32, Vec3)>>,
    pub rotations: Vec<Vec<(f32, Quat)>>,
}
fn u32be(b: &[u8], p: usize) -> Result<u32, String> {
    Ok(u32::from_be_bytes(
        b.get(p..p + 4)
            .ok_or("Truncated animation word")?
            .try_into()
            .unwrap(),
    ))
}
fn f32be(b: &[u8], p: usize) -> Result<f32, String> {
    Ok(f32::from_bits(u32be(b, p)?))
}
impl Animation {
    pub fn parse(chunks: &std::collections::HashMap<[u8; 4], &[u8]>) -> Result<Self, String> {
        let mut a = Self::default();
        if let Some(b) = chunks.get(b"soPL") {
            for p in (0..b.len()).step_by(4) {
                a.ends.push(u32be(b, p)? as usize)
            }
        }
        if let Some(b) = chunks.get(b"soHi") {
            for p in (0..b.len()).step_by(4) {
                a.parents.push(u32be(b, p)? as i32)
            }
        }
        let n = a.parents.len();
        for (tag, target) in [(b"soPF", &mut a.positions), (b"soSF", &mut a.scales)] {
            if let Some(b) = chunks.get(tag) {
                let mut p = 4;
                for _ in 0..n {
                    let count = u32be(b, p)? as usize;
                    p += 4;
                    if count > 100000 {
                        return Err("Unreasonable keyframe count".into());
                    }
                    let mut keys = vec![];
                    for _ in 0..count {
                        let frame = f32be(b, p)?;
                        let v = vec3(f32be(b, p + 4)?, f32be(b, p + 8)?, f32be(b, p + 12)?);
                        keys.push((frame, v));
                        p += 16
                    }
                    target.push(keys)
                }
            }
        }
        if let Some(b) = chunks.get(b"soRF") {
            let mut p = 4;
            for _ in 0..n {
                let count = u32be(b, p)? as usize;
                p += 4;
                if count > 100000 {
                    return Err("Unreasonable rotation count".into());
                }
                let mut keys = vec![];
                for _ in 0..count {
                    let frame = f32be(b, p)?;
                    p += 4;
                    let mut e = [0.; 3];
                    for v in &mut e {
                        *v = i16::from_be_bytes(
                            b.get(p..p + 2)
                                .ok_or("Truncated rotation")?
                                .try_into()
                                .unwrap(),
                        ) as f32
                            * std::f32::consts::TAU
                            / 65536.;
                        p += 2
                    }
                    keys.push((frame, Quat::from_euler(EulerRot::XYZ, e[0], e[1], e[2])))
                }
                a.rotations.push(keys)
            }
        }
        Ok(a)
    }
    pub fn animated(&self) -> bool {
        !self.positions.is_empty() || !self.rotations.is_empty()
    }
    pub fn group(&self, primitive: usize) -> usize {
        self.ends
            .iter()
            .enumerate()
            .find(|(_, end)| **end >= primitive)
            .map(|(i, _)| i)
            .unwrap_or(0)
    }
    pub fn matrices(&self, frame: f32) -> Vec<Mat4> {
        let n = self.parents.len();
        if !self.animated() {
            return vec![Mat4::IDENTITY; n.max(1)];
        }
        let mut result = vec![None; n];
        let mut visiting = vec![false; n];
        for i in 0..n {
            self.matrix(i, frame, &mut result, &mut visiting);
        }
        // Skeletal exports retain their Y-up hierarchy, while Groove's world is Z-up.
        // Static subobjects (all parents -1) are already authored in world axes.
        let basis = if self.parents.iter().any(|p| *p >= 0) {
            Mat4::from_rotation_x(std::f32::consts::FRAC_PI_2)
        } else {
            Mat4::IDENTITY
        };
        result
            .into_iter()
            .map(|m| basis * m.unwrap_or(Mat4::IDENTITY))
            .collect()
    }
    fn matrix(
        &self,
        i: usize,
        frame: f32,
        result: &mut [Option<Mat4>],
        visiting: &mut [bool],
    ) -> Mat4 {
        if let Some(m) = result[i] {
            return m;
        }
        if visiting[i] {
            return Mat4::IDENTITY;
        }
        visiting[i] = true;
        let p = self
            .positions
            .get(i)
            .map(|k| sample_vec(k, frame, Vec3::ZERO))
            .unwrap_or(Vec3::ZERO);
        let scale = self
            .scales
            .get(i)
            .map(|k| sample_vec(k, frame, Vec3::ONE))
            .unwrap_or(Vec3::ONE);
        let rot = self
            .rotations
            .get(i)
            .map(|k| sample_quat(k, frame))
            .unwrap_or(Quat::IDENTITY);
        let mut m = Mat4::from_scale_rotation_translation(scale, rot, p);
        let parent = self.parents[i];
        if parent >= 0 && (parent as usize) < result.len() && parent as usize != i {
            m = self.matrix(parent as usize, frame, result, visiting) * m
        }
        visiting[i] = false;
        result[i] = Some(m);
        m
    }
}
fn pair<T>(keys: &[(f32, T)], frame: f32) -> Option<(usize, usize, f32)> {
    if keys.is_empty() {
        return None;
    }
    let hi = keys.partition_point(|(f, _)| *f <= frame);
    if hi == 0 {
        return Some((0, 0, 0.));
    }
    if hi >= keys.len() {
        return Some((keys.len() - 1, keys.len() - 1, 0.));
    }
    let lo = hi - 1;
    let dt = keys[hi].0 - keys[lo].0;
    Some((
        lo,
        hi,
        if dt > 0. {
            (frame - keys[lo].0) / dt
        } else {
            0.
        },
    ))
}
fn sample_vec(keys: &[(f32, Vec3)], frame: f32, default: Vec3) -> Vec3 {
    pair(keys, frame)
        .map(|(a, b, t)| keys[a].1.lerp(keys[b].1, t))
        .unwrap_or(default)
}
fn sample_quat(keys: &[(f32, Quat)], frame: f32) -> Quat {
    pair(keys, frame)
        .map(|(a, b, t)| keys[a].1.slerp(keys[b].1, t))
        .unwrap_or(Quat::IDENTITY)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn child_keyframes_inherit_parent_motion() {
        let a = Animation {
            parents: vec![-1, 0],
            positions: vec![
                vec![(0., Vec3::ZERO), (10., Vec3::X * 10.)],
                vec![(0., Vec3::Y * 2.)],
            ],
            ..Default::default()
        };
        let p = a.matrices(5.)[1].transform_point3(Vec3::ZERO);
        assert!(p.distance(vec3(5., 0., 2.)) < 1e-5)
    }
}
