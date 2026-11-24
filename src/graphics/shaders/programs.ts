export interface ShaderProgramSource {
  readonly name: string;
  readonly vertex: string;
  readonly fragment: string;
}

export interface CompiledShaderProgram {
  readonly name: string;
  readonly program: WebGLProgram;
  readonly uniforms: Map<string, WebGLUniformLocation | null>;
  getUniform(name: string): WebGLUniformLocation | null;
  dispose(gl: WebGL2RenderingContext): void;
}

export interface ShaderLibrary {
  readonly sprite: CompiledShaderProgram;
  readonly water: CompiledShaderProgram;
  readonly lightingCanopy: CompiledShaderProgram;
  readonly bloomComposite: CompiledShaderProgram;
  readonly particle: CompiledShaderProgram;
  dispose(gl: WebGL2RenderingContext): void;
}

export const MAX_POINT_LIGHTS = 24;

/**
 * 1) SPRITE_SHADER
 * Instanced/batched textured quads with UV sub-rect, alpha, RGBA tint,
 * optional silhouette rim-light highlight, and emissive boost.
 */
export const SPRITE_SHADER: ShaderProgramSource = {
  name: 'SPRITE_SHADER',
  vertex: `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitPos;      // [0..1] quad corner
layout(location = 1) in vec4 aRect;         // dx, dy, dw, dh
layout(location = 2) in vec4 aUvRect;       // u0, v0, uSpan, vSpan
layout(location = 3) in vec4 aTransform;    // rotation, flipX, alpha, emissive
layout(location = 4) in vec4 aTint;         // r, g, b, a
layout(location = 5) in vec4 aRimColor;     // r, g, b, a

uniform vec2 uResolution;
uniform vec4 uCameraPosZoom; // x, y, zoom, rotation
uniform vec2 uCameraShake;   // shakeX, shakeY
uniform float uApplyCamera;  // 1.0 = world space, 0.0 = screen space

out vec2 vUv;
out vec4 vUvBounds;
out vec4 vTint;
out vec4 vRimColor;
out float vAlpha;
out float vEmissive;

vec2 applyCameraTransform(vec2 worldPos) {
  vec2 shifted = worldPos - uCameraPosZoom.xy;
  vec2 center = uResolution * 0.5;
  vec2 rel = shifted - center;
  float camRot = uCameraPosZoom.w;
  float c = cos(camRot);
  float s = sin(camRot);
  vec2 rotated = vec2(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
  return center + rotated * uCameraPosZoom.z + uCameraShake;
}

void main() {
  vec2 local = aUnitPos - 0.5;
  vec2 scaled = local * aRect.zw;

  float rot = aTransform.x;
  float cr = cos(rot);
  float sr = sin(rot);
  vec2 rotated = vec2(
    scaled.x * cr - scaled.y * sr,
    scaled.x * sr + scaled.y * cr
  );

  vec2 quadCenter = aRect.xy + aRect.zw * 0.5;
  vec2 pos = quadCenter + rotated;

  vec2 screenPos = mix(pos, applyCameraTransform(pos), uApplyCamera);

  vec2 ndc = vec2(
    (screenPos.x / max(uResolution.x, 1.0)) * 2.0 - 1.0,
    1.0 - (screenPos.y / max(uResolution.y, 1.0)) * 2.0
  );

  gl_Position = vec4(ndc, 0.0, 1.0);

  float uLocal = mix(aUnitPos.x, 1.0 - aUnitPos.x, step(0.5, aTransform.y));
  vUv = vec2(
    aUvRect.x + uLocal * aUvRect.z,
    aUvRect.y + aUnitPos.y * aUvRect.w
  );
  vUvBounds = vec4(aUvRect.x, aUvRect.y, aUvRect.x + aUvRect.z, aUvRect.y + aUvRect.w);
  vTint = aTint;
  vRimColor = aRimColor;
  vAlpha = aTransform.z;
  vEmissive = aTransform.w;
}
`,
  fragment: `#version 300 es
precision highp float;

in vec2 vUv;
in vec4 vUvBounds;
in vec4 vTint;
in vec4 vRimColor;
in float vAlpha;
in float vEmissive;

uniform sampler2D uAlbedoTex;
uniform sampler2D uEmissiveTex;
uniform float uHasEmissive;
uniform vec2 uTexelSize;

out vec4 fragColor;

float sampleClampedAlpha(vec2 offset) {
  vec2 uv = clamp(vUv + offset, vUvBounds.xy, vUvBounds.zw);
  return texture(uAlbedoTex, uv).a;
}

void main() {
  vec4 albedo = texture(uAlbedoTex, vUv);
  float outAlpha = albedo.a * vTint.a * vAlpha;
  if (outAlpha <= 0.004) {
    discard;
  }

  vec3 color = albedo.rgb * vTint.rgb;

  // Optional silhouette rim-light highlight via 4-neighbor alpha gradient
  if (vRimColor.a > 0.005) {
    float aL = sampleClampedAlpha(vec2(-uTexelSize.x, 0.0));
    float aR = sampleClampedAlpha(vec2(uTexelSize.x, 0.0));
    float aU = sampleClampedAlpha(vec2(0.0, -uTexelSize.y));
    float aD = sampleClampedAlpha(vec2(0.0, uTexelSize.y));
    float minNeighbor = min(min(aL, aR), min(aU, aD));
    float edgeMask = smoothstep(0.08, 0.65, albedo.a - minNeighbor);
    color = mix(color, color + vRimColor.rgb * 1.15, edgeMask * vRimColor.a);
  }

  // Optional atlas emissive texture contribution
  if (uHasEmissive > 0.5) {
    vec4 em = texture(uEmissiveTex, vUv);
    color += em.rgb * em.a * 1.35;
  }

  // Scalar emissive boost (pushes pixels above bloom threshold in post-process)
  if (vEmissive > 0.001) {
    color += color * vEmissive;
  }

  fragColor = vec4(color, clamp(outAlpha, 0.0, 1.0));
}
`,
};

