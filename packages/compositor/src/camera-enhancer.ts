import type { CameraBackgroundMode, Rgb } from "./background";
import { fitCover, type Size } from "./layout";
import { NEUTRAL_GAINS, type RgbGains, type ToneParams } from "./light";
import type { PersonMask } from "./mask";

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
uniform vec2 uCropOffset;
uniform vec2 uCropScale;
uniform float uMirror;
out vec2 vUv;   // camera texture coordinates (cropped like object-fit: cover, mirrored)
out vec2 vOut;  // output coordinates, top-left origin
out vec2 vGl;   // output coordinates, bottom-left origin (how render targets are stored)
void main() {
  vGl = aPosition * 0.5 + 0.5;
  vOut = vec2(vGl.x, 1.0 - vGl.y);        // video and image rows run top to bottom
  vec2 uv = vOut;
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  vUv = uCropOffset + uv * uCropScale;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/**
 * First pass for background blur: the background only, premultiplied by its weight, so the mip
 * chain averages background pixels and the person never bleeds into the blur as a halo.
 */
const BLUR_SOURCE_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uFrame;
uniform sampler2D uMask;
uniform float uHasMask;
out vec4 outColor;
void main() {
  vec3 color = texture(uFrame, vUv).rgb;
  float person = uHasMask > 0.5 ? texture(uMask, vUv).r : 0.0;
  float weight = 1.0 - smoothstep(0.15, 0.55, person);
  outColor = vec4(color * weight, weight);
}`;

const MAIN_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vOut;
in vec2 vGl;
uniform sampler2D uFrame;
uniform sampler2D uMask;
uniform sampler2D uBlur;
uniform sampler2D uImage;
uniform vec2 uTexel;
uniform vec2 uMaskTexel;
uniform float uHasMask;
uniform float uGamma;
uniform float uSaturation;
uniform float uDenoise;
uniform float uWarmth;
uniform float uContrast;
uniform vec3 uWhiteBalance;
uniform float uBackgroundLift;
uniform int uMode;              // 0 none, 1 blur, 2 colour, 3 image, 4 remove (transparent)
uniform float uBlurLod;
uniform vec2 uBlurStep;
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec2 uImageOffset;
uniform vec2 uImageScale;
out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float KNEE = 0.82;
// Near-black pixels would need huge gains to follow the curve; capping it keeps noise down.
const float MAX_GAIN = 3.0;

// Rolls highlights off smoothly instead of clipping them at 1.0.
vec3 softClip(vec3 c) {
  vec3 over = max(c - KNEE, 0.0);
  return min(c, KNEE) + (1.0 - KNEE) * tanh(over / (1.0 - KNEE));
}

// The touch-up: white balance, luminance gamma (lifts shadows and midtones, keeps highlights and
// hue), a gentle S-curve that gives back the contrast the lift flattens, saturation and warmth.
// amount = 1 for the person; the background gets part of it, which separates the two.
vec3 tone(vec3 color, float amount) {
  color *= uWhiteBalance;
  float luma = max(dot(color, LUMA), 1e-4);
  float lifted = pow(luma, mix(1.0, uGamma, amount));
  float k = (mix(1.0, uContrast, amount) - 1.0) * 2.0;
  float curved = lifted + k * (lifted - 0.5) * lifted * (1.0 - lifted) * 2.0;
  color *= min(max(curved, 0.0) / luma, MAX_GAIN);
  color = softClip(color);
  float gray = dot(color, LUMA);
  color = mix(vec3(gray), color, mix(1.0, uSaturation, amount));
  color += vec3(0.018, 0.006, -0.016) * uWarmth * amount;
  return clamp(color, 0.0, 1.0);
}

// The low-resolution model mask, refined against the full-resolution frame (a joint bilateral
// filter): neighbours that look like the centre pixel count more, so edges follow hair and
// shoulders in the image instead of the mask's blocky outline.
float personMask(vec3 center) {
  if (uHasMask < 0.5) return 1.0;
  float sum = 0.0;
  float total = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 offset = vec2(float(x), float(y)) * uMaskTexel;
      vec3 diff = texture(uFrame, vUv + offset).rgb - center;
      float weight = exp(-dot(diff, diff) * 30.0) * ((x == 0 && y == 0) ? 1.0 : 0.7);
      sum += texture(uMask, vUv + offset).r * weight;
      total += weight;
    }
  }
  return smoothstep(0.3, 0.7, sum / total);
}

vec3 blurredBackground(vec3 fallback) {
  vec4 sum = textureLod(uBlur, vGl, uBlurLod);
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.7853982;
    sum += textureLod(uBlur, vGl + vec2(cos(angle), sin(angle)) * uBlurStep, uBlurLod);
  }
  return sum.a > 0.02 ? sum.rgb / sum.a : fallback;
}

void main() {
  vec3 raw = texture(uFrame, vUv).rgb;
  float person = personMask(raw);
  vec3 color = raw;

  // Edge-preserving smoothing: average neighbours that look similar (a cheap bilateral filter), so
  // skin texture and noise lifted out of the shadows soften while edges and features stay sharp.
  if (uDenoise > 0.001) {
    vec3 sum = color;
    float total = 1.0;
    for (int x = -2; x <= 2; x++) {
      for (int y = -2; y <= 2; y++) {
        if (x == 0 && y == 0) continue;
        vec3 neighbor = texture(uFrame, vUv + vec2(float(x), float(y)) * uTexel).rgb;
        vec3 diff = neighbor - color;
        float weight = exp(-dot(diff, diff) * 90.0);
        sum += neighbor * weight;
        total += weight;
      }
    }
    color = mix(color, sum / total, uDenoise * mix(0.5, 1.0, person));
  }

  vec3 subject = tone(color, 1.0);
  if (uMode == 4) {
    outColor = vec4(subject * person, person);   // premultiplied alpha
    return;
  }

  vec3 background;
  if (uMode == 1) background = tone(blurredBackground(color), uBackgroundLift);
  else if (uMode == 2) background = mix(uTop, uBottom, vOut.y);
  else if (uMode == 3) background = texture(uImage, uImageOffset + vOut * uImageScale).rgb;
  else background = tone(color, uBackgroundLift);

  if (uMode != 0) {
    // Light wrap: a little of the new background spills onto the edges so the person sits in it.
    float edge = clamp(4.0 * person * (1.0 - person), 0.0, 1.0);
    subject = mix(subject, background, 0.2 * edge);
  }
  outColor = vec4(mix(background, subject, person), 1.0);
}`;

const MODE_INDEX: Record<CameraBackgroundMode, number> = {
  none: 0,
  blur: 1,
  color: 2,
  image: 3,
  remove: 4,
};

/** A background, resolved for rendering (colours as 0..1 RGB). */
export interface BackgroundRender {
  mode: CameraBackgroundMode;
  /** Blur strength, 0..1. */
  blur: number;
  top: Rgb;
  bottom: Rgb;
}

export const NO_BACKGROUND: BackgroundRender = {
  mode: "none",
  blur: 0,
  top: [0, 0, 0],
  bottom: [0, 0, 0],
};

export interface EnhanceOptions extends ToneParams {
  mirror: boolean;
  whiteBalance?: RgbGains;
  /** Share of the person's lift the background gets when a mask is set (1 = same as the person). */
  backgroundLift?: number;
  background?: BackgroundRender;
}

const MAIN_UNIFORMS = [
  "uCropOffset",
  "uCropScale",
  "uMirror",
  "uFrame",
  "uMask",
  "uBlur",
  "uImage",
  "uTexel",
  "uMaskTexel",
  "uHasMask",
  "uGamma",
  "uSaturation",
  "uDenoise",
  "uWarmth",
  "uContrast",
  "uWhiteBalance",
  "uBackgroundLift",
  "uMode",
  "uBlurLod",
  "uBlurStep",
  "uTop",
  "uBottom",
  "uImageOffset",
  "uImageScale",
] as const;
const BLUR_UNIFORMS = [
  "uCropOffset",
  "uCropScale",
  "uMirror",
  "uFrame",
  "uMask",
  "uHasMask",
] as const;

type Uniforms<Name extends string> = Record<Name, WebGLUniformLocation | null>;

interface Program<Name extends string> {
  program: WebGLProgram;
  uniforms: Uniforms<Name>;
}

const UNIT = { frame: 0, mask: 1, blur: 2, image: 3 } as const;

/**
 * Renders a camera frame through the touch-up and background pipeline on the GPU (WebGL2), cropped
 * to the output canvas like `object-fit: cover`. Use `CameraEnhancer.create()`, which returns null
 * when WebGL2 is unavailable so callers can fall back to the raw video. The canvas has an alpha
 * channel: the "remove" background is transparent around the person.
 */
export class CameraEnhancer {
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly frameTexture: WebGLTexture;
  private readonly maskTexture: WebGLTexture;
  private readonly imageTexture: WebGLTexture;
  private readonly blurTexture: WebGLTexture;
  private blurFramebuffer: WebGLFramebuffer | null = null;
  private blurSize: Size = { width: 0, height: 0 };
  private hasMask = false;
  private maskSize: Size = { width: 1, height: 1 };
  private imageSize: Size | null = null;
  private lost = false;

  private constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly gl: WebGL2RenderingContext,
    private readonly main: Program<(typeof MAIN_UNIFORMS)[number]>,
    private readonly blurSource: Program<(typeof BLUR_UNIFORMS)[number]>,
  ) {
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error("Could not create vertex buffers");
    this.vao = vao;
    this.buffer = buffer;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.frameTexture = createTexture(gl, UNIT.frame);
    this.maskTexture = createTexture(gl, UNIT.mask);
    this.imageTexture = createTexture(gl, UNIT.image);
    this.blurTexture = createTexture(gl, UNIT.blur);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

    // Until a mask arrives, the whole frame is the person.
    gl.activeTexture(gl.TEXTURE0 + UNIT.mask);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      1,
      1,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255]),
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0 + UNIT.image);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
    // A complete 1×1 texture until the first blur, so the sampler is never "not renderable".
    gl.activeTexture(gl.TEXTURE0 + UNIT.blur);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );

    gl.useProgram(main.program);
    gl.uniform1i(main.uniforms.uFrame, UNIT.frame);
    gl.uniform1i(main.uniforms.uMask, UNIT.mask);
    gl.uniform1i(main.uniforms.uBlur, UNIT.blur);
    gl.uniform1i(main.uniforms.uImage, UNIT.image);
    gl.useProgram(blurSource.program);
    gl.uniform1i(blurSource.uniforms.uFrame, UNIT.frame);
    gl.uniform1i(blurSource.uniforms.uMask, UNIT.mask);

    canvas.addEventListener("webglcontextlost", () => {
      this.lost = true;
    });
  }

  /** Creates an enhancer on the given canvas, or null if WebGL2 isn't available. */
  static create(canvas: HTMLCanvasElement | OffscreenCanvas): CameraEnhancer | null {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    const main = linkProgram(gl, MAIN_SHADER, MAIN_UNIFORMS);
    const blurSource = linkProgram(gl, BLUR_SOURCE_SHADER, BLUR_UNIFORMS);
    return main && blurSource ? new CameraEnhancer(canvas, gl, main, blurSource) : null;
  }

  /** False after the GPU context was lost; callers should fall back to the raw video. */
  get ready(): boolean {
    return !this.lost && !this.gl.isContextLost();
  }

  /** Sets the person mask for the next renders, or clears it (the whole frame is the person). */
  setMask(mask: PersonMask | null): void {
    if (!this.ready) return;
    if (!mask || mask.width === 0 || mask.height === 0) {
      this.hasMask = false;
      return;
    }
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + UNIT.mask);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      mask.width,
      mask.height,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      mask.data,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    this.hasMask = true;
    this.maskSize = { width: mask.width, height: mask.height };
  }

  /** Sets the image for the "image" background, or clears it. */
  setBackgroundImage(image: TexImageSource | null, size: Size): void {
    if (!this.ready) return;
    if (!image || size.width === 0 || size.height === 0) {
      this.imageSize = null;
      return;
    }
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + UNIT.image);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.imageSize = size;
  }

  /** Draws `source` (a video, video frame, image or canvas of `sourceSize`) into the whole canvas. */
  render(source: TexImageSource, sourceSize: Size, options: EnhanceOptions): void {
    if (!this.ready || sourceSize.width === 0 || sourceSize.height === 0) return;
    const { gl, main } = this;
    const output = { width: this.canvas.width, height: this.canvas.height };
    const crop = fitCover(sourceSize, output);
    const background = options.background ?? NO_BACKGROUND;
    // Without a mask nothing can be told apart from the person; without an image, show the room.
    let mode = this.hasMask ? MODE_INDEX[background.mode] : MODE_INDEX.none;
    if (mode === MODE_INDEX.image && !this.imageSize) mode = MODE_INDEX.none;

    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0 + UNIT.frame);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.activeTexture(gl.TEXTURE0 + UNIT.mask);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.activeTexture(gl.TEXTURE0 + UNIT.image);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);

    const cropOffset = [crop.x / sourceSize.width, crop.y / sourceSize.height] as const;
    const cropScale = [crop.width / sourceSize.width, crop.height / sourceSize.height] as const;
    const mirror = options.mirror ? 1 : 0;

    if (mode === MODE_INDEX.blur) {
      this.renderBlurSource(output, cropOffset, cropScale, mirror);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, output.width, output.height);
    gl.useProgram(main.program);
    const u = main.uniforms;
    gl.uniform2f(u.uCropOffset, cropOffset[0], cropOffset[1]);
    gl.uniform2f(u.uCropScale, cropScale[0], cropScale[1]);
    gl.uniform1f(u.uMirror, mirror);
    // Denoise samples a 5×5 neighbourhood in source pixels, whatever the output size.
    gl.uniform2f(u.uTexel, 1 / sourceSize.width, 1 / sourceSize.height);
    gl.uniform2f(u.uMaskTexel, 1 / this.maskSize.width, 1 / this.maskSize.height);
    gl.uniform1f(u.uHasMask, this.hasMask ? 1 : 0);
    gl.uniform1f(u.uGamma, options.gamma);
    gl.uniform1f(u.uSaturation, options.saturation);
    gl.uniform1f(u.uDenoise, options.denoise);
    gl.uniform1f(u.uWarmth, options.warmth);
    gl.uniform1f(u.uContrast, options.contrast);
    const gains = options.whiteBalance ?? NEUTRAL_GAINS;
    gl.uniform3f(u.uWhiteBalance, gains[0], gains[1], gains[2]);
    gl.uniform1f(u.uBackgroundLift, this.hasMask ? (options.backgroundLift ?? 1) : 1);
    gl.uniform1i(u.uMode, mode);
    gl.uniform3f(u.uTop, background.top[0], background.top[1], background.top[2]);
    gl.uniform3f(u.uBottom, background.bottom[0], background.bottom[1], background.bottom[2]);
    if (mode === MODE_INDEX.blur) {
      const radius =
        (0.012 + 0.05 * clamp01(background.blur)) * Math.min(output.width, output.height);
      const radiusInTarget = radius / 2; // the blur target is half resolution
      gl.uniform1f(u.uBlurLod, Math.max(0, Math.log2(Math.max(1, radiusInTarget / 2))));
      gl.uniform2f(
        u.uBlurStep,
        (radiusInTarget * 0.7) / this.blurSize.width,
        (radiusInTarget * 0.7) / this.blurSize.height,
      );
    }
    if (mode === MODE_INDEX.image && this.imageSize) {
      const cover = fitCover(this.imageSize, output);
      gl.uniform2f(u.uImageOffset, cover.x / this.imageSize.width, cover.y / this.imageSize.height);
      gl.uniform2f(
        u.uImageScale,
        cover.width / this.imageSize.width,
        cover.height / this.imageSize.height,
      );
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Renders the masked background at half resolution and builds its mip chain for the blur. */
  private renderBlurSource(
    output: Size,
    cropOffset: readonly [number, number],
    cropScale: readonly [number, number],
    mirror: number,
  ): void {
    const { gl, blurSource } = this;
    const width = Math.max(1, Math.ceil(output.width / 2));
    const height = Math.max(1, Math.ceil(output.height / 2));
    gl.activeTexture(gl.TEXTURE0 + UNIT.blur);
    // Never sample a texture while rendering into it: unbind it for this pass.
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!this.blurFramebuffer || this.blurSize.width !== width || this.blurSize.height !== height) {
      gl.bindTexture(gl.TEXTURE_2D, this.blurTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.blurFramebuffer ??= gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFramebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.blurTexture,
        0,
      );
      this.blurSize = { width, height };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFramebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(blurSource.program);
    const u = blurSource.uniforms;
    gl.uniform2f(u.uCropOffset, cropOffset[0], cropOffset[1]);
    gl.uniform2f(u.uCropScale, cropScale[0], cropScale[1]);
    gl.uniform1f(u.uMirror, mirror);
    gl.uniform1f(u.uHasMask, this.hasMask ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTexture);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** Frees GPU resources. The canvas keeps its context, so a new enhancer can reuse it. */
  dispose(): void {
    const { gl } = this;
    for (const texture of [
      this.frameTexture,
      this.maskTexture,
      this.imageTexture,
      this.blurTexture,
    ]) {
      gl.deleteTexture(texture);
    }
    if (this.blurFramebuffer) gl.deleteFramebuffer(this.blurFramebuffer);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.main.program);
    gl.deleteProgram(this.blurSource.program);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function createTexture(gl: WebGL2RenderingContext, unit: number): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Could not create texture");
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function linkProgram<const Name extends string>(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
  uniformNames: readonly Name[],
): Program<Name> | null {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Camera shader failed to compile:", gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  // Both programs share one vertex array, so pin the attribute to the same location.
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Camera shader failed to link:", gl.getProgramInfoLog(program));
    return null;
  }
  const uniforms = Object.fromEntries(
    uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Uniforms<Name>;
  return { program, uniforms };
}
