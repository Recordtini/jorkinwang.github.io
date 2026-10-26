// WebGL pass for Shockwave 3D views: meshes, materials with up to three texture layers, lights.
const MAXL = 8;
const VS = `#version 300 es
in vec3 aPos; in vec3 aNrm; in vec2 aUv0; in vec2 aUv1;
uniform mat4 uM; uniform mat4 uV; uniform mat4 uP;
out vec3 wpos; out vec3 wn; out vec2 uv0; out vec2 uv1; out vec3 vpos;
void main(){
  vec4 w = uM * vec4(aPos, 1.0);
  wpos = w.xyz;
  wn = mat3(uM) * aNrm;
  uv0 = aUv0; uv1 = aUv1;
  vec4 v = uV * w; vpos = v.xyz;
  gl_Position = uP * v;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 wpos; in vec3 wn; in vec2 uv0; in vec2 uv1; in vec3 vpos;
uniform vec3 uAmb, uDif, uSpec, uEmi; uniform float uShin, uBlend; uniform int uFlags;
uniform int uNL; uniform int uLTex[3]; uniform int uLMode[3]; uniform int uLFunc[3]; uniform int uLSrc[3];
uniform float uLConst[3]; uniform vec3 uLX0[3]; uniform vec3 uLX1[3];
uniform sampler2D uT0; uniform sampler2D uT1; uniform sampler2D uT2;
uniform int uNLights; uniform int uLType[${MAXL}]; uniform vec3 uLCol[${MAXL}]; uniform vec3 uLDir[${MAXL}];
uniform vec3 uLPos[${MAXL}]; uniform vec3 uLAtt[${MAXL}]; uniform float uLSpot[${MAXL}];
uniform vec3 uCam; uniform float uGain; uniform float uLK; uniform int uDbg; uniform int uFlip;
out vec4 o;
vec4 sampleLayer(int i, vec2 uv) {
  // texture coordinates run v-up like OpenGL; image rows are stored top-down
  vec2 t = vec2(dot(uLX0[i], vec3(uv, 1.0)), dot(uLX1[i], vec3(uv, 1.0)));
  if (uFlip != 4) t.y = 1.0 - t.y;
  if (i == 0) return texture(uT0, t);
  if (i == 1) return texture(uT1, t);
  return texture(uT2, t);
}
void main(){
  vec3 N = normalize(wn);
  if ((uFlags & 1) != 0) N = normalize(cross(dFdx(wpos), dFdy(wpos)));
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - wpos);
  vec3 ambL = vec3(0.0), dif = vec3(0.0), spc = vec3(0.0);
  for (int i = 0; i < ${MAXL}; i++) {
    if (i >= uNLights || (uFlags & 4) != 0) break; // models outside the world (the arrow) get no world lighting
    int ty = uLType[i];
    if (ty == 0) { ambL += uLCol[i]; continue; }
    vec3 L; float att = 1.0;
    float sg = 1.0;
    // directional lights carry their intensity in the constant-attenuation slot; six of them are meant to add up to about one
    if (ty == 1) L = -uLDir[i]; // directional lights are not attenuated
    else {
      vec3 d = uLPos[i] - wpos; float dist = length(d); L = d / max(dist, 1e-4);
      att = 1.0 / max(uLAtt[i].x + uLAtt[i].y * dist + uLAtt[i].z * dist * dist, 1e-4);
      if (ty == 3) { float c = dot(-L, uLDir[i]); att *= step(cos(radians(uLSpot[i] * 0.5)), c); }
    }
    float nl = max(dot(N, L), 0.0);
    dif += uLCol[i] * nl * att;
    if (nl > 0.0 && uShin > 0.0) spc += uLCol[i] * pow(max(dot(N, normalize(L + V)), 0.0), uShin * 1.28) * att * sg;
  }
  vec4 t0 = vec4(1.0);
  if (uNL > 0 && uLTex[0] > 0) {
    vec2 uv = uv0;
    if (uLMode[0] == 4) { vec3 R = reflect(-V, N); vec3 vr = mat3(1.0) * R; uv = vr.xy * 0.5 + 0.5; }
    t0 = sampleLayer(0, uv);
  }
  vec3 difc = ((uFlags & 2) != 0 || uLTex[0] == 0) ? uDif : vec3(1.0);
  vec3 base = difc * t0.rgb;
  // fixed-function vertex lighting: the lit colour is clamped before it modulates the texture
  vec3 lit = clamp(uEmi + uAmb * ambL + difc * dif, 0.0, 1.0);
  vec3 col = clamp(lit * t0.rgb + uSpec * spc, 0.0, 1.0);
  float alpha = uBlend * t0.a;
  for (int i = 1; i < 3; i++) {
    if (i >= uNL || uLTex[i] == 0) continue;
    vec4 t = sampleLayer(i, (uLMode[i] == 4) ? (reflect(-V, N).xy * 0.5 + 0.5) : uv1);
    float w = (uLSrc[i] == 1) ? t.a : uLConst[i] / 100.0;
    int f = uLFunc[i];
    if (f == 0) col = t.rgb;
    else if (f == 1) col += t.rgb * w;
    else if (f == 2) col *= t.rgb;
    else col = mix(col, t.rgb, w);
  }
  if (uDbg == 1) col = base * 1.0;
  if (uDbg == 2) col = N * 0.5 + 0.5;
  if (uDbg == 3) col = vec3(dif);
  if (uDbg == 5) { col = vec3(1.0, 0.0, 0.0); alpha = 0.5; }
  o = vec4(col, alpha);
}`;