/**
 * 2) WATER_SHADER
 * Translucent multi-depth water shader synthesizing animated shoreline surf foam
 * (via foamMask + sin waves), rippled twilight sky reflection gradient
 * (uSkyTop, uSkyBottom), twinkling starlight specular highlights
 * (uStarlightIntensity), and depth absorption.
 */
export const WATER_SHADER: ShaderProgramSource = {
  name: 'WATER_SHADER',
  vertex: `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitPos;      // [0..1] quad corner
layout(location = 1) in vec4 aRect;         // x, y, w, h in world space
layout(location = 2) in vec2 aWaterParams;  // depthFactor (0..1), foamMask

uniform vec2 uResolution;
uniform vec4 uCameraPosZoom; // x, y, zoom, rotation
uniform vec2 uCameraShake;

out vec2 vLocalUv;
out vec2 vWorldPos;
out vec2 vScreenUv;
out float vDepthFactor;
out float vFoamMask;

void main() {
  vec2 worldPos = aRect.xy + aUnitPos * aRect.zw;

  vec2 shifted = worldPos - uCameraPosZoom.xy;
  vec2 center = uResolution * 0.5;
  vec2 rel = shifted - center;
  float camRot = uCameraPosZoom.w;
  float c = cos(camRot);
  float s = sin(camRot);
  vec2 rotated = vec2(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
  vec2 screenPos = center + rotated * uCameraPosZoom.z + uCameraShake;

  vec2 ndc = vec2(
    (screenPos.x / max(uResolution.x, 1.0)) * 2.0 - 1.0,
    1.0 - (screenPos.y / max(uResolution.y, 1.0)) * 2.0
  );

  gl_Position = vec4(ndc, 0.0, 1.0);
  vLocalUv = aUnitPos;
  vWorldPos = worldPos;
  vScreenUv = screenPos / max(uResolution, vec2(1.0));
  vDepthFactor = clamp(aWaterParams.x, 0.0, 1.0);
  vFoamMask = aWaterParams.y;
}
`,
  fragment: `#version 300 es
precision highp float;

in vec2 vLocalUv;
in vec2 vWorldPos;
in vec2 vScreenUv;
in float vDepthFactor;
in float vFoamMask;

uniform float uTime;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform float uStarlightIntensity;
uniform float uWaveAmplitude;
uniform vec3 uFoamColor;
uniform float uReducedMotion;

out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float motionScale = mix(1.0, 0.2, step(0.5, uReducedMotion));
  float t = uTime * motionScale;

  // Seamless world-space multi-octave ripple field
  float w1 = sin(vWorldPos.x * 0.085 + t * 2.1 + sin(vWorldPos.y * 0.045) * 1.4);
  float w2 = sin(vWorldPos.y * 0.115 - t * 1.65 + vWorldPos.x * 0.032);
  float w3 = cos((vWorldPos.x - vWorldPos.y) * 0.065 + t * 1.25);
  float ripple = (w1 * 0.5 + w2 * 0.35 + w3 * 0.15) * clamp(uWaveAmplitude, 0.0, 2.5);

  // Depth absorption between crystalline coastal shallows and deep twilight sapphire
  vec3 shallowWater = mix(vec3(0.16, 0.58, 0.72), uSkyBottom * 0.88 + vec3(0.06, 0.18, 0.22), 0.45);
  vec3 deepWater = mix(vec3(0.04, 0.14, 0.32), uSkyTop * 0.75 + vec3(0.02, 0.06, 0.16), 0.5);
  vec3 absorbed = mix(shallowWater, deepWater, smoothstep(0.0, 1.0, vDepthFactor));

  // Subtle shallow water caustics
  float caustic = pow(clamp(0.5 + 0.5 * sin(vWorldPos.x * 0.14 + w2 * 1.7 + t * 1.8) * cos(vWorldPos.y * 0.14 - w1 * 1.5 - t * 1.3), 0.0, 1.0), 4.0);
  absorbed += vec3(0.14, 0.28, 0.34) * caustic * (1.0 - vDepthFactor * 0.75) * 0.55;

  // Rippled twilight sky reflection gradient
  float reflectGrad = clamp(1.0 - vScreenUv.y + ripple * 0.08, 0.0, 1.0);
  vec3 skyReflection = mix(uSkyBottom, uSkyTop, reflectGrad);
  float fresnel = mix(0.24, 0.52, vDepthFactor) + ripple * 0.05;
  vec3 waterColor = mix(absorbed, skyReflection, clamp(fresnel, 0.12, 0.68));

  // Twinkling starlight specular highlights on wave crests
  if (uStarlightIntensity > 0.01) {
    vec2 starCell = floor((vWorldPos + vec2(ripple * 4.5, w2 * 3.0)) * 0.085);
    vec2 starLocal = fract((vWorldPos + vec2(ripple * 4.5, w2 * 3.0)) * 0.085) - 0.5;
    float rnd = hash21(starCell);
    float starMask = step(0.84, rnd);
    float twinkle = 0.5 + 0.5 * sin(t * (2.6 + rnd * 4.5) + rnd * 31.4159);
    float dist = length(starLocal);
    float sparkle = exp(-dist * dist * 42.0) * starMask * twinkle;
    float crestGlint = smoothstep(0.52, 0.96, 0.5 + 0.5 * (w1 * w3)) * 0.22;
    vec3 starTint = mix(vec3(0.85, 0.93, 1.0), vec3(1.0, 0.94, 0.76), fract(rnd * 17.3));
    waterColor += starTint * (sparkle * 1.15 + crestGlint) * uStarlightIntensity;
  }

  // Animated shoreline surf foam supporting both 0..1 intensity and 4-bit cardinal mask (N=1, E=2, S=4, W=8)
  float foamFactor = 0.0;
  if (vFoamMask > 0.001) {
    float surfWave = 0.05 * sin(vWorldPos.x * 0.18 + vWorldPos.y * 0.14 - t * 3.4);
    float foamLace = 0.55 + 0.45 * sin(vWorldPos.x * 0.35 - t * 2.2) * cos(vWorldPos.y * 0.35 + t * 1.9);

    if (vFoamMask > 1.01) {
      int mask = int(floor(vFoamMask + 0.5));
      float edgeN = ((mask & 1) != 0) ? smoothstep(0.28 + surfWave, 0.02, vLocalUv.y) : 0.0;
      float edgeE = ((mask & 2) != 0) ? smoothstep(0.72 - surfWave, 0.98, vLocalUv.x) : 0.0;
      float edgeS = ((mask & 4) != 0) ? smoothstep(0.72 - surfWave, 0.98, vLocalUv.y) : 0.0;
      float edgeW = ((mask & 8) != 0) ? smoothstep(0.28 + surfWave, 0.02, vLocalUv.x) : 0.0;
      float edge = max(max(edgeN, edgeS), max(edgeE, edgeW));
      foamFactor = edge * foamLace;
    } else {
      float edgeDist = min(min(vLocalUv.x, 1.0 - vLocalUv.x), min(vLocalUv.y, 1.0 - vLocalUv.y));
      float rimFoam = smoothstep(0.26 + surfWave, 0.02, edgeDist);
      float crestFoam = smoothstep(0.62, 0.95, 0.5 + 0.5 * w1) * 0.35;
      foamFactor = clamp((rimFoam + crestFoam) * foamLace * vFoamMask, 0.0, 1.0);
    }
  }

  waterColor = mix(waterColor, uFoamColor, clamp(foamFactor * 0.88, 0.0, 0.92));

  float alpha = mix(0.84, 0.96, vDepthFactor);
  alpha = max(alpha, foamFactor * 0.96);

  fragColor = vec4(waterColor, clamp(alpha, 0.0, 1.0));
}
`,
};

