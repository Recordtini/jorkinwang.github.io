// WebGL renderer for a TPIR stage (Y-up left-handed world, drawn with Z negated). Draw hooks let a game transform parts.
export class StageView {
  constructor(canvas, ex, opts = {}) {
    this.cv = canvas; this.ex = ex; this.transparent = !!opts.transparent; this.gl = canvas.getContext('webgl2', this.transparent ? { antialias: true, alpha: true, premultipliedAlpha: false } : { antialias: true }); this.draws = []; this.texCache = new Map();
    const gl = this.gl;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
    const VS = `#version 300 es
in vec3 p; in vec3 n; in vec2 t; uniform mat4 mvp; uniform mat4 model; out vec3 vn; out vec2 vt; out vec3 wp;
void main(){ vn = mat3(model)*n; vt = t; wp = (model*vec4(p,1.0)).xyz; gl_Position = mvp*vec4(p,1.0); }`;
    const FS = `#version 300 es
precision highp float; in vec3 vn; in vec2 vt; in vec3 wp; uniform sampler2D tex; uniform vec3 diff; uniform float hasTex; uniform float mode;
uniform vec3 spotPos; uniform vec3 spotDir; uniform vec2 spotCos; uniform float ambient; uniform float useSpot; out vec4 o;
void main(){ vec3 N = normalize(vn); float l;
  if (useSpot > 0.5) { vec3 L = normalize(spotPos - wp); float s = smoothstep(spotCos.y, spotCos.x, dot(-L, spotDir)); l = ambient + (1.0 - ambient) * s * (0.55 + 0.45 * max(dot(N, L), 0.0)); }   // .lgt spot (cone 43/45 deg, ambient 0.392)
  else l = 0.55 + 0.45*max(dot(N, normalize(vec3(0.3,0.8,0.5))), 0.0);
  vec4 c = hasTex > 0.5 ? texture(tex, vt) : vec4(1.0); if (c.a < 0.05) discard;
  o = mode > 0.5 ? vec4(c.rgb * c.a * 1.6, 1.0) : vec4(c.rgb*diff*l*1.7, c.a); }`;
    this.pr = gl.createProgram(); gl.attachShader(this.pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(this.pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(this.pr); gl.useProgram(this.pr);
    this.U = (n) => gl.getUniformLocation(this.pr, n);
  }
  mem() { return this.ex.memory.buffer; }
  put(b) { const p = this.ex.tp_alloc(b.length); new Uint8Array(this.mem(), p, b.length).set(b); return p; }
  async loadTex(name) {
    const { gl, ex } = this; if (!name) return null; if (this.texCache.has(name)) return this.texCache.get(name);
    const nb = new TextEncoder().encode(name), np = this.put(nb); const p = ex.tp_file(np, nb.length); const len = ex.tp_file_len(); let t = null;
    if (p) { const img = await createImageBitmap(new Blob([new Uint8Array(this.mem(), p, len).slice()], { type: 'image/png' }));
      t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); }
    this.texCache.set(name, t); return t;
  }
  /** `.lgt` spot light (180 bytes LE, EVIDENCE spotlight.lgt): mat4, colour(1,1,1,0), (1, inner 43deg, outer 45deg, 1), pos xyz, dir xyz, 1, ambient 0.392 x3. */
  loadLight(path) { const nb = new TextEncoder().encode(path), p = this.ex.tp_file(this.put(nb), nb.length); if (!p) return; const f = new Float32Array(this.mem().slice(p, p + this.ex.tp_file_len()));
    const D = Math.PI / 180; if (f[22] < 10 || f[22] - f[21] < 0.25) { this.spot = null; return; }   // degenerate cone (e.g. the Contestants' Row stages: inner == outer == ~1 deg): not a spot; keep the default lighting
    this.spot = { pos: [f[24], f[25], -f[26]], dir: [f[27], f[28], -f[29]], cos: [Math.cos(f[21] * D), Math.cos(f[22] * D)], ambient: f[31] }; }
  async load(dirBytes, scnBytes) {
    const { gl, ex } = this; const n = ex.tp_stage_load(this.put(dirBytes), dirBytes.length, this.put(scnBytes), scnBytes.length); if (n < 0) throw new Error('stage load failed');
    this.draws = []; this.texCache.clear(); let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) {
      const hp = ex.tp_draw_info(i); const h = new Float32Array(this.mem().slice(hp, hp + 96)); const vc = h[19], ic = h[20];
      const vp = ex.tp_draw_verts(i); const verts = new Float32Array(this.mem().slice(vp, vp + vc * 32)); const ip = ex.tp_draw_indices(i); const idx = new Uint16Array(this.mem().slice(ip, ip + ic * 2));
      const tp = ex.tp_draw_texture(i); const mm = new Uint8Array(this.mem()); let tn = ''; for (let k = tp; mm[k]; k++) tn += String.fromCharCode(mm[k]);
      const m = h.slice(0, 16), partLo = [Infinity,Infinity,Infinity], partHi = [-Infinity,-Infinity,-Infinity];
      for (let v = 0; v < vc; v++) { const x = verts[v*8], y = verts[v*8+1], z = verts[v*8+2];
        const X = x*m[0]+y*m[4]+z*m[8]+m[12], Y = x*m[1]+y*m[5]+z*m[9]+m[13], Z = x*m[2]+y*m[6]+z*m[10]+m[14];
        lo = [Math.min(lo[0], X), Math.min(lo[1], Y), Math.min(lo[2], Z)]; hi = [Math.max(hi[0], X), Math.max(hi[1], Y), Math.max(hi[2], Z)]; for (const [i,v] of [X,Y,Z].entries()) { partLo[i]=Math.min(partLo[i],v); partHi[i]=Math.max(partHi[i],v); } }
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      for (const [loc, sz, off] of [[0, 3, 0], [1, 3, 12], [2, 2, 24]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 32, off); }
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      const ap = ex.tp_draw_anim(i); let anim = null;   // .tan texture animation (lightanim_* bulbs, hologram lights): swap frames over time
      if (ap) { const m8 = new Uint8Array(this.mem()); let e = ap; while (m8[e]) e++; const a = JSON.parse(new TextDecoder().decode(m8.slice(ap, e))); anim = { fps: a.fps, start: a.start, tex: await Promise.all(a.frames.map((f) => this.loadTex(f))) }; }
      const mp = ex.tp_draw_model(i); const m8b = new Uint8Array(this.mem()); let mn = ''; for (let k = mp; m8b[k]; k++) mn += String.fromCharCode(m8b[k]);
      this.draws.push({ vao, count: ic, m, center: partLo.map((x,i)=>(x+partHi[i])/2), diff: h.slice(16, 19), tex: anim ? anim.tex[0] : await this.loadTex(tn), tn, anim, mn });
    }
    this.bounds = { lo, hi }; return n;
  }
  /** Project a model's origin (draw matrix translation, D3D world space) to canvas coordinates 0..800 x 0..600 with the same camera maths as render(). */
  project({ eye, target, fov = 0.9, near = 0.05, far = 200 }, p) {
    const w = this.cv.clientWidth || 800, h = this.cv.clientHeight || 600; const e = [eye[0], eye[1], -eye[2]], tg = [target[0], target[1], -target[2]];
    const view = look(e, tg, [0, 1, 0]), proj = persp(fov, w / h, near, far); const v = [p[0], p[1], -p[2], 1];   // row vector * flipZ
    const vv = [view[0] * v[0] + view[4] * v[1] + view[8] * v[2] + view[12], view[1] * v[0] + view[5] * v[1] + view[9] * v[2] + view[13], view[2] * v[0] + view[6] * v[1] + view[10] * v[2] + view[14], 1];
    const c = [proj[0] * vv[0] + proj[4] * vv[1] + proj[8] * vv[2] + proj[12], proj[1] * vv[0] + proj[5] * vv[1] + proj[9] * vv[2] + proj[13], proj[2] * vv[0] + proj[6] * vv[1] + proj[10] * vv[2] + proj[14], proj[3] * vv[0] + proj[7] * vv[1] + proj[11] * vv[2] + proj[15]];
    return c[3] > 0 ? [(c[0] / c[3] * 0.5 + 0.5) * 800, (1 - (c[1] / c[3] * 0.5 + 0.5)) * 600] : null;
  }
  camAt(name, t) { const nb = new TextEncoder().encode(name), p = this.ex.tp_camera(this.put(nb), nb.length, t); return p ? new Float32Array(this.mem().slice(p, p + 32)) : null; }
  /** Draw with eye/target/fov in D3D world space. `xform(draw)` may return a row-major 4x4 (applied before the model matrix) or null. */
  render({ eye, target, fov = 0.9, near = 0.05, far = 200, xform = null, cull = true, time = 0, filter = null, additiveFilter = null, alphaBlend = false, transparentSort = false }) {
    const { gl, cv } = this; const dpr = devicePixelRatio || 1, w = cv.clientWidth * dpr | 0, h = cv.clientHeight * dpr | 0;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } gl.viewport(0, 0, w, h);
    gl.clearColor(0.02, 0.02, 0.04, this.transparent ? 0 : 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    if (cull) { gl.enable(gl.CULL_FACE); gl.frontFace(gl.CCW); } else gl.disable(gl.CULL_FACE);
    const e = [eye[0], eye[1], -eye[2]], tg = [target[0], target[1], -target[2]];
    const view = look(e, tg, [0, 1, 0]), proj = persp(fov, w / h, near, far); const flipZ = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,-1,0, 0,0,0,1]);
    const sp = this.spot; gl.uniform1f(this.U('useSpot'), sp ? 1 : 0); if (sp) { gl.uniform3fv(this.U('spotPos'), sp.pos); gl.uniform3fv(this.U('spotDir'), sp.dir); gl.uniform2fv(this.U('spotCos'), sp.cos); gl.uniform1f(this.U('ambient'), sp.ambient); }
    const direction = target.map((v,i)=>v-eye[i]); const depth = d=>d.center.reduce((sum,v,i)=>sum+(v-eye[i])*direction[i],0);
    const draws = transparentSort ? [...this.draws].sort((a,b)=>depth(b)-depth(a)) : this.draws;
    for (const pass of [0, 1]) {   // pass 0: solid; pass 1: animated light sprites, additive, no depth write
    gl.uniform1f(this.U('mode'), pass); if (pass) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); } else if (alphaBlend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); if (transparentSort) gl.depthMask(false); }
    for (const d of draws) {
      const additive = !!d.anim && (!additiveFilter || additiveFilter(d));
      if (additive !== !!pass || (filter && !filter(d))) continue; let m = d.m; const x = xform && xform(d); if (x) m = rowmul(x, d.m);
      const mdl = mul(flipZ, m); gl.uniformMatrix4fv(this.U('model'), false, mdl); gl.uniformMatrix4fv(this.U('mvp'), false, mul(proj, mul(view, mdl)));
      gl.uniform3fv(this.U('diff'), d.diff); gl.uniform1f(this.U('hasTex'), d.tex ? 1 : 0);
      const tx = d.anim ? d.anim.tex[(d.anim.start + Math.floor(time * d.anim.fps)) % d.anim.tex.length] : d.tex;
      gl.uniform1f(this.U('hasTex'), tx ? 1 : 0); if (tx) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(this.U('tex'), 0); }
      gl.bindVertexArray(d.vao); gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_SHORT, 0);
    }
    if (pass || alphaBlend) { gl.disable(gl.BLEND); gl.depthMask(true); }
    }
  }
}
export const mul = (a, b) => { const o = new Float32Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+c] * b[r*4+k]; o[r*4+c] = s; } return o; };
export const rowmul = (a, b) => { const o = new Float32Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[r*4+k] * b[k*4+c]; o[r*4+c] = s; } return o; };
export function persp(f, a, n, fr) { const t = 1 / Math.tan(f / 2); return new Float32Array([t/a,0,0,0, 0,t,0,0, 0,0,(fr+n)/(n-fr),-1, 0,0,2*fr*n/(n-fr),0]); }
export function look(e, c, up) { const z = e.map((v, i) => v - c[i]); let l = Math.hypot(...z); z.forEach((_, i) => z[i] /= l);
  const x = [up[1]*z[2]-up[2]*z[1], up[2]*z[0]-up[0]*z[2], up[0]*z[1]-up[1]*z[0]]; l = Math.hypot(...x); x.forEach((_, i) => x[i] /= l);
  const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]), -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]), -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1]); }
