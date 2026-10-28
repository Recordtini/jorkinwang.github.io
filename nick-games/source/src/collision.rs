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
    moving: Vec<Triangle>,
    velocities: HashMap<usize, Vec2>,
    cells: HashMap<(i32, i32), Vec<usize>>,
    cell: f32,
    disabled: HashSet<usize>,
    breakable: HashSet<usize>,
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
            moving: Vec::new(),
            velocities: HashMap::new(),
            cells: HashMap::new(),
            cell,
            disabled: HashSet::new(),
            breakable: HashSet::new(),
        }
    }
    fn model_triangles(model: &Model, matrix: Mat4, object: usize) -> Vec<Triangle> {
        let bones = model.animation.matrices(0.);
        let mut triangles = Vec::new();
        for face in &model.faces {
            // Invisible "empty" faces are authored collision hulls on props
            // and roadblocks. Rendering transparency does not disable contact.
            if face.texture.starts_with("shadow") {
                continue;
            }
            let m = matrix * bones.get(face.group).copied().unwrap_or(Mat4::IDENTITY);
            for [ia, ib, ic] in model.triangulate(face) {
                let a = m.transform_point3(model.vertices[face.indices[ia]]);
                let b = m.transform_point3(model.vertices[face.indices[ib]]);
                let c = m.transform_point3(model.vertices[face.indices[ic]]);
                let normal = (b - a).cross(c - a).normalize_or_zero();
                if normal.length_squared() < 0.1 {
                    continue;
                }
                triangles.push(Triangle {
                    a,
                    b,
                    c,
                    normal,
                    texture: face.texture.clone(),
                    object,
                });
            }
        }
        triangles
    }
    pub fn add(&mut self, model: &Model, m: Mat4, object: usize) {
        for triangle in Self::model_triangles(model, m, object) {
            let index = self.triangles.len();
            let low = triangle.a.min(triangle.b).min(triangle.c) / self.cell;
            let high = triangle.a.max(triangle.b).max(triangle.c) / self.cell;
            for x in low.x.floor() as i32..=high.x.floor() as i32 {
                for y in low.y.floor() as i32..=high.y.floor() as i32 {
                    self.cells.entry((x, y)).or_default().push(index);
                }
            }
            self.triangles.push(triangle);
        }
    }
    pub fn clear_moving(&mut self) {
        self.moving.clear();
        self.velocities.clear();
    }
    pub fn add_moving(&mut self, model: &Model, m: Mat4, object: usize) {
        self.moving.extend(Self::model_triangles(model, m, object));
    }
    pub fn set_velocity(&mut self, object: usize, velocity: Vec2) {
        self.velocities.insert(object, velocity);
    }
    pub fn velocity(&self, object: usize) -> Option<Vec2> {
        self.velocities.get(&object).copied()
    }
    pub fn mark_breakable(&mut self, object: usize) {
        self.breakable.insert(object);
    }
    pub fn is_breakable(&self, object: usize) -> bool {
        self.breakable.contains(&object)
    }
    pub fn disable(&mut self, object: usize) {
        self.disabled.insert(object);
    }
    pub fn segment(&self, from: Vec3, to: Vec3) -> Option<Hit> {
        self.segment_where(from, to, |_| true, true)
    }
    pub fn segment_except(&self, from: Vec3, to: Vec3, object: usize) -> Option<Hit> {
        self.segment_where(from, to, |t| t.object != object, true)
    }
    pub fn segment_object(&self, from: Vec3, to: Vec3, object: usize) -> Option<Hit> {
        self.segment_where(from, to, |t| t.object == object, true)
    }
    pub fn segment_static(&self, from: Vec3, to: Vec3) -> Option<Hit> {
        self.segment_where(from, to, |_| true, false)
    }
    pub fn walls(&self, from: Vec3, to: Vec3) -> Option<Hit> {
        self.segment_where(
            from,
            to,
            |t| t.normal.z.abs() <= 0.65 && t.texture != "finish" && t.texture != "ramp",
            true,
        )
    }
    fn candidates(&self, from: Vec3, to: Vec3, margin: f32, moving: bool) -> Vec<&Triangle> {
        let low = (from.min(to) - Vec3::splat(margin)) / self.cell;
        let high = (from.max(to) + Vec3::splat(margin)) / self.cell;
        let mut seen = HashSet::new();
        let mut result = Vec::new();
        for x in low.x.floor() as i32..=high.x.floor() as i32 {
            for y in low.y.floor() as i32..=high.y.floor() as i32 {
                if let Some(list) = self.cells.get(&(x, y)) {
                    for &i in list {
                        if seen.insert(i) {
                            result.push(&self.triangles[i]);
                        }
                    }
                }
            }
        }
        if moving {
            result.extend(self.moving.iter());
        }
        result
    }
    fn segment_where(
        &self,
        from: Vec3,
        to: Vec3,
        accept: impl Fn(&Triangle) -> bool,
        moving: bool,
    ) -> Option<Hit> {
        let dir = to - from;
        let mut best = 1.00001;
        let mut found = None;
        for t in self.candidates(from, to, 0., moving) {
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
                    normal = -normal;
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
        found
    }
    pub fn ground(&self, p: Vec3, up: f32, down: f32) -> Option<Hit> {
        self.segment_where(
            p + Vec3::Z * up,
            p - Vec3::Z * down,
            |t| t.normal.z.abs() > 0.1,
            false,
        )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn post() -> Model {
        Model {
            vertices: vec![
                vec3(35., -300., 0.),
                vec3(45., -300., 0.),
                vec3(45., -300., 200.),
                vec3(35., -300., 200.),
            ],
            faces: vec![crate::model::Face {
                indices: vec![0, 1, 2, 3],
                uv: vec![Vec2::ZERO; 4],
                texture: "wall".into(),
                group: 0,
            }],
            min: vec3(35., -300., 0.),
            max: vec3(45., -300., 200.),
            animation: Default::default(),
        }
    }
    #[test]
    fn moving_collision_follows_the_current_visible_object() {
        let mut world = CollisionWorld::new(500.);
        world.add_moving(&post(), Mat4::IDENTITY, 7);
        assert!(
            world
                .segment(vec3(40., 0., 100.), vec3(40., -500., 100.))
                .is_some()
        );
        world.clear_moving();
        world.add_moving(&post(), Mat4::from_translation(vec3(500., 0., 0.)), 7);
        assert!(
            world
                .segment(vec3(40., 0., 100.), vec3(40., -500., 100.))
                .is_none()
        );
        assert_eq!(
            world
                .segment(vec3(540., 0., 100.), vec3(540., -500., 100.))
                .unwrap()
                .object,
            7
        );
    }
    #[test]
    fn collision_uses_the_same_subobject_transform_as_rendering() {
        let mut model = post();
        model.animation.parents = vec![-1];
        model.animation.positions = vec![vec![(0., vec3(500., 0., 0.))]];
        let mut world = CollisionWorld::new(500.);
        world.add(&model, Mat4::IDENTITY, 7);
        assert!(
            world
                .segment(vec3(40., 0., 100.), vec3(40., -500., 100.))
                .is_none()
        );
        assert!(
            world
                .segment(vec3(540., 0., 100.), vec3(540., -500., 100.))
                .is_some()
        );
    }
    #[test]
    fn segment_collision_and_floor_do_not_depend_on_triangle_winding() {
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