/**
 * 3) LIGHTING_CANOPY_SHADER
 * Fullscreen deferred-style 2D lighting pass sampling the Scene FBO + optional
 * Normal/Emissive buffers, accumulating up to 24 dynamic RGB PointLights
 * (uLightPosRadius, uLightColorIntensity) with smooth attenuation & animated
 * flicker, modulating ambient biome light, projecting diagonal forest canopy
 * sunbeam shafts & drifting cloud shadows.
 */
export const LIGHTING_CANOPY_SHADER: ShaderProgramSource = {
  name: 'LIGHTING_CANOPY_SHADER',
  vertex: `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitPos; // [0..1]

out vec2 vUv;

void main() {
  vUv = aUnitPos;
  gl_Position = vec4(aUnitPos * 2.0 - 1.0, 0.0, 1.0);
}
`,
  fragment: `#version 300 es
precision highp float;

const int MAX_LIGHTS = 24;

in vec2 vUv;

uniform sampler2D uSceneTex;
uniform sampler2D uNormalTex;
uniform float uHasNormal;
uniform sampler2D uEmissiveTex;
uniform float uHasEmissive;

uniform vec2 uResolution;
uniform float uTime;
uniform float uReducedMotion;

uniform vec3 uAmbientRgb;
uniform float uAmbientStrength;

uniform int uLightCount;
uniform vec4 uLightPosRadius[MAX_LIGHTS];       // x, y (CSS px), radius (CSS px), flickerSpeed
uniform vec4 uLightColorIntensity[MAX_LIGHTS];  // r, g, b, intensity
uniform float uLightFlickerAmount[MAX_LIGHTS];

uniform float uCanopyEnabled;
uniform float uSunbeamIntensity;
uniform float uSunbeamAngle;
uniform vec3 uSunbeamColor;
uniform vec2 uCloudSpeed;
uniform float uCloudOpacity;

out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float cloudFbm(vec2 p) {
  float v = 0.0;
  v += 0.55 * valueNoise(p);
  v += 0.30 * valueNoise(p * 2.07 + vec2(4.1, 1.7));
  v += 0.15 * valueNoise(p * 4.13 - vec2(2.3, 6.2));
  return v;
}

void main() {
  vec4 scene = texture(uSceneTex, vUv);
  float motionScale = mix(1.0, 0.15, step(0.5, uReducedMotion));

  // CSS pixel position (origin top-left, +Y downward to match PointLight coords)
  vec2 screenPos = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);

  // Optional normal map decode for directional light wrap
  vec3 normal = vec3(0.0, 0.0, 1.0);
  if (uHasNormal > 0.5) {
    vec3 sampledN = texture(uNormalTex, vUv).xyz * 2.0 - 1.0;
    float lenN = length(sampledN);
    if (lenN > 0.01) {
      normal = sampledN / lenN;
    }
  }

  // Modulate ambient biome lighting while keeping shadowed regions richly readable
  vec3 ambientLight = mix(vec3(0.45), uAmbientRgb, 0.85) * mix(0.62, 1.04, clamp(uAmbientStrength, 0.0, 1.0));

  vec3 pointAccum = vec3(0.0);
  vec3 haloAccum = vec3(0.0);

  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) {
      break;
    }
    vec4 posRad = uLightPosRadius[i];
    vec4 colInt = uLightColorIntensity[i];
    float radius = max(posRad.z, 1.0);
    vec2 delta = posRad.xy - screenPos;
    float dist = length(delta);

    if (dist < radius) {
      float normDist = dist / radius;
      float att = 1.0 - normDist;
      // Smooth cubic falloff with zero hard edge
      att = att * att * (3.0 - 2.0 * att);

      float flickSpeed = posRad.w;
      float flickAmt = uLightFlickerAmount[i] * motionScale;
      float flicker = 1.0;
      if (flickAmt > 0.001) {
        float phase = uTime * max(flickSpeed, 0.5) + float(i) * 2.37;
        flicker = 1.0 + (sin(phase) * 0.65 + sin(phase * 2.13) * 0.35) * flickAmt;
      }

      float ndotl = 1.0;
      if (uHasNormal > 0.5) {
        vec3 lightDir = normalize(vec3(delta.x, -delta.y, radius * 0.38));
        ndotl = clamp(dot(normal, lightDir) * 0.65 + 0.45, 0.35, 1.1);
      }

      float energy = max(colInt.a, 0.0) * flicker * att * ndotl;
      pointAccum += colInt.rgb * energy * 0.56;
      haloAccum += colInt.rgb * (max(colInt.a, 0.0) * flicker * att * att * 0.09);
    }
  }

  // Filmic light compression prevents overlapping lanterns/fountains/auras from clipping to white
  pointAccum = pointAccum / (1.0 + pointAccum * 0.85);
  haloAccum = min(haloAccum, vec3(0.28));
  vec3 lit = scene.rgb * (ambientLight + pointAccum) + haloAccum;
  lit = lit / (1.0 + max(lit - vec3(0.84), vec3(0.0)) * 0.55);

  // Optional emissive FBO contribution
  if (uHasEmissive > 0.5) {
    vec4 emissive = texture(uEmissiveTex, vUv);
    lit += emissive.rgb * emissive.a;
  }

  // Diagonal forest canopy sunbeam shafts & drifting cloud shadows
  if (uCanopyEnabled > 0.5) {
    float ca = cos(uSunbeamAngle);
    float sa = sin(uSunbeamAngle);
    vec2 centeredUv = vUv - 0.5;
    vec2 rotUv = vec2(centeredUv.x * ca - centeredUv.y * sa, centeredUv.x * sa + centeredUv.y * ca);

    // Multi-harmonic diagonal sunbeam shafts fading naturally downward
    float drift = uTime * 0.14 * motionScale;
    float beam1 = 0.5 + 0.5 * sin(rotUv.x * 16.0 + drift);
    float beam2 = 0.5 + 0.5 * sin(rotUv.x * 29.0 - drift * 0.7 + 1.3);
    float shaft = pow(clamp(beam1 * 0.65 + beam2 * 0.35, 0.0, 1.0), 3.2);
    float verticalFade = smoothstep(0.05, 0.92, vUv.y);
    lit += uSunbeamColor * (shaft * verticalFade * max(uSunbeamIntensity, 0.0) * 0.42);

    // Drifting dappled canopy cloud shadow gobo
    if (uCloudOpacity > 0.005) {
      vec2 cloudUv = vUv * vec2(3.6, 2.4) + uCloudSpeed * (uTime * 0.04 * motionScale);
      float cloud = smoothstep(0.36, 0.78, cloudFbm(cloudUv));
      float shadowMul = 1.0 - cloud * clamp(uCloudOpacity, 0.0, 1.0) * 0.36;
      lit *= shadowMul;
    }
  }

  fragColor = vec4(lit, scene.a);
}
`,
};

