export {
  RenderEngine,
  createRenderEngine,
  detectSoftwareRenderer,
  clampFrameDt,
  resolveManifestUrl,
  resolveManifestAssetUrl,
  MAX_FRAME_DT_SECONDS,
} from './RenderEngine';

export { WebGL2Backend } from './WebGL2Backend';

export {
  Canvas2DBackend,
  createDefaultCamera,
  createDefaultColorGrade,
  createDefaultCanopyConfig,
  createDefaultWaterConfig,
  type BackendStateSnapshot,
  type Custom2DDrawFn,
} from './Canvas2DBackend';

export {
  SPRITE_SHADER,
  WATER_SHADER,
  LIGHTING_CANOPY_SHADER,
  BLOOM_COMPOSITE_SHADER,
  PARTICLE_SHADER,
  ALL_SHADER_SOURCES,
  MAX_POINT_LIGHTS,
  compileShader,
  compileProgram,
  createShaderLibrary,
  type ShaderProgramSource,
  type CompiledShaderProgram,
  type ShaderLibrary,
} from '../shaders/programs';
