use crate::model::Model;
use macroquad::prelude::*;
use std::collections::{HashMap, HashSet};
#[derive(Clone, Debug)]
pub struct Triangle {
    pub a: Vec3,
    pub b: Vec3,
    pub c: Vec3,
    pub normal: Vec3,
    pub texture: String,
    pub object: usize,
}
#[derive(Clone, Debug)]
pub struct Hit {
    pub pos: Vec3,
    pub normal: Vec3,
    pub texture: String,
    pub object: usize,
    pub fraction: f32,
}
pub struct CollisionWorld {
    pub triangles: Vec<Triangle>,
    cells: HashMap<(i32, i32), Vec<usize>>,
    cell: f32,
    disabled: HashSet<usize>,
}
pub fn transform(pos: Vec3, angle: f32, scale: f32) -> Mat4 {
    Mat4::from_translation(pos)
        * Mat4::from_rotation_z(angle.to_radians())
        * Mat4::from_scale(Vec3::splat(scale / 100.))
}
impl CollisionWorld {
    pub fn new(cell: f32) -> Self {
        Self {
            triangles: vec![],
            cells: HashMap::new(),
            cell,
            disabled: HashSet::new(),
        }
    }
    pub fn add(&mut self, model: &Model, m: Mat4, object: usize) {
        for f in &model.faces {
            if f.texture.starts_with("empty") || f.texture.starts_with("shadow") {
                continue;
            }
            for i in 1..f.indices.len() - 1 {
                let a = m.transform_point3(model.vertices[f.indices[0]]);
                let b = m.transform_point3(model.vertices[f.indices[i]]);
                let c = m.transform_point3(model.vertices[f.indices[i + 1]]);
                let normal = (b - a).cross(c - a).normalize_or_zero();
                if normal.length_squared() < 0.1 {
                    continue;
                }
                let index = self.triangles.len();
                let low = a.min(b).min(c) / self.cell;
                let high = a.max(b).max(c) / self.cell;
                for x in low.x.floor() as i32..=high.x.floor() as i32 {
                    for y in low.y.floor() as i32..=high.y.floor() as i32 {
                        self.cells.entry((x, y)).or_default().push(index)
                    }
                }
                self.triangles.push(Triangle {
                    a,
                    b,
                    c,
                    normal,
                    texture: f.texture.clone(),
                    object,
                });
            }
        }
    }
    pub fn disable(&mut self, object: usize) {
        self.disabled.insert(object);
    }
    pub fn segment(&self, from: Vec3, to: Vec3) -> Option<Hit> {
        self.segment_where(from, to, |_| true)
    }
    pub fn walls(&self, from: Vec3, to: Vec3) -> Option<Hit> {
        self.segment_where(from, to, |t| {
            t.normal.z.abs() <= 0.65 && t.texture != "finish" && t.texture != "ramp"
        })
    }
    fn segment_where(
        &self,
        from: Vec3,
        to: Vec3,
        accept: impl Fn(&Triangle) -> bool,
    ) -> Option<Hit> {
        let dir = to - from;
        let min = from.min(to) / self.cell;
        let max = from.max(to) / self.cell;
        let mut best = 1.00001;
        let mut found = None;
        for x in min.x.floor() as i32..=max.x.floor() as i32 {
            for y in min.y.floor() as i32..=max.y.floor() as i32 {
                if let Some(list) = self.cells.get(&(x, y)) {
                    for &i in list {
                        let t = &self.triangles[i];
                        if self.disabled.contains(&t.object) || !accept(t) {
                            continue;
                        }
                        let e1 = t.b - t.a;
                        let e2 = t.c - t.a;
                        let p = dir.cross(e2);
                        let det = e1.dot(p);
                        if det.abs() < 1e-7 {
                            continue;
                        }
                        let inv = 1. / det;
                        let s = from - t.a;
                        let u = s.dot(p) * inv;
                        if !(-1e-5..=1.00001).contains(&u) {
                            continue;
                        }
                        let q = s.cross(e1);
                        let v = dir.dot(q) * inv;
                        if v < -1e-5 || u + v > 1.00001 {
                            continue;
                        }
                        let f = e2.dot(q) * inv;
                        if (0.00001..=1.).contains(&f) && f < best {
                            best = f;
                            let mut normal = t.normal;
                            if normal.dot(dir) > 0. {
                                normal = -normal
                            }
                            found = Some(Hit {
                                pos: from + dir * f,
                                normal,
                                texture: t.texture.clone(),
                                object: t.object,
                                fraction: f,
                            });
                        }
                    }
                }
            }
        }
        found
    }
    pub fn ground(&self, p: Vec3, up: f32, down: f32) -> Option<Hit> {
        self.segment_where(p + Vec3::Z * up, p - Vec3::Z * down, |t| {
            t.normal.z.abs() > 0.1
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn swept_collision_and_floor_do_not_depend_on_triangle_winding() {
        let m = Model {
            vertices: vec![vec3(-10., -10., 0.), vec3(10., -10., 0.), vec3(0., 10., 0.)],
            faces: vec![crate::model::Face {
                indices: vec![0, 1, 2],
                uv: vec![Vec2::ZERO; 3],
                texture: "road".into(),
                group: 0,
            }],
            min: vec3(-10., -10., 0.),
            max: vec3(10., 10., 0.),
            animation: Default::default(),
        };
        let mut w = CollisionWorld::new(5.);
        w.add(&m, Mat4::IDENTITY, 7);
        let h = w.segment(vec3(0., 0., 5.), vec3(0., 0., -5.)).unwrap();
        assert!((h.fraction - 0.5).abs() < 1e-5);
        assert_eq!(h.object, 7);
        assert!(h.normal.z > 0.9);
        assert!(w.ground(vec3(40., 0., 1.), 2., 4.).is_none());
    }
}