/**
 * 4) BLOOM_COMPOSITE_SHADER
 * Post-process pass performing soft multi-tap Dual-Kawase-inspired bloom halo
 * extraction & blend (uBloomIntensity, uBloomThreshold), per-biome color-grade
 * LUT transform (uTintRgb, uContrast, uSaturation), radial vignette
 * (uVignetteStrength), and optional crisp CRT scanline + subtle phosphor mask
 * toggle (uCrtEnabled).
 */
export const BLOOM_COMPOSITE_SHADER: ShaderProgramSource = {
  name: 'BLOOM_COMPOSITE_SHADER',
  vertex: `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitPos; // [0..1]

out vec2 vUv;

void main() {
  vUv = aUnitPos;
  gl_Position = vec4(aUnitPos * 2.0 - 1.0, 0.0, 1.0);
}
`,
  fragment: `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uLitTex;
uniform vec2 uTexelSize;
uniform vec2 uResolution;
uniform float uTime;

uniform float uBloomIntensity;
uniform float uBloomThreshold;

uniform vec3 uTintRgb;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignetteStrength;

uniform float uCrtEnabled;
uniform float uReducedMotion;

out vec4 fragColor;

vec3 extractBloom(vec2 uv, float threshold) {
  vec3 c = texture(uLitTex, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float effectiveThresh = max(threshold, 0.80);
  float softKnee = smoothstep(effectiveThresh - 0.08, effectiveThresh + 0.16, luma);
  return c * softKnee;
}

void main() {
  vec4 base = texture(uLitTex, vUv);
  vec3 color = base.rgb;

  // Soft 12-tap Dual-Kawase-inspired multi-ring bloom halo
  if (uBloomIntensity > 0.005) {
    vec2 t1 = uTexelSize * 1.75;
    vec2 t2 = uTexelSize * 3.75;
    vec2 t3 = uTexelSize * 6.5;

    vec3 bloom = vec3(0.0);
    // Inner diagonal ring
    bloom += extractBloom(vUv + vec2(-t1.x, -t1.y), uBloomThreshold) * 0.12;
    bloom += extractBloom(vUv + vec2( t1.x, -t1.y), uBloomThreshold) * 0.12;
    bloom += extractBloom(vUv + vec2(-t1.x,  t1.y), uBloomThreshold) * 0.12;
    bloom += extractBloom(vUv + vec2( t1.x,  t1.y), uBloomThreshold) * 0.12;

    // Mid cardinal ring
    bloom += extractBloom(vUv + vec2(-t2.x, 0.0), uBloomThreshold) * 0.08;
    bloom += extractBloom(vUv + vec2( t2.x, 0.0), uBloomThreshold) * 0.08;
    bloom += extractBloom(vUv + vec2(0.0, -t2.y), uBloomThreshold) * 0.08;
    bloom += extractBloom(vUv + vec2(0.0,  t2.y), uBloomThreshold) * 0.08;

    // Outer diagonal soft halo
    bloom += extractBloom(vUv + vec2(-t3.x, -t3.y), uBloomThreshold) * 0.05;
    bloom += extractBloom(vUv + vec2( t3.x, -t3.y), uBloomThreshold) * 0.05;
    bloom += extractBloom(vUv + vec2(-t3.x,  t3.y), uBloomThreshold) * 0.05;
    bloom += extractBloom(vUv + vec2( t3.x,  t3.y), uBloomThreshold) * 0.05;

    color += bloom * (uBloomIntensity * 0.48);
  }

  // Per-biome color-grade LUT transform
  color *= uTintRgb;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, uSaturation);
  color = (color - 0.5) * uContrast + 0.5;

  // Gentle highlight roll-off to preserve pastel Starlight glow without harsh clipping
  color = max(color, vec3(0.0));
  color = color / (1.0 + max(color - 0.92, vec3(0.0)) * 0.65);

  // Radial vignette
  if (uVignetteStrength > 0.005) {
    vec2 centered = (vUv - 0.5) * vec2(1.12, 1.04);
    float vig = 1.0 - smoothstep(0.34, 0.94, length(centered)) * clamp(uVignetteStrength, 0.0, 0.85);
    color *= vig;
  }

  // Optional crisp CRT scanlines + subtle RGB phosphor aperture grille mask
  if (uCrtEnabled > 0.5) {
    float scanPhase = gl_FragCoord.y * 3.14159265;
    float scanline = mix(0.85, 1.04, 0.5 + 0.5 * sin(scanPhase));

    float triad = mod(floor(gl_FragCoord.x), 3.0);
    vec3 phosphor = vec3(
      mix(0.95, 1.05, 1.0 - step(0.5, triad)),
      mix(0.95, 1.05, step(0.5, triad) * (1.0 - step(1.5, triad))),
      mix(0.95, 1.05, step(1.5, triad))
    );

    float subtleRoll = mix(1.0, 0.985 + 0.015 * sin(vUv.y * 24.0 - uTime * 2.0), 1.0 - step(0.5, uReducedMotion));
    vec2 edge = abs(vUv - 0.5) * 2.0;
    float bezel = 1.0 - smoothstep(0.92, 1.02, max(edge.x, edge.y)) * 0.28;

    color *= scanline * phosphor * subtleRoll * bezel;
  }

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`,
};

