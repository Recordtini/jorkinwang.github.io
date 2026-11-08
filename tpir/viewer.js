// TPIR stage viewer: the wasm engine parses the stage archive/scene/models; WebGL draws them with an orbit camera.
const STAGES = { bigwheel: ['bigwheel', 'bigwheel_stage'], showcase: ['showcase', 'showcase_stage'],
  crowd: ['contestantrowtest', 'constestantrow_crowdavatars_stage'], front: ['contestantrowtest', 'constestantrow_front_stage'] };
const cv = document.getElementById('c'), gl = cv.getContext('webgl2', { antialias: true });
const info = document.getElementById('info'), sel = document.getElementById('stage');
for (const k in STAGES) sel.add(new Option(k, k));
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {});
const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const bytes = async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer());
const VS = `#version 300 es
in vec3 p; in vec3 n; in vec2 t; uniform mat4 mvp; uniform mat4 model; out vec3 vn; out vec2 vt;
void main(){ vn = mat3(model)*n; vt = t; gl_Position = mvp*vec4(p,1.0); }`;
const FS = `#version 300 es
precision highp float; in vec3 vn; in vec2 vt; uniform sampler2D tex; uniform vec3 diff; uniform float hasTex; out vec4 o;
void main(){ vec3 N = normalize(vn); float l = 0.55 + 0.45*max(dot(N, normalize(vec3(0.3,0.8,0.5))), 0.0);
  vec4 c = hasTex > 0.5 ? texture(tex, vt) : vec4(1.0); if (c.a < 0.05) discard; o = vec4(c.rgb*diff*l*1.7, c.a); }`;
const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
const U = (n) => gl.getUniformLocation(pr, n);
let draws = [], bounds = null, texCache = new Map(), gcam = null;
function camAt(name, t) { const nb = new TextEncoder().encode(name), p = ex.tp_camera(put(nb), nb.length, t); return p ? new Float32Array(mem().slice(p, p + 32)) : null; }
const camSel = document.getElementById('cam');
const CAMS = { bigwheel: ['camera.cam', 'camera_closeup.cam'] };
async function loadTex(name) {
  if (!name) return null; if (texCache.has(name)) return texCache.get(name);
  const nb = new TextEncoder().encode(name), np = put(nb); const p = ex.tp_file(np, nb.length); const len = ex.tp_file_len();
  let t = null;
  if (p) { const img = await createImageBitmap(new Blob([new Uint8Array(mem(), p, len).slice()], { type: 'image/png' }));
    t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); }
  texCache.set(name, t); return t;
}
async function load(key) {
  const [d, s] = STAGES[key]; const dir = await bytes(`stage/${d}/${s}.dir`), scn = await bytes(`stage/${d}/${s}.scn`);
  const n = ex.tp_stage_load(put(dir), dir.length, put(scn), scn.length); if (n < 0) { info.textContent = 'load failed'; return; }
  draws = []; texCache.clear(); let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) {
    const hp = ex.tp_draw_info(i); const h = new Float32Array(mem().slice(hp, hp + 96)); const vc = h[19], ic = h[20];
    const vp = ex.tp_draw_verts(i); const verts = new Float32Array(mem().slice(vp, vp + vc * 32)); const ip = ex.tp_draw_indices(i); const idx = new Uint16Array(mem().slice(ip, ip + ic * 2));
    const tp = ex.tp_draw_texture(i); let tn = ''; for (let k = tp; new Uint8Array(mem())[k]; k++) tn += String.fromCharCode(new Uint8Array(mem())[k]);
    const m = h.slice(0, 16);
    for (let v = 0; v < vc; v++) { const x = verts[v*8], y = verts[v*8+1], z = verts[v*8+2];
      const X = x*m[0]+y*m[4]+z*m[8]+m[12], Y = x*m[1]+y*m[5]+z*m[9]+m[13], Z = x*m[2]+y*m[6]+z*m[10]+m[14];
      lo = [Math.min(lo[0], X), Math.min(lo[1], Y), Math.min(lo[2], Z)]; hi = [Math.max(hi[0], X), Math.max(hi[1], Y), Math.max(hi[2], Z)]; }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    for (const [loc, nm, sz, off] of [[0, 'p', 3, 0], [1, 'n', 3, 12], [2, 't', 2, 24]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, 32, off); }
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    draws.push({ vao, count: ic, m, diff: h.slice(16, 19), tex: await loadTex(tn), tn });
  }
  camSel.replaceChildren(new Option('orbit', '')); for (const c of (CAMS[key] || [])) { const nm = `database/stage/${STAGES[key][0]}/${c}`; if (camAt(nm, 0)) camSel.add(new Option(c, nm)); }
  camSel.onchange = () => { gcam = camSel.value ? { name: camSel.value, duration: camAt(camSel.value, 0)[7], useAnim: true } : null; };
  bounds = { lo, hi }; info.textContent = `${n} draws`; cam.reset(); const q = new URLSearchParams(location.hash.slice(1)); if (q.get('yaw')) cam.yaw = +q.get('yaw'); if (q.get('pitch')) cam.pitch = +q.get('pitch'); if (q.get('dist')) cam.dist *= +q.get('dist'); if (q.get('cx')) cam.c = [+q.get('cx'), +q.get('cy'), +q.get('cz')];
}
const cam = { yaw: 0.6, pitch: 0.35, dist: 1, c: [0, 0, 0], reset() { const { lo, hi } = bounds; this.c = lo.map((v, i) => (v + hi[i]) / 2); this.dist = Math.hypot(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) * 0.9; } };
let drag = null; cv.onpointerdown = (e) => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); };
cv.onpointermove = (e) => { if (!drag) return; cam.yaw -= (e.clientX - drag[0]) * 0.01; cam.pitch = Math.max(-1.4, Math.min(1.4, cam.pitch + (e.clientY - drag[1]) * 0.01)); drag = [e.clientX, e.clientY]; };
cv.onpointerup = () => drag = null; cv.onwheel = (e) => { cam.dist *= Math.exp(e.deltaY * 0.001); e.preventDefault(); };
const mul = (a, b) => { const o = new Float32Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+c] * b[r*4+k]; o[r*4+c] = s; } return o; }; // column-major a*b
function persp(f, a, n, fr) { const t = 1 / Math.tan(f / 2); return new Float32Array([t/a,0,0,0, 0,t,0,0, 0,0,(fr+n)/(n-fr),-1, 0,0,2*fr*n/(n-fr),0]); }
function look(e, c, up) { const z = e.map((v, i) => v - c[i]); let l = Math.hypot(...z); z.forEach((_, i) => z[i] /= l);
  const x = [up[1]*z[2]-up[2]*z[1], up[2]*z[0]-up[0]*z[2], up[0]*z[1]-up[1]*z[0]]; l = Math.hypot(...x); x.forEach((_, i) => x[i] /= l);
  const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]), -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]), -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1]); }
