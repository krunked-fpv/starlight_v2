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
 * Instanced/batched crisp pixel-art quads with UV sub-rect, alpha, RGBA tint,
 * tangent-space normal-map diffuse + gentle specular lighting against up to 24
 * real-time world-space point lights, unattenuated emissive self-illumination
 * (MRT output for Dual-Kawase bloom), optional silhouette rim-light highlight,
 * and scalar emissive boost.
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
out vec2 vWorldPos;
out vec2 vSpriteRotFlip;

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
  vWorldPos = pos;
  vSpriteRotFlip = vec2(aTransform.x, aTransform.y);
}
`,
  fragment: `#version 300 es
precision highp float;
precision highp int;

const int MAX_LIGHTS = 24;

in vec2 vUv;
in vec4 vUvBounds;
in vec4 vTint;
in vec4 vRimColor;
in float vAlpha;
in float vEmissive;
in vec2 vWorldPos;
in vec2 vSpriteRotFlip;

uniform sampler2D uAlbedoTex;
uniform sampler2D uNormalTex;
uniform sampler2D uEmissiveTex;
uniform int uHasNormal;
uniform int uHasEmissive;
uniform vec2 uTexelSize;

uniform int uLightCount;
uniform vec4 uLightPosRad[MAX_LIGHTS]; // x, y (world px), radius (world px), zHeight
uniform vec4 uLightColInt[MAX_LIGHTS]; // r, g, b, flickered intensity

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragEmissive;

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

  vec3 baseColor = albedo.rgb * vTint.rgb;
  vec3 color = baseColor;

  // True HD-2D tangent-space normal-map lighting against up to 24 real-time point lights
  if (uHasNormal == 1) {
    vec3 rawN = texture(uNormalTex, vUv).rgb * 2.0 - 1.0;
    vec3 N = dot(rawN, rawN) > 0.0001 ? normalize(rawN) : vec3(0.0, 0.0, 1.0);
    if (vSpriteRotFlip.y > 0.5) {
      N.x = -N.x;
    }
    if (abs(vSpriteRotFlip.x) > 0.001) {
      float cn = cos(vSpriteRotFlip.x);
      float sn = sin(vSpriteRotFlip.x);
      N.xy = vec2(N.x * cn - N.y * sn, N.x * sn + N.y * cn);
    }

    // Gentle overhead-left key light gives crisp 2.5D pixel bevel relief everywhere
    const vec3 keyDir = vec3(-0.3202563, -0.4603684, 0.8306648);
    float keyDiff = max(dot(N, keyDir), 0.0);
    vec3 diffuseAccum = vec3(0.76 + 0.30 * keyDiff);
    vec3 specAccum = vec3(0.0);
    const vec3 viewDir = vec3(0.0, 0.0, 1.0);

    if (uLightCount > 0) {
      for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= uLightCount) {
          break;
        }
        vec4 posRad = uLightPosRad[i];
        float radius = max(posRad.z, 1.0);
        vec2 delta = posRad.xy - vWorldPos;
        float distSq = dot(delta, delta);
        float radSq = radius * radius;

        if (distSq < radSq) {
          vec4 colInt = uLightColInt[i];
          float dist = sqrt(distSq);
          float att = 1.0 - (dist / radius);
          att = att * att * (3.0 - 2.0 * att);

          float lightZ = max(posRad.w, 24.0);
          vec3 L = normalize(vec3(delta.x, delta.y, lightZ));
          float rawNdotL = dot(N, L);
          float ndotl = max(rawNdotL, 0.0);
          float wrapDiff = clamp((rawNdotL + 0.25) * 0.8, 0.0, 1.0);
          float energy = max(colInt.a, 0.0) * att;

          diffuseAccum += colInt.rgb * energy * (wrapDiff * 0.34);

          vec3 H = normalize(L + viewDir);
          float ndoth = max(dot(N, H), 0.0);
          float s2 = ndoth * ndoth;
          float s4 = s2 * s2;
          float s8 = s4 * s4;
          float spec = (s8 * s8 * s4 * s2) * ndotl;
          specAccum += colInt.rgb * energy * spec * 0.14;
        }
      }
    }

    diffuseAccum = diffuseAccum / (1.0 + max(diffuseAccum - vec3(1.05), vec3(0.0)) * 0.85);
    color = color * diffuseAccum + min(specAccum, vec3(0.28));
  }

  // Optional silhouette rim-light highlight via 4-neighbor alpha gradient
  if (vRimColor.a > 0.005) {
    float aL = sampleClampedAlpha(vec2(-uTexelSize.x, 0.0));
    float aR = sampleClampedAlpha(vec2(uTexelSize.x, 0.0));
    float aU = sampleClampedAlpha(vec2(0.0, -uTexelSize.y));
    float aD = sampleClampedAlpha(vec2(0.0, uTexelSize.y));
    float minNeighbor = min(min(aL, aR), min(aU, aD));
    float edgeMask = smoothstep(0.08, 0.65, albedo.a - minNeighbor);
    color = mix(color, color + vRimColor.rgb * 0.85, edgeMask * vRimColor.a);
  }

  // Unattenuated self-illumination channel (flows cleanly into Lighting & Dual-Kawase Bloom without clipping)
  vec3 emissiveOut = vec3(0.0);

  // Optional atlas emissive texture contribution (lantern glass, cottage windows, shrine crystals, lava)
  if (uHasEmissive == 1) {
    vec4 em = texture(uEmissiveTex, vUv);
    vec3 emContrib = em.rgb * em.a;
    color += emContrib * 0.22;
    emissiveOut += emContrib * 0.72;
  }

  // Scalar emissive boost (animated Pokemon sprites & glowing elemental VFX)
  if (vEmissive > 0.001) {
    vec3 scalarEm = baseColor * vEmissive;
    color += scalarEm * 0.42;
    emissiveOut += scalarEm * 0.68;
  }

  float clampedAlpha = clamp(outAlpha, 0.0, 1.0);
  fragColor = vec4(color, clampedAlpha);
  fragEmissive = vec4(emissiveOut, clampedAlpha);
}
`,
};

/**
 * 2) WATER_SHADER
 * Pixel-snapped HD-2D translucent multi-depth Starlight water shader synthesizing
 * crisp quantized pixel ripples, stepped twilight sky reflection bands, 4-point
 * pixel starlight sparkles, and pixelated shoreline surf foam.
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
precision highp int;

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

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragEmissive;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float motionScale = mix(1.0, 0.2, step(0.5, uReducedMotion));
  float t = uTime * motionScale;

  // Snap world & tile coordinates cleanly onto a crisp pixel-art texel grid
  vec2 pxWorld = floor(vWorldPos);
  vec2 pxCell = floor(vWorldPos * 0.5) * 2.0;
  vec2 pxLocalUv = (floor(vLocalUv * 32.0) + 0.5) / 32.0;
  float pxScreenY = floor(vScreenUv.y * 180.0) / 180.0;

  // Quantized multi-octave pixel ripple field
  float w1 = sin(pxWorld.x * 0.095 + t * 2.1 + sin(pxCell.y * 0.055) * 1.4);
  float w2 = sin(pxCell.y * 0.125 - t * 1.65 + pxWorld.x * 0.036);
  float w3 = cos((pxWorld.x - pxCell.y) * 0.070 + t * 1.25);
  float rippleRaw = (w1 * 0.5 + w2 * 0.35 + w3 * 0.15) * clamp(uWaveAmplitude, 0.0, 2.5);
  float ripple = floor(rippleRaw * 4.0 + 0.5) * 0.25;

  // Stepped depth absorption between crystalline coastal shallows and deep twilight sapphire
  vec3 shallowWater = mix(vec3(0.16, 0.58, 0.72), uSkyBottom * 0.88 + vec3(0.06, 0.18, 0.22), 0.45);
  vec3 deepWater = mix(vec3(0.04, 0.14, 0.32), uSkyTop * 0.75 + vec3(0.02, 0.06, 0.16), 0.5);
  float steppedDepth = floor(vDepthFactor * 6.0 + 0.5) / 6.0;
  vec3 absorbed = mix(shallowWater, deepWater, smoothstep(0.0, 1.0, steppedDepth));

  // Crisp pixel-snapped shallow water caustics
  float causticRaw = 0.5 + 0.5 * sin(pxCell.x * 0.16 + w2 * 1.6 + t * 1.8) * cos(pxCell.y * 0.16 - w1 * 1.4 - t * 1.3);
  float caustic = step(0.76, causticRaw) * 0.55 + step(0.88, causticRaw) * 0.45;
  absorbed += vec3(0.14, 0.28, 0.36) * caustic * (1.0 - vDepthFactor * 0.75) * 0.42;

  // Stepped pixel-art twilight sky reflection bands + crisp 1px horizontal shimmer dashes
  float reflectGradRaw = clamp(1.0 - pxScreenY + ripple * 0.09, 0.0, 1.0);
  float reflectGrad = floor(reflectGradRaw * 6.0) / 6.0;
  vec3 skyReflection = mix(uSkyBottom, uSkyTop, reflectGrad);
  float fresnel = mix(0.24, 0.52, steppedDepth) + ripple * 0.05;
  vec3 waterColor = mix(absorbed, skyReflection, clamp(fresnel, 0.12, 0.68));

  // Horizontal 1px pixel-art wave highlight dashes on quantized rows
  float rowMask = step(0.5, 1.0 - mod(pxWorld.y, 4.0));
  float dashPhase = floor((pxWorld.x + floor(t * 7.0 + pxWorld.y * 0.25)) / 6.0);
  float dashRnd = hash21(vec2(dashPhase, floor(pxWorld.y / 4.0)));
  float dashHighlight = rowMask * step(0.74, dashRnd) * step(0.15, rippleRaw);
  waterColor += mix(uSkyBottom, vec3(0.85, 0.96, 1.0), 0.55) * dashHighlight * 0.18;

  // Pixel-snapped 4-point cross starlight sparkles on integer pixel grid
  vec3 sparkleEmissive = vec3(0.0);
  if (uStarlightIntensity > 0.01) {
    vec2 driftPx = pxWorld + vec2(floor(ripple * 4.0), 0.0);
    vec2 starCell = floor(driftPx / 10.0);
    vec2 cellPx = floor(mod(driftPx, 10.0)) - vec2(4.0);
    float rnd = hash21(starCell);
    float starMask = step(0.82, rnd);
    float twinkleRaw = 0.5 + 0.5 * sin(t * (2.6 + rnd * 4.2) + rnd * 31.4159);
    float twinkle = floor(twinkleRaw * 4.0) / 4.0;

    float ax = abs(cellPx.x);
    float ay = abs(cellPx.y);
    float corePx = step(ax, 0.5) * step(ay, 0.5);
    float armPx = max(step(ax, 1.5) * step(ay, 0.5), step(ay, 1.5) * step(ax, 0.5));
    float crossShape = max(corePx, armPx * step(0.5, twinkle) * 0.65);

    float sparkle = crossShape * starMask * twinkle;
    float crestGlint = step(0.78, 0.5 + 0.5 * (w1 * w3)) * rowMask * 0.22;
    vec3 starTint = mix(vec3(0.86, 0.94, 1.0), vec3(1.0, 0.94, 0.76), fract(rnd * 17.3));
    vec3 glintColor = starTint * (sparkle * 1.15 + crestGlint) * uStarlightIntensity;
    waterColor += glintColor;
    sparkleEmissive = starTint * sparkle * uStarlightIntensity * 0.85;
  }

  // Pixel-snapped animated shoreline surf foam (0..1 intensity & 4-bit N=1, E=2, S=4, W=8 mask)
  float foamFactor = 0.0;
  if (vFoamMask > 0.001) {
    float surfWave = floor(sin(pxCell.x * 0.22 + pxCell.y * 0.16 - t * 3.0) * 2.0 + 0.5) * 0.03125;
    float laceWave = 0.52 + 0.48 * sin(pxCell.x * 0.42 - t * 2.1 + pxCell.y * 0.14) * cos(pxCell.y * 0.38 + t * 1.7);
    float foamLace = step(0.38, laceWave) * 0.58 + step(0.72, laceWave) * 0.42;

    if (vFoamMask > 1.01) {
      int mask = int(floor(vFoamMask + 0.5));
      float edgeN = ((mask & 1) != 0) ? (step(pxLocalUv.y, 0.15 + surfWave) * 0.55 + step(pxLocalUv.y, 0.07 + surfWave) * 0.45) : 0.0;
      float edgeE = ((mask & 2) != 0) ? (step(0.85 - surfWave, pxLocalUv.x) * 0.55 + step(0.93 - surfWave, pxLocalUv.x) * 0.45) : 0.0;
      float edgeS = ((mask & 4) != 0) ? (step(0.85 - surfWave, pxLocalUv.y) * 0.55 + step(0.93 - surfWave, pxLocalUv.y) * 0.45) : 0.0;
      float edgeW = ((mask & 8) != 0) ? (step(pxLocalUv.x, 0.15 + surfWave) * 0.55 + step(pxLocalUv.x, 0.07 + surfWave) * 0.45) : 0.0;
      float edge = max(max(edgeN, edgeS), max(edgeE, edgeW));
      foamFactor = edge * foamLace;
    } else {
      float edgeDist = min(min(pxLocalUv.x, 1.0 - pxLocalUv.x), min(pxLocalUv.y, 1.0 - pxLocalUv.y));
      float rimFoam = step(edgeDist, 0.14 + surfWave) * 0.55 + step(edgeDist, 0.07 + surfWave) * 0.45;
      float crestFoam = step(0.76, 0.5 + 0.5 * w1) * rowMask * 0.32;
      foamFactor = clamp((rimFoam + crestFoam) * foamLace * vFoamMask, 0.0, 1.0);
    }
  }

  waterColor = mix(waterColor, uFoamColor, clamp(foamFactor * 0.84, 0.0, 0.88));

  float alpha = mix(0.84, 0.96, vDepthFactor);
  alpha = clamp(max(alpha, foamFactor * 0.96), 0.0, 1.0);

  fragColor = vec4(waterColor, alpha);
  fragEmissive = vec4(sparkleEmissive, alpha);
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

uniform float uSunbeamAngle;

out vec2 vUv;
flat out vec2 vSunbeamCS;

void main() {
  vUv = aUnitPos;
  vSunbeamCS = vec2(cos(uSunbeamAngle), sin(uSunbeamAngle));
  gl_Position = vec4(aUnitPos * 2.0 - 1.0, 0.0, 1.0);
}
`,
  fragment: `#version 300 es
precision highp float;

const int MAX_LIGHTS = 24;

in vec2 vUv;
flat in vec2 vSunbeamCS;

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
  return 0.65 * valueNoise(p) + 0.35 * valueNoise(p * 2.13 + vec2(4.1, 1.7));
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

  if (uLightCount > 0) {
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uLightCount) {
        break;
      }
      vec4 posRad = uLightPosRadius[i];
      float radius = max(posRad.z, 1.0);
      vec2 delta = posRad.xy - screenPos;
      float distSq = dot(delta, delta);
      float radSq = radius * radius;

      if (distSq < radSq) {
        vec4 colInt = uLightColorIntensity[i];
        float dist = sqrt(distSq);
        float att = 1.0 - (dist / radius);
        // Smooth cubic falloff with zero hard edge
        att = att * att * (3.0 - 2.0 * att);

        float flickAmt = uLightFlickerAmount[i] * motionScale;
        float flicker = 1.0;
        if (flickAmt > 0.001) {
          float phase = uTime * max(posRad.w, 0.5) + float(i) * 2.37;
          flicker = 1.0 + (sin(phase) * 0.65 + sin(phase * 2.13) * 0.35) * flickAmt;
        }

        float ndotl = 1.0;
        if (uHasNormal > 0.5) {
          vec3 lightDir = normalize(vec3(delta.x, -delta.y, radius * 0.38));
          ndotl = clamp(dot(normal, lightDir) * 0.65 + 0.45, 0.35, 1.1);
        }

        float baseEnergy = max(colInt.a, 0.0) * flicker;
        float attEnergy = baseEnergy * att;
        pointAccum += colInt.rgb * (attEnergy * ndotl * 0.44);
        haloAccum += colInt.rgb * (attEnergy * att * 0.065);
      }
    }
  }

  // Filmic light compression prevents overlapping lanterns/fountains/auras from clipping to white
  pointAccum = pointAccum / (1.0 + pointAccum * 1.18);
  haloAccum = min(haloAccum, vec3(0.20));
  vec3 lit = scene.rgb * (ambientLight + pointAccum) + haloAccum;
  lit = lit / (1.0 + max(lit - vec3(0.80), vec3(0.0)) * 0.72);

  // Diagonal forest canopy sunbeam shafts & drifting cloud shadows
  if (uCanopyEnabled > 0.5) {
    float ca = vSunbeamCS.x;
    float sa = vSunbeamCS.y;
    vec2 centeredUv = vUv - 0.5;
    vec2 rotUv = vec2(centeredUv.x * ca - centeredUv.y * sa, centeredUv.x * sa + centeredUv.y * ca);

    // Multi-harmonic diagonal sunbeam shafts fading naturally downward
    float drift = uTime * 0.14 * motionScale;
    float beam1 = 0.5 + 0.5 * sin(rotUv.x * 16.0 + drift);
    float beam2 = 0.5 + 0.5 * sin(rotUv.x * 29.0 - drift * 0.7 + 1.3);
    float beamMix = clamp(beam1 * 0.65 + beam2 * 0.35, 0.0, 1.0);
    float shaft = beamMix * beamMix * beamMix;
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

  // Emissive FBO contribution added after ambient & canopy attenuation so lanterns,
  // cottage windows, shrine crystals, and lava fissures glow vibrantly even in dark biomes
  if (uHasEmissive > 0.5) {
    vec4 emissive = texture(uEmissiveTex, vUv);
    lit += emissive.rgb * 0.28;
  }

  // Soft highlight compression before post bloom so warm pools never clip white
  lit = lit / (1.0 + max(lit - vec3(0.92), vec3(0.0)) * 0.82);

  fragColor = vec4(lit, scene.a);
}
`,
};