/**
 * 5) PARTICLE_SHADER
 * Soft radial / stretched additive particles with glow falloff for 18-type VFX,
 * sparks, spores, and starlight dust.
 */
export const PARTICLE_SHADER: ShaderProgramSource = {
  name: 'PARTICLE_SHADER',
  vertex: `#version 300 es
precision highp float;

layout(location = 0) in vec2 aUnitPos;      // [0..1] quad corner
layout(location = 1) in vec4 aCenterRadius; // x, y, radius, softness
layout(location = 2) in vec4 aColor;        // r, g, b, a
layout(location = 3) in vec3 aStretchRot;   // stretchX, stretchY, rotation

uniform vec2 uResolution;
uniform vec4 uCameraPosZoom; // x, y, zoom, rotation
uniform vec2 uCameraShake;

out vec2 vLocalPos;
out vec4 vColor;
out float vSoftness;

void main() {
  vec2 local = aUnitPos * 2.0 - 1.0; // [-1..1]
  vec2 stretched = vec2(
    local.x * aCenterRadius.z * max(aStretchRot.x, 0.05),
    local.y * aCenterRadius.z * max(aStretchRot.y, 0.05)
  );

  float rot = aStretchRot.z;
  float cr = cos(rot);
  float sr = sin(rot);
  vec2 offset = vec2(
    stretched.x * cr - stretched.y * sr,
    stretched.x * sr + stretched.y * cr
  );

  vec2 worldPos = aCenterRadius.xy + offset;

  vec2 shifted = worldPos - uCameraPosZoom.xy;
  vec2 center = uResolution * 0.5;
  vec2 rel = shifted - center;
  float camRot = uCameraPosZoom.w;
  float cc = cos(camRot);
  float sc = sin(camRot);
  vec2 rotated = vec2(rel.x * cc - rel.y * sc, rel.x * sc + rel.y * cc);
  vec2 screenPos = center + rotated * uCameraPosZoom.z + uCameraShake;

  vec2 ndc = vec2(
    (screenPos.x / max(uResolution.x, 1.0)) * 2.0 - 1.0,
    1.0 - (screenPos.y / max(uResolution.y, 1.0)) * 2.0
  );

  gl_Position = vec4(ndc, 0.0, 1.0);
  vLocalPos = local;
  vColor = aColor;
  vSoftness = clamp(aCenterRadius.w, 0.05, 1.0);
}
`,
  fragment: `#version 300 es
precision highp float;

in vec2 vLocalPos;
in vec4 vColor;
in float vSoftness;

out vec4 fragColor;

void main() {
  float d = length(vLocalPos);
  if (d >= 1.0) {
    discard;
  }

  float edge = smoothstep(1.0, max(0.0, 1.0 - vSoftness), d);
  float core = exp(-d * d * mix(2.4, 5.2, vSoftness));
  float alpha = clamp(edge * vColor.a, 0.0, 1.0);
  if (alpha <= 0.003) {
    discard;
  }

  vec3 rgb = vColor.rgb * (1.0 + core * 0.45);
  fragColor = vec4(rgb, alpha);
}
`,
};