function frame() {
  requestAnimationFrame(frame); const dpr = devicePixelRatio || 1, w = cv.clientWidth * dpr | 0, h = cv.clientHeight * dpr | 0;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } gl.viewport(0, 0, w, h);
  gl.clearColor(0.05, 0.05, 0.08, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
  if (document.getElementById('cull').checked) { gl.enable(gl.CULL_FACE); gl.frontFace(gl.CCW); } else gl.disable(gl.CULL_FACE);
  if (!draws.length) return;
  // world is Z-up; view it with Z up (right-handed reading of the numbers); optional X flip for the D3D left-handed convention
  const fx = document.getElementById('flipx').checked ? -1 : 1;
  let e, tg, fov = 0.9;
  if (gcam) { const t = (performance.now() / 1000 * 30) % Math.max(gcam.duration, 1); const q = camAt(gcam.name, gcam.useAnim ? t : 0); e = [q[0], q[1], -q[2]]; tg = [q[3], q[4], -q[5]]; fov = q[6] * Math.PI / 180; }
  else { tg = [cam.c[0], cam.c[1], -cam.c[2]]; e = [tg[0] + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw), tg[1] + cam.dist * Math.sin(cam.pitch), tg[2] + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)]; }
  const view = look(e, tg, [0, 1, 0]), proj = persp(fov, w / h, 0.05, 200);
  const flip = new Float32Array([fx,0,0,0, 0,1,0,0, 0,0,-1,0, 0,0,0,1]);
  for (const d of draws) {
    // model matrix is row-major with translation in row 3 => GL column-major identical memory layout when treated as column-major
    const mdl = mul(flip, d.m); gl.uniformMatrix4fv(U('model'), false, mdl); gl.uniformMatrix4fv(U('mvp'), false, mul(proj, mul(view, mdl)));
    gl.uniform3fv(U('diff'), d.diff); gl.uniform1f(U('hasTex'), (d.tex && !location.hash.includes('notex')) ? 1 : 0);
    if (d.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, d.tex); gl.uniform1i(U('tex'), 0); }
    gl.bindVertexArray(d.vao); gl.drawElements(gl.TRIANGLES, d.count, gl.UNSIGNED_SHORT, 0);
  }
}
sel.onchange = () => load(sel.value); document.getElementById('flipx').onchange = () => {};
await load('bigwheel'); frame(); window.__ready = true; window.__draws = draws;