export class View3D {
  constructor(gl, mem, stageW, stageH) {
    this.gl = gl; this.mem = mem; this.sw = stageW; this.sh = stageH;
    const mk = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram();
    gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(pr, 0, 'aPos'); gl.bindAttribLocation(pr, 1, 'aNrm'); gl.bindAttribLocation(pr, 2, 'aUv0'); gl.bindAttribLocation(pr, 3, 'aUv1');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    this.pr = pr; this.u = {};
    const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(pr, i); const nm = a.name.replace(/\[0\]$/, ''); this.u[nm] = gl.getUniformLocation(pr, a.name); }
    this.meshes = new Map();
    this.white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    this.cam = [0, 0, 0];
  }
  meshUp(id, nv, ni, vp, ip) {
    const gl = this.gl;
    let m = this.meshes.get(id);
    if (!m) {
      m = { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer(), n: 0 };
      this.meshes.set(id, m);
    }
    gl.bindVertexArray(m.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.mem.buffer, vp, nv * 10), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.mem.buffer, ip, ni), gl.STATIC_DRAW);
    const st = 40;
    for (let a = 0; a < 4; a++) gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, st, 24);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, st, 32);
    m.n = ni;
    gl.bindVertexArray(null);
  }
  // returns index after the VIEW header
  setLayout(s, ox, oy) { this.ls = s; this.lox = ox; this.loy = oy; }
  begin(u32, f32, i, canvas) {
    const gl = this.gl, u = this.u;
    const x = f32[i + 1], y = f32[i + 2], w = f32[i + 3], h = f32[i + 4];
    const clearColor = u32[i + 5], bg = u32[i + 6];
    const fov = f32[i + 7], near = f32[i + 8], far = f32[i + 9];
    const view = f32.slice(i + 10, i + 26);
    let p = i + 26;
    const full = x <= 1 && y <= 1 && w >= this.sw - 1 && h >= this.sh - 1;
    let vx, vy, vw, vh;
    if (full) { vx = 0; vy = 0; vw = canvas.width; vh = canvas.height; }
    else { const s = this.ls; vx = Math.round(this.lox + x * s); vw = Math.round(w * s); vh = Math.round(h * s); vy = Math.round(canvas.height - (this.loy + (y + h) * s)); }
    const aspect = vw / vh;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(vx, vy, vw, vh); gl.viewport(vx, vy, vw, vh);
    gl.depthMask(true);
    if (clearColor) { gl.clearColor(((bg >> 16) & 255) / 255, ((bg >> 8) & 255) / 255, (bg & 255) / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
    else gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.pr);
    const f = 1 / Math.tan(fov * Math.PI / 360), a = aspect;
    const P = new Float32Array([f / a, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
    gl.uniformMatrix4fv(u.uP, false, P); gl.uniformMatrix4fv(u.uV, false, view);
    // camera position = translation of inverse(view)
    const R = view; // view = [R|t], cam = -R^T t
    this.cam = [-(R[0] * R[12] + R[1] * R[13] + R[2] * R[14]), -(R[4] * R[12] + R[5] * R[13] + R[6] * R[14]), -(R[8] * R[12] + R[9] * R[13] + R[10] * R[14])];
    gl.uniform1f(u.uLK, +(new URLSearchParams(location.search).get('lk') || 2));
    gl.uniform1f(u.uGain, +(new URLSearchParams(location.search).get("gain") || 3.6));
    gl.uniform3f(u.uCam, this.cam[0], this.cam[1], this.cam[2]);
    gl.uniform1i(u.uFlip, +(new URLSearchParams(location.search).get('flip') || 0));
    gl.uniform1i(u.uDbg, +(new URLSearchParams(location.search).get('dbg') || 0));
    const nl = u32[p++];
    const ty = new Int32Array(MAXL), col = new Float32Array(MAXL * 3), dir = new Float32Array(MAXL * 3), pos = new Float32Array(MAXL * 3), att = new Float32Array(MAXL * 3), spot = new Float32Array(MAXL);
    let k = 0;
    for (let l = 0; l < nl; l++, p += 14) {
      if (k >= MAXL) continue;
      ty[k] = u32[p];
      for (let c = 0; c < 3; c++) { col[k * 3 + c] = f32[p + 1 + c]; dir[k * 3 + c] = f32[p + 4 + c]; pos[k * 3 + c] = f32[p + 7 + c]; att[k * 3 + c] = f32[p + 10 + c]; }
      spot[k] = f32[p + 13]; k++;
    }
    gl.uniform1i(u.uNLights, k); gl.uniform1iv(u.uLType, ty); gl.uniform3fv(u.uLCol, col); gl.uniform3fv(u.uLDir, dir);
    gl.uniform3fv(u.uLPos, pos); gl.uniform3fv(u.uLAtt, att); gl.uniform1fv(u.uLSpot, spot);
    gl.uniform1i(u.uT0, 0); gl.uniform1i(u.uT1, 1); gl.uniform1i(u.uT2, 2);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    return p;
  }
  draw(u32, f32, i, texs) {
    const gl = this.gl, u = this.u;
    const m = this.meshes.get(u32[i + 1]);
    let p = i + 2;
    const M = f32.slice(p, p + 16); p += 16;
    const c = f32.slice(p, p + 12); p += 12;
    const shin = f32[p++], blend = f32[p++], flags = u32[p++], nl = u32[p++];
    const ltex = new Int32Array(3), lmode = new Int32Array(3), lfunc = new Int32Array(3), lsrc = new Int32Array(3);
    const lconst = new Float32Array(3), lx0 = new Float32Array(9), lx1 = new Float32Array(9);
    for (let l = 0; l < nl; l++, p += 12) {
      if (l >= 3) continue;
      const id = u32[p];
      const t = texs.get(id);
      gl.activeTexture(gl.TEXTURE0 + l);
      gl.bindTexture(gl.TEXTURE_2D, t || this.white);
      const rep = u32[p + 5] ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, rep); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, rep);
      ltex[l] = t ? 1 : 0; lmode[l] = u32[p + 1]; lfunc[l] = u32[p + 2]; lsrc[l] = u32[p + 3]; lconst[l] = f32[p + 4];
      lx0.set([f32[p + 6], f32[p + 7], f32[p + 8]], l * 3); lx1.set([f32[p + 9], f32[p + 10], f32[p + 11]], l * 3);
    }
    gl.activeTexture(gl.TEXTURE0);
    if (!m) return p;
    gl.uniformMatrix4fv(u.uM, false, M);
    gl.uniform3f(u.uAmb, c[0], c[1], c[2]); gl.uniform3f(u.uDif, c[3], c[4], c[5]); gl.uniform3f(u.uSpec, c[6], c[7], c[8]); gl.uniform3f(u.uEmi, c[9], c[10], c[11]);
    gl.uniform1f(u.uShin, shin); gl.uniform1f(u.uBlend, blend); gl.uniform1i(u.uFlags, (flags & 3) | (((flags >> 11) & 1) << 2));
    gl.uniform1i(u.uNL, nl); gl.uniform1iv(u.uLTex, ltex); gl.uniform1iv(u.uLMode, lmode); gl.uniform1iv(u.uLFunc, lfunc); gl.uniform1iv(u.uLSrc, lsrc);
    gl.uniform1fv(u.uLConst, lconst); gl.uniform3fv(u.uLX0, lx0); gl.uniform3fv(u.uLX1, lx1);
    const vis = (flags >> 4) & 3;
    if (vis === 3 || vis === 0) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(vis === 1 ? gl.BACK : gl.FRONT); }
    if ((flags >> 10) & 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
    else { gl.disable(gl.BLEND); gl.depthMask(true); }
    gl.bindVertexArray(m.vao);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    return p;
  }
  end() {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.depthMask(true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
}