/**
 * 4) BLOOM_COMPOSITE_SHADER
 * Post-process pass performing soft multi-tap Dual-Kawase-inspired bloom halo
 * extraction & blend (uBloomIntensity, uBloomThreshold + dedicated uEmissiveTex),
 * per-biome color-grade LUT transform (uTintRgb, uContrast, uSaturation), radial
 * vignette (uVignetteStrength), and optional crisp CRT scanline + subtle phosphor
 * mask toggle (uCrtEnabled).
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
uniform sampler2D uEmissiveTex;
uniform float uHasEmissive;
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

vec3 extractLitBloom(vec2 uv, float kneeLo, float kneeHi) {
  vec2 safeUv = clamp(uv, vec2(0.001), vec2(0.999));
  vec3 c = texture(uLitTex, safeUv).rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float peak = max(c.r, max(c.g, c.b));
  float energy = max(luma, peak * 0.86);
  float softKnee = smoothstep(kneeLo, kneeHi, energy);
  return c * softKnee;
}

void main() {
  vec4 base = texture(uLitTex, vUv);
  vec3 color = base.rgb;

  // Ultra-fast bilinear Dual-Kawase bloom halo (2.5x fewer texture fetches than 12-tap dual fetch)
  if (uBloomIntensity > 0.005) {
    float effectiveThresh = max(uBloomThreshold, 0.76);
    float kneeLo = effectiveThresh - 0.08;
    float kneeHi = effectiveThresh + 0.16;

    // 4-tap bilinear diagonal Kawase ring on lit highlights (each linear tap covers 4 texels)
    vec2 t1 = uTexelSize * 2.15;
    vec3 bloom =
      (extractLitBloom(vUv + vec2(-t1.x, -t1.y), kneeLo, kneeHi) +
       extractLitBloom(vUv + vec2( t1.x, -t1.y), kneeLo, kneeHi) +
       extractLitBloom(vUv + vec2(-t1.x,  t1.y), kneeLo, kneeHi) +
       extractLitBloom(vUv + vec2( t1.x,  t1.y), kneeLo, kneeHi)) * 0.25;

    // Dedicated wide emissive halo (lanterns, shrine crystals, cottage windows, lava; center already in uLitTex)
    if (uHasEmissive > 0.5) {
      vec2 t2 = uTexelSize * 4.25;
      vec3 emBloom =
        (texture(uEmissiveTex, clamp(vUv + vec2(-t2.x, -t2.y), vec2(0.001), vec2(0.999))).rgb +
         texture(uEmissiveTex, clamp(vUv + vec2( t2.x, -t2.y), vec2(0.001), vec2(0.999))).rgb +
         texture(uEmissiveTex, clamp(vUv + vec2(-t2.x,  t2.y), vec2(0.001), vec2(0.999))).rgb +
         texture(uEmissiveTex, clamp(vUv + vec2( t2.x,  t2.y), vec2(0.001), vec2(0.999))).rgb) * 0.25;
      bloom += emBloom * 0.46;
    }

    color += bloom * (uBloomIntensity * 0.27);
  }

  // Per-biome color-grade LUT transform
  color *= uTintRgb;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, uSaturation);
  color = (color - 0.5) * uContrast + 0.5;

  // Filmic highlight roll-off to preserve vivid pixel art saturation without harsh clipping
  color = max(color, vec3(0.0));
  color = color / (1.0 + max(color - 0.84, vec3(0.0)) * 0.95);

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
  float d2 = dot(vLocalPos, vLocalPos);
  if (d2 >= 1.0) {
    discard;
  }
  float d = sqrt(d2);

  float edge = smoothstep(1.0, max(0.0, 1.0 - vSoftness), d);
  float core = exp(-d2 * mix(2.4, 5.2, vSoftness));
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
