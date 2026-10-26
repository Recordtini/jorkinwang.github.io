// WebGL renderer for the engine's display list.
import { View3D } from './gl3d.js';
const OP = { END: 0, CLEAR: 1, TEX: 2, SPRITE: 3, RECT: 4, V3D: 5, MESHUP: 6, DRAW3D: 7, V3D_END: 8, OVERLAY: 9 };

const VS = `#version 300 es
in vec2 p; uniform vec4 r; uniform vec2 res; uniform vec2 off; uniform vec2 flip; out vec2 uv;
void main(){ vec2 t = p; uv = vec2(flip.x>0.5 ? 1.0-t.x : t.x, flip.y>0.5 ? 1.0-t.y : t.y);
 vec2 s = r.xy + t*r.zw + off; gl_Position = vec4(s.x/res.x*2.0-1.0, 1.0-s.y/res.y*2.0, 0, 1); }`;
const FS = `#version 300 es
precision mediump float; in vec2 uv; uniform sampler2D tex; uniform float blend; uniform vec4 col; uniform float solid; out vec4 o;
void main(){ vec4 c = solid>0.5 ? col : texture(tex, uv); o = vec4(c.rgb, c.a*blend); }`;

export class Renderer {
  constructor(canvas, ex, mem, w, h, opts = {}) {
    this.gl = canvas.getContext('webgl2', { antialias: (opts.msaa | 0) > 0, alpha: false, premultipliedAlpha: false, depth: true });
    if (!this.gl) throw new Error('WebGL2 not available');
    this.ex = ex; this.mem = mem; this.w = w; this.h = h; this.canvas = canvas;
    const gl = this.gl;
    const mk = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram();
    gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr); this.pr = pr; gl.useProgram(pr);
    this.u = {}; for (const n of ['r', 'res', 'off', 'flip', 'tex', 'blend', 'col', 'solid']) this.u[n] = gl.getUniformLocation(pr, n);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); this.vao2d = vao;
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = new Map();
    this.v3 = new View3D(gl, mem, w, h);
    this.aniso = 16;
    this.ext = gl.getExtension('EXT_texture_filter_anisotropic');
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  setFiltering(n) { this.aniso = n; this.v3.aniso = n; for (const t of this.tex.values()) this.applyFilter(t); }
  applyFilter(t) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (this.ext) gl.texParameterf(gl.TEXTURE_2D, this.ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(this.aniso, gl.getParameter(this.ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  // The 640x480 stage is scaled to fit and centred; 3D views that cover the whole stage use the whole canvas.
  layout() {
    const W = this.canvas.width, H = this.canvas.height;
    this.s = Math.min(W / this.w, H / this.h);
    this.ox = (W - this.w * this.s) / 2; this.oy = (H - this.h * this.s) / 2;
    this.v3.setLayout(this.s, this.ox, this.oy);
  }
  draw() {
    const gl = this.gl, ex = this.ex;
    const ptr = ex.lw_list_ptr(), len = ex.lw_list_len();
    const u32 = new Uint32Array(this.mem.buffer, ptr, len), f32 = new Float32Array(this.mem.buffer, ptr, len);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.pr);
    this.layout();
    gl.uniform2f(this.u.res, this.canvas.width / this.s, this.canvas.height / this.s); gl.uniform2f(this.u.off, this.ox / this.s, this.oy / this.s); gl.uniform1i(this.u.tex, 0);
    let i = 0;
    while (i < len) {
      const op = u32[i];
      if (op === OP.END) break;
      if (op === OP.CLEAR) { const c = u32[i + 1]; gl.clearColor(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT); i += 2; }
      else if (op === OP.TEX) {
        const id = u32[i + 1], w = u32[i + 2], h = u32[i + 3], p = u32[i + 4];
        if (w === 32 && h === 64 && location.search.includes('dumptex')) { (window.__t3264 = window.__t3264 || []).push({ id, px: Array.from(new Uint8Array(this.mem.buffer, p, w * h * 4)) }); }
        let t = this.tex.get(id);
        if (!t) { t = gl.createTexture(); this.tex.set(id, t); }
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(this.mem.buffer, p, w * h * 4));
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.applyFilter(t);
        i += 5;
      } else if (op === OP.SPRITE) {
        const t = this.tex.get(u32[i + 1]);
        if (t) {
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.uniform4f(this.u.r, f32[i + 2], f32[i + 3], f32[i + 4], f32[i + 5]);
          gl.uniform2f(this.u.flip, u32[i + 6] & 1, (u32[i + 6] >> 1) & 1);
          gl.uniform1f(this.u.blend, f32[i + 7]); gl.uniform1f(this.u.solid, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        i += 9;
      } else if (op === OP.RECT) {
        const c = u32[i + 6];
        gl.uniform4f(this.u.r, f32[i + 1], f32[i + 2], f32[i + 3], f32[i + 4]);
        gl.uniform2f(this.u.flip, 0, 0); gl.uniform1f(this.u.blend, f32[i + 5]); gl.uniform1f(this.u.solid, 1);
        gl.uniform4f(this.u.col, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        i += 7;
      } else if (op === OP.MESHUP) {
        this.v3.meshUp(u32[i + 1], u32[i + 2], u32[i + 3], u32[i + 4], u32[i + 5]); i += 6;
      } else if (op === OP.V3D) {
        i = this.v3.begin(u32, f32, i, this.canvas);
      } else if (op === OP.DRAW3D) {
        i = this.v3.draw(u32, f32, i, this.tex);
      } else if (op === OP.V3D_END) {
        this.v3.end(); gl.useProgram(this.pr); gl.bindVertexArray(this.vao2d); gl.viewport(0, 0, this.canvas.width, this.canvas.height); i += 1;
      } else if (op === OP.OVERLAY) {
        const t = this.tex.get(u32[i + 1]);
        if (t && !location.search.includes('noov')) {
          gl.useProgram(this.pr); gl.bindVertexArray(this.vao2d);
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          let ox = f32[i + 2], oy = f32[i + 3], ow = f32[i + 4], oh = f32[i + 5];
          if (ow >= this.w - 1 && oh >= this.h - 1 && ox <= 1 && oy <= 1) { // a full-screen fade also covers the side bars
            ox = -this.ox / this.s; oy = -this.oy / this.s; ow = this.canvas.width / this.s; oh = this.canvas.height / this.s;
          }
          gl.uniform4f(this.u.r, ox, oy, ow, oh); gl.uniform2f(this.u.flip, 0, 0);
          gl.uniform1f(this.u.blend, f32[i + 6]); gl.uniform1f(this.u.solid, 0);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        i += 7;
      } else break;
    }
  }
}
