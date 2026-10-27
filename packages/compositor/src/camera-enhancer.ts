import { fitCover, type Size } from "./layout";
import type { ToneParams } from "./light";

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
uniform vec2 uCropOffset;
uniform vec2 uCropScale;
uniform float uMirror;
out vec2 vUv;
void main() {
  vec2 uv = aPosition * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;                       // video rows run top to bottom
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  vUv = uCropOffset + uv * uCropScale;     // object-fit: cover
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uFrame;
uniform vec2 uTexel;
uniform float uGamma;
uniform float uSaturation;
uniform float uDenoise;
uniform float uWarmth;
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

void main() {
  vec3 color = texture(uFrame, vUv).rgb;

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
    color = mix(color, sum / total, uDenoise);
  }

  // Luminance gamma: lifts shadows and midtones, keeps highlights and hue.
  float luma = max(dot(color, LUMA), 1e-4);
  color *= min(pow(luma, uGamma) / luma, MAX_GAIN);
  color = softClip(color);

  float gray = dot(color, LUMA);
  color = mix(vec3(gray), color, uSaturation);
  color += vec3(0.018, 0.006, -0.016) * uWarmth;

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

type Uniform =
  | "uCropOffset"
  | "uCropScale"
  | "uMirror"
  | "uTexel"
  | "uGamma"
  | "uSaturation"
  | "uDenoise"
  | "uWarmth";

export interface EnhanceOptions extends ToneParams {
  mirror: boolean;
}

/**
 * Renders a camera frame through the light-correction pipeline on the GPU (WebGL2), cropped to the
 * output canvas like `object-fit: cover`. Use `CameraEnhancer.create()`, which returns null when
 * WebGL2 is unavailable so callers can fall back to the raw video.
 */
export class CameraEnhancer {
  private readonly uniforms: Record<Uniform, WebGLUniformLocation | null>;
  private readonly texture: WebGLTexture;
  private lost = false;

  private constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly gl: WebGL2RenderingContext,
    program: WebGLProgram,
  ) {
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    if (!texture) throw new Error("Could not create texture");
    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const names: Uniform[] = [
      "uCropOffset",
      "uCropScale",
      "uMirror",
      "uTexel",
      "uGamma",
      "uSaturation",
      "uDenoise",
      "uWarmth",
    ];
    this.uniforms = Object.fromEntries(
      names.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Record<Uniform, WebGLUniformLocation | null>;

    canvas.addEventListener("webglcontextlost", () => {
      this.lost = true;
    });
  }

  /** Creates an enhancer on the given canvas, or null if WebGL2 isn't available. */
  static create(canvas: HTMLCanvasElement | OffscreenCanvas): CameraEnhancer | null {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
      desynchronized: true,
    }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    const program = linkProgram(gl);
    return program ? new CameraEnhancer(canvas, gl, program) : null;
  }

  /** False after the GPU context was lost; callers should fall back to the raw video. */
  get ready(): boolean {
    return !this.lost && !this.gl.isContextLost();
  }

  /** Draws `source` (a video, image or canvas of `sourceSize`) into the whole canvas. */
  render(source: TexImageSource, sourceSize: Size, options: EnhanceOptions): void {
    if (!this.ready || sourceSize.width === 0 || sourceSize.height === 0) return;
    const { gl, uniforms } = this;
    const output = { width: this.canvas.width, height: this.canvas.height };
    const crop = fitCover(sourceSize, output);

    gl.viewport(0, 0, output.width, output.height);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.uniform2f(uniforms.uCropOffset, crop.x / sourceSize.width, crop.y / sourceSize.height);
    gl.uniform2f(
      uniforms.uCropScale,
      crop.width / sourceSize.width,
      crop.height / sourceSize.height,
    );
    gl.uniform1f(uniforms.uMirror, options.mirror ? 1 : 0);
    // Denoise samples a 5×5 neighbourhood in source pixels, whatever the output size.
    gl.uniform2f(uniforms.uTexel, 1 / sourceSize.width, 1 / sourceSize.height);
    gl.uniform1f(uniforms.uGamma, options.gamma);
    gl.uniform1f(uniforms.uSaturation, options.saturation);
    gl.uniform1f(uniforms.uDenoise, options.denoise);
    gl.uniform1f(uniforms.uWarmth, options.warmth);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Frees GPU resources. The canvas keeps its context, so a new enhancer can reuse it. */
  dispose(): void {
    this.gl.deleteTexture(this.texture);
  }
}

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
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
  const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Camera shader failed to link:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}
