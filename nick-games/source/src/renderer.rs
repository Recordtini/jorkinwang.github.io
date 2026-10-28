use crate::{
    assets::Assets,
    collision::transform,
    model::Model,
    physics::{Kind, Vehicle},
    world::World,
};
use macroquad::{
    miniquad::{
        BlendFactor, BlendState, BlendValue, Comparison, CullFace, Equation, PipelineParams,
    },
    prelude::*,
};
use std::collections::HashMap;
struct Batches {
    meshes: Vec<(usize, Mesh)>,
}
pub struct Renderer {
    models: HashMap<String, Batches>,
    material: Material,
    sky_material: Material,
    terrain_material: Material,
    translucent_material: Material,
    pub camera_position: Vec3,
    pub camera_target: Vec3,
    pub camera_mode: u8,
    pub smooth: bool,
    pub filtering: bool,
    pub widescreen: bool,
    pub distance: f32,
    pub driver: String,
    pub doors_open: bool,
    last_filter: bool,
    pub bus_camera: Option<crate::bus_camera::BusCamera>,
}
fn compile(model: &Model, a: &Assets) -> Batches {
    let mut groups: HashMap<(usize, String), Mesh> = HashMap::new();
    for face in &model.faces {
        if face.texture.starts_with("empty") {
            continue;
        }
        let mesh = groups
            .entry((face.group, face.texture.clone()))
            .or_insert_with(|| Mesh {
                vertices: vec![],
                indices: vec![],
                texture: a.texture(&face.texture).cloned(),
            });
        for i in 1..face.indices.len() - 1 {
            let tri = [0, i, i + 1];
            let normal = (model.vertices[face.indices[i]] - model.vertices[face.indices[0]])
                .cross(model.vertices[face.indices[i + 1]] - model.vertices[face.indices[0]])
                .normalize_or_zero();
            let shade = 0.78 + 0.22 * normal.z.abs();
            let color = Color::new(shade, shade, shade, 1.);
            for k in tri {
                let n = mesh.vertices.len() as u16;
                mesh.vertices.push(Vertex::new2(
                    model.vertices[face.indices[k]],
                    face.uv[k],
                    color,
                ));
                mesh.indices.push(n);
            }
        }
    }
    let mut meshes = Vec::new();
    for ((group, _), mesh) in groups {
        // Macroquad's default index buffer holds 5,000 indices. Keep complete
        // triangles in bounded batches so later parts of the circuit are retained.
        for vertices in mesh.vertices.chunks(3000) {
            meshes.push((
                group,
                Mesh {
                    vertices: vertices.to_vec(),
                    indices: (0..vertices.len() as u16).collect(),
                    texture: mesh.texture.clone(),
                },
            ));
        }
    }
    Batches { meshes }
}
const VS: &str = r#"#version 100
attribute vec3 position;attribute vec2 texcoord;attribute vec4 color0;
uniform mat4 Model;uniform mat4 Projection;varying highp vec2 uv;varying lowp vec4 color;
void main(){gl_Position=Projection*Model*vec4(position,1.0);uv=texcoord;color=color0/255.0;}"#;
const FS: &str = r#"#version 100
precision mediump float;varying highp vec2 uv;varying lowp vec4 color;uniform sampler2D Texture;
void main(){vec4 t=texture2D(Texture,fract(uv));if(t.a<0.15)discard;gl_FragColor=t*color;}"#;
impl Renderer {
    pub fn new(a: &Assets) -> Result<Self, String> {
        let models = a
            .models
            .iter()
            .map(|(name, m)| (name.clone(), compile(m, a)))
            .collect();
        let material = load_material(
            ShaderSource::Glsl {
                vertex: VS,
                fragment: FS,
            },
            MaterialParams {
                pipeline_params: PipelineParams {
                    depth_test: Comparison::LessOrEqual,
                    depth_write: true,
                    color_blend: Some(BlendState::new(
                        Equation::Add,
                        BlendFactor::Value(BlendValue::SourceAlpha),
                        BlendFactor::OneMinusValue(BlendValue::SourceAlpha),
                    )),
                    ..Default::default()
                },
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?;
        let sky_material = load_material(
            ShaderSource::Glsl {
                vertex: VS,
                fragment: FS,
            },
            MaterialParams {
                pipeline_params: PipelineParams {
                    depth_test: Comparison::Always,
                    depth_write: false,
                    ..Default::default()
                },
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?;
        let terrain_material = load_material(
            ShaderSource::Glsl {
                vertex: VS,
                fragment: FS,
            },
            MaterialParams {
                pipeline_params: PipelineParams {
                    depth_test: Comparison::LessOrEqual,
                    depth_write: true,
                    cull_face: CullFace::Back,
                    ..Default::default()
                },
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?;
        let translucent_material = load_material(
            ShaderSource::Glsl {
                vertex: VS,
                fragment: FS,
            },
            MaterialParams {
                pipeline_params: PipelineParams {
                    depth_test: Comparison::LessOrEqual,
                    depth_write: false,
                    color_blend: Some(BlendState::new(
                        Equation::Add,
                        BlendFactor::Value(BlendValue::SourceAlpha),
                        BlendFactor::OneMinusValue(BlendValue::SourceAlpha),
                    )),
                    ..Default::default()
                },
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?;
        Ok(Self {
            sky_material,
            terrain_material,
            translucent_material,
            models,
            material,
            camera_position: vec3(0., 1800., 1000.),
            camera_target: Vec3::ZERO,
            camera_mode: 0,
            smooth: true,
            filtering: false,
            widescreen: false,
            distance: 1.,
            driver: "arnold".into(),
            doors_open: false,
            last_filter: true,
            bus_camera: None,
        })
    }
    fn draw_model(&self, a: &Assets, name: &str, matrix: Mat4, frame: f32) {
        let n = name.to_lowercase();
        if let Some(batches) = self
            .models
            .get(&n)
            .or_else(|| self.models.get(&format!("{n}.3gm")))
        {
            let transforms = a
                .model(name)
                .map(|m| m.animation.matrices(frame))
                .unwrap_or_default();
            for (group, mesh) in &batches.meshes {
                let m = matrix * transforms.get(*group).copied().unwrap_or(Mat4::IDENTITY);
                unsafe { get_internal_gl().quad_gl.push_model_matrix(m) }
                if self.doors_open && n == "arnoldbus" && mesh.texture.as_ref() == a.texture("busd")
                {
                    let open = Mesh {
                        vertices: mesh.vertices.clone(),
                        indices: mesh.indices.clone(),
                        texture: a.texture("busdempty").cloned(),
                    };
                    draw_mesh(&open);
                } else {
                    draw_mesh(mesh);
                }
                unsafe { get_internal_gl().quad_gl.pop_model_matrix() }
            }
        }
    }
    pub fn reset_camera(&mut self, v: &Vehicle) {
        if v.kind == Kind::Bus {
            let rig = crate::bus_camera::BusCamera::reset(v, self.camera_mode);
            self.camera_position = rig.position;
            self.camera_target = rig.target;
            self.bus_camera = Some(rig);
            return;
        }
        let dist = if v.kind == Kind::Bus { 600. } else { 1000. };
        self.camera_position = v.pos - v.forward() * dist + Vec3::Z * dist * 0.45;
        self.camera_target = v.pos;
    }
    pub fn tick_bus_camera(&mut self, w: &World, v: &Vehicle) {
        if v.kind == Kind::Bus {
            if self.bus_camera.is_none() {
                self.reset_camera(v);
            }
            if let Some(rig) = &mut self.bus_camera {
                rig.tick(v, &w.collision, self.camera_mode);
            }
        }
    }
    pub fn draw(&mut self, a: &Assets, w: &World, v: &Vehicle, alpha: f32, menu: bool, clock: f32) {
        let filter = if self.filtering {
            FilterMode::Linear
        } else {
            FilterMode::Nearest
        };
        if self.last_filter != self.filtering {
            for tex in a.textures.values() {
                tex.set_filter(filter)
            }
            self.last_filter = self.filtering;
        }
        let position = if self.smooth {
            v.previous.lerp(v.pos, alpha)
        } else {
            v.pos
        };
        let yaw = if self.smooth {
            v.previous_yaw + angle_delta(v.previous_yaw, v.yaw) * alpha
        } else {
            v.yaw
        };
        let forward = vec3(yaw.to_radians().sin(), -yaw.to_radians().cos(), 0.);
        let base = if v.kind == Kind::Bus { 600. } else { 1000. };
        let distance = base * self.distance * if self.camera_mode == 1 { 2. } else { 1. };
        let (eye, target) = if self.camera_mode == 2 && !menu {
            (
                position + Vec3::Z * 90. + forward * 80.,
                position + forward * 1500.,
            )
        } else if self.camera_mode == 3 {
            (
                position + vec3(0., 0., distance * 3.),
                position + Vec3::new(0., -1., 0.),
            )
        } else if menu {
            let a = clock * 0.08;
            (
                position + vec3(a.sin() * distance * 2., a.cos() * distance * 2., distance),
                position,
            )
        } else {
            (
                position - forward * distance
                    + Vec3::Z
                        * distance
                        * if v.kind == Kind::Bus {
                            0.2
                        } else {
                            (if self.camera_mode == 1 {
                                25_f32
                            } else {
                                40_f32
                            })
                            .to_radians()
                            .sin()
                        },
                position + forward * 120.,
            )
        };
        if v.kind == Kind::Bus && !menu {
            if let Some(rig) = &self.bus_camera {
                self.camera_position = if self.smooth {
                    rig.previous.lerp(rig.position, alpha)
                } else {
                    rig.position
                };
                self.camera_target = if self.smooth {
                    rig.previous_target.lerp(rig.target, alpha)
                } else {
                    rig.target
                };
            }
        } else {
            let lerp = if self.smooth {
                1. - (-get_frame_time().min(0.1) * 8.).exp()
            } else {
                1.
            };
            self.camera_position = self.camera_position.lerp(eye, lerp);
            self.camera_target = self.camera_target.lerp(target, lerp);
            if !menu
                && self.camera_mode != 2
                && let Some(hit) = w
                    .collision
                    .segment(self.camera_target + Vec3::Z * 100., self.camera_position)
                && hit.fraction < 0.98
            {
                self.camera_position = hit.pos + hit.normal * 60.;
            }
        }
        let (sw, sh) = (screen_width(), screen_height());
        let viewport = if self.widescreen {
            None
        } else {
            let ratio = 600. / 320.;
            let width = (sh * ratio).min(sw);
            let height = width / ratio;
            Some((
                ((sw - width) / 2.) as i32,
                ((sh - height) / 2.) as i32,
                width as i32,
                height as i32,
            ))
        };
        clear_background(if v.kind == Kind::Bus {
            Color::from_rgba(90, 140, 230, 255)
        } else {
            Color::from_rgba(16, 4, 48, 255)
        });
        let aspect = viewport
            .map(|(_, _, w, h)| w as f32 / h as f32)
            .unwrap_or(sw / sh);
        set_camera(&Camera3D {
            position: self.camera_position,
            target: self.camera_target,
            up: if self.camera_mode == 3 {
                vec3(0., -1., 0.)
            } else {
                Vec3::Z
            },
            fovy: (2.
                * (((if v.kind == Kind::Bus { 90_f32 } else { 120_f32 }).to_radians() / 2.).tan()
                    / aspect)
                    .atan()),
            viewport,
            aspect: Some(aspect),
            z_near: 10.,
            z_far: if v.kind == Kind::Bus { 40000. } else { 600000. },
            ..Default::default()
        });
        gl_use_material(&self.sky_material);
        if v.kind == Kind::Hover {
            self.draw_model(
                a,
                "fopglobe",
                transform(self.camera_position, 0., 10000.),
                clock * 20.,
            )
        }
        if v.kind == Kind::Bus {
            self.draw_model(a, "skydome", transform(self.camera_position, 0., 5.), 0.);
        }
        gl_use_material(&self.terrain_material);
        for name in &w.terrain {
            self.draw_model(
                a,
                name,
                transform(
                    Vec3::ZERO,
                    0.,
                    if v.kind == Kind::Bus { 150. } else { 12000. },
                ),
                0.,
            )
        }
        gl_use_material(&self.translucent_material);
        if let Some(hit) = w.collision.ground(position, 600., 20000.) {
            let size = if v.kind == Kind::Bus {
                vec2(210., 480.)
            } else {
                vec2(450., 450.)
            };
            let m = transform(hit.pos + Vec3::Z * 5., yaw, 100.);
            let mut corners = [
                vec3(-size.x / 2., -size.y / 2., 0.),
                vec3(size.x / 2., -size.y / 2., 0.),
                vec3(size.x / 2., size.y / 2., 0.),
                vec3(-size.x / 2., size.y / 2., 0.),
            ];
            for p in &mut corners {
                *p = m.transform_point3(*p);
                if hit.normal.z.abs() > 0.1 {
                    p.z = hit.pos.z + 5.
                        - (hit.normal.x * (p.x - hit.pos.x) + hit.normal.y * (p.y - hit.pos.y))
                            / hit.normal.z;
                }
            }
            let color = if v.kind == Kind::Bus {
                Color::new(0., 0., 0., 0.25)
            } else {
                WHITE
            };
            let tex = if v.kind == Kind::Bus {
                None
            } else {
                a.texture("shadowsquare.l").cloned()
            };
            draw_mesh(&Mesh {
                vertices: corners
                    .iter()
                    .zip([vec2(0., 0.), vec2(1., 0.), vec2(1., 1.), vec2(0., 1.)])
                    .map(|(p, uv)| Vertex::new2(*p, uv, color))
                    .collect(),
                indices: vec![0, 1, 2, 0, 2, 3],
                texture: tex,
            });
        }
        if v.kind == Kind::Hover && v.speed > 10. {
            self.draw_model(
                a,
                "trail",
                transform(position - forward * 270. - Vec3::Z * 10., yaw, 240.),
                0.,
            );
        }
        for p in &w.particles {
            let right = (self.camera_target - self.camera_position)
                .cross(Vec3::Z)
                .normalize_or_zero()
                * p.size
                * 0.5;
            let up = Vec3::Z * p.size * 0.5;
            let color = Color::new(1., 1., 1., p.life as f32 / 20.);
            draw_mesh(&Mesh {
                vertices: vec![
                    Vertex::new2(p.position - right - up, vec2(0., 1.), color),
                    Vertex::new2(p.position + right - up, vec2(1., 1.), color),
                    Vertex::new2(p.position + right + up, vec2(1., 0.), color),
                    Vertex::new2(p.position - right + up, vec2(0., 0.), color),
                ],
                indices: vec![0, 1, 2, 0, 2, 3],
                texture: a
                    .texture("collectsp.add")
                    .or_else(|| a.texture("pointsp.t"))
                    .cloned(),
            });
        }
        gl_use_material(&self.material);
        for (entity_index, e) in w.entities.iter().enumerate() {
            if e.shape == "target" && w.selected_target != Some(entity_index) {
                continue;
            }
            if !e.active {
                continue;
            }
            if e.position.distance(position) > if v.kind == Kind::Bus { 30000. } else { 100000. } {
                continue;
            }
            let mut rotation = e.rotation;
            if e.shape.starts_with("coin") {
                rotation += clock * 60.
            }
            if !e.model.is_empty() {
                let frame = match e.model.as_str() {
                    "arnold" | "gerald" | "helga" => {
                        48. + (clock * 30.).rem_euclid(if e.model == "helga" { 17. } else { 13. })
                    }
                    "grandpa" => 48. + (clock * 30.).rem_euclid(15.),
                    "nickfopbaddie" => 1. + (clock * 20.).rem_euclid(40.),
                    _ => 0.,
                };
                self.draw_model(
                    a,
                    &e.model,
                    transform(e.previous.lerp(e.position, alpha), rotation, e.scale)
                        * Mat4::from_rotation_x(e.tilt.to_radians()),
                    frame,
                );
            } else if !e.sprite.is_empty()
                && let Some(t) = a.texture(&e.sprite)
            {
                let p = e.position
                    + Vec3::Z * (clock * 3.).sin() * if v.kind == Kind::Bus { 20. } else { 100. };
                let size = if v.kind == Kind::Bus { e.scale } else { 1000. };
                let right = (self.camera_target - self.camera_position)
                    .cross(Vec3::Z)
                    .normalize_or_zero()
                    * size
                    * 0.5;
                let up = Vec3::Z * size * 0.5;
                let mesh = Mesh {
                    vertices: vec![
                        Vertex::new2(p - right - up, vec2(0., 1.), WHITE),
                        Vertex::new2(p + right - up, vec2(1., 1.), WHITE),
                        Vertex::new2(p + right + up, vec2(1., 0.), WHITE),
                        Vertex::new2(p - right + up, vec2(0., 0.), WHITE),
                    ],
                    indices: vec![0, 1, 2, 0, 2, 3],
                    texture: Some(t.clone()),
                };
                draw_mesh(&mesh);
            }
        }
        for e in &w.transitions {
            self.draw_model(
                a,
                &e.model,
                transform(e.position, e.rotation, e.scale),
                if e.path_index < e.path.len() {
                    48. + (clock * 30.).rem_euclid(13.)
                } else {
                    26. + (clock * 30.).rem_euclid(18.)
                },
            );
        }
        if let Some(e) = &w.passenger {
            self.draw_model(
                a,
                &e.model,
                transform(e.position, e.rotation, e.scale),
                26. + (clock * 30.).rem_euclid(18.),
            );
        }
        let name = if v.kind == Kind::Bus {
            "arnoldbus"
        } else {
            "timmy"
        };
        let scale = if v.kind == Kind::Bus { 200. } else { 240. };
        let mut matrix = transform(position, yaw, scale)
            * Mat4::from_rotation_x(v.pitch.to_radians())
            * Mat4::from_rotation_y(v.roll.to_radians());
        if v.kind == Kind::Bus
            && let Some(m) = a.model(name)
        {
            matrix *= Mat4::from_translation(-(m.min + m.max) / 2.);
        }
        if self.camera_mode != 2 || menu {
            self.draw_model(
                a,
                name,
                matrix,
                if v.kind == Kind::Hover {
                    if v.jumping {
                        200.
                    } else {
                        5. + (clock * 20.).rem_euclid(35.)
                    }
                } else {
                    0.
                },
            )
        }
        if v.kind == Kind::Bus && self.camera_mode != 2 {
            let angle = yaw.to_radians();
            let local = vec3(
                35.,
                -200.,
                if self.driver == "grandpa" {
                    5.
                } else if self.driver == "helga" {
                    -5.
                } else {
                    0.625
                },
            );
            let offset = vec3(
                local.x * angle.cos() - local.y * angle.sin(),
                local.x * angle.sin() + local.y * angle.cos(),
                local.z,
            );
            self.draw_model(
                a,
                &self.driver,
                transform(position + offset, yaw, 50.),
                if self.driver == "grandpa" { 67. } else { 2. },
            );
        }
        gl_use_default_material();
        set_default_camera();
        if !self.widescreen
            && let Some((x, y, w, h)) = viewport
        {
            draw_rectangle(0., 0., x as f32, sh, BLACK);
            draw_rectangle((x + w) as f32, 0., sw - (x + w) as f32, sh, BLACK);
            draw_rectangle(0., 0., sw, y as f32, BLACK);
            draw_rectangle(0., (y + h) as f32, sw, sh - (y + h) as f32, BLACK);
        }
    }
}
fn angle_delta(a: f32, b: f32) -> f32 {
    (b - a + 180.).rem_euclid(360.) - 180.
}
