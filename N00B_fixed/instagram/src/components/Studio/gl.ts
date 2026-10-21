import { Adjust, NO_ADJUST } from './types';
import { filterAdjust, filterMatrix } from './filters';

// The picture-processing engine: one small program that runs on the graphics chip (WebGL), so sliders move live even on video. It does the crop of a picture, the colour
// adjustments, the filter's colour matrix, blur, sharpening, vignette and grain in one pass. (Safari cannot do these with the canvas's own "filter", so they are done here.)

const VERT = `attribute vec2 aPos; varying vec2 vUv; uniform vec4 uRect;
void main() { vec2 uv = aPos * 0.5 + 0.5; vUv = vec2(uRect.x + uv.x * uRect.z, uRect.y + (1.0 - uv.y) * uRect.w); gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec2 uOut;
uniform float uBr, uCo, uEx, uHi, uSh, uSa, uVi, uTe, uTi, uHue, uFade, uVig, uGrain, uSharp, uBlur, uAmount, uSeed;
uniform mat4 uM;
uniform vec4 uMo;
uniform vec4 uRect;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
vec3 hueRot(vec3 c, float a) {
  float cs = cos(a), sn = sin(a);
  mat3 m = mat3(
    0.299 + 0.701 * cs + 0.168 * sn, 0.299 - 0.299 * cs - 0.328 * sn, 0.299 - 0.3 * cs + 1.25 * sn,
    0.587 - 0.587 * cs + 0.33 * sn, 0.587 + 0.413 * cs + 0.035 * sn, 0.587 - 0.588 * cs - 1.05 * sn,
    0.114 - 0.114 * cs - 0.497 * sn, 0.114 - 0.114 * cs + 0.292 * sn, 0.114 + 0.886 * cs - 0.203 * sn);
  return m * c;
}
vec4 smp(vec2 uv) { return texture2D(uTex, clamp(uv, uRect.xy, uRect.xy + uRect.zw)); }
void main() {
  vec4 src = smp(vUv);
  vec3 c = src.rgb;
  if (uBlur > 0.05) {
    vec2 r = uTexel * uBlur;
    vec3 acc = c * 2.0; float w = 2.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec2 o = vec2(cos(a), sin(a));
      acc += smp(vUv + o * r).rgb; acc += smp(vUv + o * r * 0.5).rgb * 0.8; w += 1.8;
    }
    c = acc / w;
  }
  if (uSharp > 0.05) {
    vec2 t = uTexel * 1.2;
    vec3 n = (smp(vUv + vec2(t.x, 0.0)).rgb + smp(vUv - vec2(t.x, 0.0)).rgb + smp(vUv + vec2(0.0, t.y)).rgb + smp(vUv - vec2(0.0, t.y)).rgb) * 0.25;
    c += (c - n) * uSharp * 1.6;
  }
  c *= pow(2.0, uEx * 1.5);
  c.r += uTe * 0.12 + uTi * 0.04;
  c.b += -uTe * 0.12 + uTi * 0.04;
  c.g += -uTi * 0.08;
  c += uBr * 0.25;
  c = (c - 0.5) * (1.0 + uCo * 0.8) + 0.5;
  float l = luma(c);
  c += uHi * 0.35 * smoothstep(0.5, 1.0, l);
  c += uSh * 0.35 * (1.0 - smoothstep(0.0, 0.5, l));
  l = luma(c);
  c = mix(vec3(l), c, 1.0 + uSa);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(l), c, 1.0 + uVi * (1.0 - sat));
  if (abs(uHue) > 0.001) c = hueRot(c, uHue);
  c = c * (1.0 - uFade * 0.28) + uFade * 0.12;
  vec3 f = (uM * vec4(c, 1.0)).rgb + uMo.rgb;
  c = mix(c, f, uAmount);
  float d = distance(vUv, uRect.xy + uRect.zw * 0.5) / (0.5 * length(uRect.zw));
  c *= 1.0 - uVig * smoothstep(0.45, 1.05, d) * 0.85;
  c += (hash(vUv * uOut) - 0.5) * uGrain * 0.3;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

export type GLSource = ImageBitmap | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

export interface ProcessOptions {
  /** the part of the source that is used, in fractions (0..1) */
  crop: { x: number; y: number; w: number; h: number };
  adjust: Adjust;
  filter: string;
  filterAmount: number;
  /** extra blur used by a transition */
  extraBlur?: number;
  seed?: number;
}

export class GLProcessor {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private lastSource: unknown = null;
  private lastStamp = -1;
  lost = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: true });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('program');
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uTex', 'uTexel', 'uOut', 'uBr', 'uCo', 'uEx', 'uHi', 'uSh', 'uSa', 'uVi', 'uTe', 'uTi', 'uHue', 'uFade', 'uVig', 'uGrain', 'uSharp', 'uBlur', 'uAmount', 'uSeed', 'uM', 'uMo', 'uRect']) this.loc[n] = gl.getUniformLocation(prog, n);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
  }

  /** Draws the (cropped, adjusted, filtered) source at the given size; returns the canvas and the part of it that holds the picture. */
  process(source: GLSource, outW: number, outH: number, o: ProcessOptions): { canvas: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number } {
    const gl = this.gl;
    const w = Math.max(2, Math.min(2048, Math.round(outW)));
    const h = Math.max(2, Math.min(2048, Math.round(outH)));
    const needW = Math.ceil(w / 256) * 256;
    const needH = Math.ceil(h / 256) * 256;
    if (this.canvas.width < needW || this.canvas.height < needH) { this.canvas.width = Math.max(this.canvas.width, needW); this.canvas.height = Math.max(this.canvas.height, needH); }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // a still picture is uploaded once; a video is uploaded for every frame
    const isVideo = source instanceof HTMLVideoElement;
    const stamp = isVideo ? (source as HTMLVideoElement).currentTime : 0;
    if (isVideo || this.lastSource !== source || this.lastStamp !== stamp) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
      this.lastSource = source; this.lastStamp = stamp;
    }
    const a: Adjust = { ...NO_ADJUST };
    const fa = filterAdjust(o.filter, o.filterAmount);
    for (const k of Object.keys(a) as Array<keyof Adjust>) a[k] = o.adjust[k] + fa[k];
    const m = filterMatrix(o.filter);
    const u = (n: string, v: number) => gl.uniform1f(this.loc[n], v);
    gl.uniform1i(this.loc.uTex, 0);
    // one output pixel, in the source's own 0..1 units (so a blur or sharpen of N pixels looks the same at any size)
    gl.uniform2f(this.loc.uTexel, o.crop.w / w, o.crop.h / h);
    gl.uniform2f(this.loc.uOut, w, h);
    u('uBr', a.brightness / 100); u('uCo', a.contrast / 100); u('uEx', a.exposure / 100); u('uHi', a.highlights / 100); u('uSh', a.shadows / 100);
    u('uSa', a.saturation / 100); u('uVi', a.vibrance / 100); u('uTe', a.temperature / 100); u('uTi', a.tint / 100); u('uHue', (a.hue / 100) * Math.PI);
    u('uFade', a.fade / 100); u('uVig', a.vignette / 100); u('uGrain', a.grain / 100); u('uSharp', a.sharpness / 100);
    // blur is in pixels of the output
    u('uBlur', Math.max(0, a.blur) + (o.extraBlur || 0));
    u('uAmount', o.filter === 'none' ? 0 : o.filterAmount / 100);
    u('uSeed', o.seed ?? 0);
    // GLSL mat4 is column-major: rows of the 4x5 matrix become columns
    gl.uniformMatrix4fv(this.loc.uM, false, new Float32Array([m[0], m[5], m[10], m[15], m[1], m[6], m[11], m[16], m[2], m[7], m[12], m[17], m[3], m[8], m[13], m[18]]));
    gl.uniform4f(this.loc.uMo, m[4], m[9], m[14], 0);
    gl.uniform4f(this.loc.uRect, o.crop.x, o.crop.y, o.crop.w, o.crop.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // the viewport is the bottom-left corner of the canvas; as a normal image that is the lower-left part
    return { canvas: this.canvas, sx: 0, sy: this.canvas.height - h, sw: w, sh: h };
  }

  dispose(): void {
    try {
      this.gl.deleteTexture(this.tex); this.gl.deleteProgram(this.prog);
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { /* already gone */ }
    this.canvas.width = 1; this.canvas.height = 1;
  }
}

let shared: GLProcessor | null | undefined;
/** One processor for the preview (drawing a frame needs it many times). Null when the device has no WebGL. */
export function sharedGL(): GLProcessor | null {
  if (shared === undefined) {
    try { shared = new GLProcessor(); } catch { shared = null; }
  }
  if (shared && shared.lost) { shared = undefined; return sharedGL(); }
  return shared;
}
export const releaseSharedGL = (): void => { if (shared) shared.dispose(); shared = undefined; };