export const ALL_SHADER_SOURCES = {
  SPRITE_SHADER,
  WATER_SHADER,
  LIGHTING_CANOPY_SHADER,
  BLOOM_COMPOSITE_SHADER,
  PARTICLE_SHADER,
} as const;

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(`Failed to allocate WebGL2 shader for ${label}`);
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!ok) {
    const info = gl.getShaderInfoLog(shader) ?? 'Unknown compile error';
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed (${label}): ${info}`);
  }
  return shader;
}

export function compileProgram(
  gl: WebGL2RenderingContext,
  spec: ShaderProgramSource,
): CompiledShaderProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, spec.vertex, `${spec.name}:vertex`);
  let fs: WebGLShader | null = null;
  let program: WebGLProgram | null = null;

  try {
    fs = compileShader(gl, gl.FRAGMENT_SHADER, spec.fragment, `${spec.name}:fragment`);
    program = gl.createProgram();
    if (!program) {
      throw new Error(`Failed to allocate WebGL2 program for ${spec.name}`);
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!linked) {
      const info = gl.getProgramInfoLog(program) ?? 'Unknown link error';
      throw new Error(`Shader program link failed (${spec.name}): ${info}`);
    }

    gl.detachShader(program, vs);
    gl.detachShader(program, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const uniforms = new Map<string, WebGLUniformLocation | null>();
    const activeProgram = program;

    return {
      name: spec.name,
      program: activeProgram,
      uniforms,
      getUniform(name: string): WebGLUniformLocation | null {
        if (uniforms.has(name)) {
          return uniforms.get(name) ?? null;
        }
        const loc = gl.getUniformLocation(activeProgram, name);
        uniforms.set(name, loc);
        return loc;
      },
      dispose(ctx: WebGL2RenderingContext): void {
        uniforms.clear();
        ctx.deleteProgram(activeProgram);
      },
    };
  } catch (err) {
    if (program) gl.deleteProgram(program);
    if (fs) gl.deleteShader(fs);
    gl.deleteShader(vs);
    throw err;
  }
}

export function createShaderLibrary(gl: WebGL2RenderingContext): ShaderLibrary {
  const compiled: CompiledShaderProgram[] = [];
  try {
    const sprite = compileProgram(gl, SPRITE_SHADER);
    compiled.push(sprite);
    const water = compileProgram(gl, WATER_SHADER);
    compiled.push(water);
    const lightingCanopy = compileProgram(gl, LIGHTING_CANOPY_SHADER);
    compiled.push(lightingCanopy);
    const bloomComposite = compileProgram(gl, BLOOM_COMPOSITE_SHADER);
    compiled.push(bloomComposite);
    const particle = compileProgram(gl, PARTICLE_SHADER);
    compiled.push(particle);

    return {
      sprite,
      water,
      lightingCanopy,
      bloomComposite,
      particle,
      dispose(ctx: WebGL2RenderingContext): void {
        for (const prog of compiled) {
          prog.dispose(ctx);
        }
      },
    };
  } catch (err) {
    for (const prog of compiled) {
      prog.dispose(gl);
    }
    throw err;
  }
}
