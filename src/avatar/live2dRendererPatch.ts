/**
 * Zero-visual-quality-loss WebGL renderer optimization patch for Cubism 4 models.
 *
 * Eliminates the main mobile WebGL/CPU bottlenecks in `pixi-live2d-display-lipsyncpatch`:
 * 1. Pre-packs immutable drawable UVs and triangle indices into single `STATIC_DRAW`
 *    buffers once per WebGL context (eliminates ~1,400+ redundant `gl.bufferData()` calls/frame).
 * 2. Uploads all vertex positions once per frame into a 3-slot streaming ring VBO
 *    (eliminates per-drawable driver buffer-ghosting on mobile tiled GPUs).
 * 3. Uses 4 dedicated GLSL programs with fixed attribute locations (`a_position = 0`,
 *    `a_texCoord = 1`) and deduplicates shader, blend mode, culling, texture, and uniform
 *    bindings instead of calling `gl.useProgram(null)` after every drawable.
 * 4. Skips invisible / zero-opacity / empty drawables in the main draw pass (while keeping
 *    mask generation drawables intact regardless of opacity).
 * 5. Eliminates 22+ synchronous `gl.getParameter()` / `gl.getVertexAttrib()` readbacks per
 *    frame in `saveProfile()` / `restoreProfile()` and reads Pixi's active FBO directly.
 */

const BLEND_ADDITIVE = 1;
const BLEND_MULTIPLICATIVE = 2;
const BLEND_SETUP_MASK = -10;

const PROG_SETUP_MASK = 0;
const PROG_UNMASKED = 1;
const PROG_MASKED = 2;
const PROG_MASKED_INVERTED = 3;

const VERTEX_RING_COUNT = 3;
const OPACITY_EPSILON = 0.001;

// Exact Cubism 4 GLSL sources (matches CubismShader_WebGL for pixel-identical rendering).
const VS_SETUP_MASK =
  'attribute vec4 a_position;'
  + 'attribute vec2 a_texCoord;'
  + 'varying vec2 v_texCoord;'
  + 'varying vec4 v_myPos;'
  + 'uniform mat4 u_clipMatrix;'
  + 'void main(){'
  + '  gl_Position = u_clipMatrix * a_position;'
  + '  v_myPos = u_clipMatrix * a_position;'
  + '  v_texCoord = a_texCoord;'
  + '  v_texCoord.y = 1.0 - v_texCoord.y;'
  + '}';

const FS_SETUP_MASK =
  'precision mediump float;'
  + 'varying vec2 v_texCoord;'
  + 'varying vec4 v_myPos;'
  + 'uniform vec4 u_baseColor;'
  + 'uniform vec4 u_channelFlag;'
  + 'uniform sampler2D s_texture0;'
  + 'void main(){'
  + '  float isInside = step(u_baseColor.x, v_myPos.x/v_myPos.w)'
  + '    * step(u_baseColor.y, v_myPos.y/v_myPos.w)'
  + '    * step(v_myPos.x/v_myPos.w, u_baseColor.z)'
  + '    * step(v_myPos.y/v_myPos.w, u_baseColor.w);'
  + '  gl_FragColor = u_channelFlag * texture2D(s_texture0, v_texCoord).a * isInside;'
  + '}';

const VS_NORMAL =
  'attribute vec4 a_position;'
  + 'attribute vec2 a_texCoord;'
  + 'varying vec2 v_texCoord;'
  + 'uniform mat4 u_matrix;'
  + 'void main(){'
  + '  gl_Position = u_matrix * a_position;'
  + '  v_texCoord = a_texCoord;'
  + '  v_texCoord.y = 1.0 - v_texCoord.y;'
  + '}';

const VS_MASKED =
  'attribute vec4 a_position;'
  + 'attribute vec2 a_texCoord;'
  + 'varying vec2 v_texCoord;'
  + 'varying vec4 v_clipPos;'
  + 'uniform mat4 u_matrix;'
  + 'uniform mat4 u_clipMatrix;'
  + 'void main(){'
  + '  gl_Position = u_matrix * a_position;'
  + '  v_clipPos = u_clipMatrix * a_position;'
  + '  v_texCoord = a_texCoord;'
  + '  v_texCoord.y = 1.0 - v_texCoord.y;'
  + '}';

const FS_NORMAL =
  'precision mediump float;'
  + 'varying vec2 v_texCoord;'
  + 'uniform vec4 u_baseColor;'
  + 'uniform sampler2D s_texture0;'
  + 'uniform vec4 u_multiplyColor;'
  + 'uniform vec4 u_screenColor;'
  + 'void main(){'
  + '  vec4 texColor = texture2D(s_texture0, v_texCoord);'
  + '  texColor.rgb = texColor.rgb * u_multiplyColor.rgb;'
  + '  texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);'
  + '  vec4 color = texColor * u_baseColor;'
  + '  gl_FragColor = vec4(color.rgb, color.a);'
  + '}';

const FS_MASKED =
  'precision mediump float;'
  + 'varying vec2 v_texCoord;'
  + 'varying vec4 v_clipPos;'
  + 'uniform vec4 u_baseColor;'
  + 'uniform vec4 u_channelFlag;'
  + 'uniform sampler2D s_texture0;'
  + 'uniform sampler2D s_texture1;'
  + 'uniform vec4 u_multiplyColor;'
  + 'uniform vec4 u_screenColor;'
  + 'void main(){'
  + '  vec4 texColor = texture2D(s_texture0, v_texCoord);'
  + '  texColor.rgb = texColor.rgb * u_multiplyColor.rgb;'
  + '  texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);'
  + '  vec4 col_formask = texColor * u_baseColor;'
  + '  vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;'
  + '  float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;'
  + '  col_formask = col_formask * maskVal;'
  + '  gl_FragColor = col_formask;'
  + '}';

const FS_MASKED_INVERTED =
  'precision mediump float;'
  + 'varying vec2 v_texCoord;'
  + 'varying vec4 v_clipPos;'
  + 'uniform sampler2D s_texture0;'
  + 'uniform sampler2D s_texture1;'
  + 'uniform vec4 u_channelFlag;'
  + 'uniform vec4 u_baseColor;'
  + 'uniform vec4 u_multiplyColor;'
  + 'uniform vec4 u_screenColor;'
  + 'void main(){'
  + '  vec4 texColor = texture2D(s_texture0, v_texCoord);'
  + '  texColor.rgb = texColor.rgb * u_multiplyColor.rgb;'
  + '  texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);'
  + '  vec4 col_formask = texColor * u_baseColor;'
  + '  vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;'
  + '  float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;'
  + '  col_formask = col_formask * (1.0 - maskVal);'
  + '  gl_FragColor = col_formask;'
  + '}';

interface ColorRGBA {
  R: number;
  G: number;
  B: number;
  A: number;
}

interface ClippingRectLike {
  x: number;
  y: number;
  getRight(): number;
  getBottom(): number;
}

interface ClippingContextLike {
  _isUsing: boolean;
  _bufferIndex: number;
  _layoutChannelNo: number;
  _layoutBounds: ClippingRectLike;
  _clippingIdCount: number;
  _clippingIdList: Int32Array | number[];
  _matrixForMask: { getArray(): Float32Array };
  _matrixForDraw: { getArray(): Float32Array };
  getClippingManager(): ClippingManagerRuntimeLike;
}

interface ClippingManagerRuntimeLike {
  setupClippingContext(model: CubismModelForRenderer, renderer: CubismRendererRuntimeLike): void;
  getClippingContextListForDraw(): Array<ClippingContextLike | null>;
  getClippingMaskBufferSize(): number;
  getMaskRenderTexture(): WebGLFramebuffer[];
  getColorBuffer(): WebGLTexture[];
  getChannelFlagAsColor(channelNo: number): ColorRGBA;
}

/** Minimal CubismModel surface used by the packed WebGL renderer. */
export interface CubismModelForRenderer {
  getDrawableCount(): number;
  getDrawableRenderOrders(): Int32Array | number[];
  getDrawableTextureIndex(index: number): number;
  getDrawableVertexCount(index: number): number;
  getDrawableVertexIndexCount(index: number): number;
  getDrawableVertexIndices(index: number): Uint16Array;
  getDrawableVertices(index: number): Float32Array;
  getDrawableVertexUvs(index: number): Float32Array;
  getDrawableOpacity(index: number): number;
  getDrawableBlendMode(index: number): number;
  getDrawableCulling(index: number): boolean;
  getDrawableInvertedMaskBit(index: number): boolean;
  getDrawableDynamicFlagIsVisible(index: number): boolean;
  getDrawableDynamicFlagVertexPositionsDidChange(index: number): boolean;
  getMultiplyColor(index: number): ColorRGBA;
  getScreenColor(index: number): ColorRGBA;
  getOverwriteFlagForModelMultiplyColors?(): boolean;
  getOverwriteFlagForDrawableMultiplyColors?(index: number): boolean;
  getOverwriteFlagForModelScreenColors?(): boolean;
  getOverwriteFlagForDrawableScreenColors?(index: number): boolean;
  _model?: {
    drawables?: {
      multiplyColors?: Float32Array;
      screenColors?: Float32Array;
    };
  };
}

/** Minimal CubismRenderer_WebGL surface patched at runtime. */
export interface CubismRendererRuntimeLike {
  gl?: WebGLRenderingContext;
  firstDraw?: boolean;
  _model?: CubismModelForRenderer;
  _modelColor?: ColorRGBA;
  _textures: Record<number, WebGLTexture | null | undefined>;
  _sortedDrawableIndexList: number[];
  _clippingManager?: ClippingManagerRuntimeLike | null;
  getModel(): CubismModelForRenderer | null;
  getMvpMatrix(): { getArray(): Float32Array };
  isPremultipliedAlpha(): boolean;
  isCulling(): boolean;
  setIsCulling(culling: boolean): void;
  isUsingHighPrecisionMask(): boolean;
  getClippingContextBufferForMask(): ClippingContextLike | null;
  setClippingContextBufferForMask(clip: ClippingContextLike | null): void;
  getClippingContextBufferForDraw(): ClippingContextLike | null;
  setClippingContextBufferForDraw(clip: ClippingContextLike | null): void;
  setRenderState(fbo: WebGLFramebuffer | null, viewport: number[]): void;
  startUp?(gl: WebGLRenderingContext): void;
  saveProfile(): void;
  restoreProfile(): void;
  preDraw(): void;
  doDrawModel(): void;
  drawMesh(
    textureNo: number,
    indexCount: number,
    vertexCount: number,
    indexArray: Uint16Array,
    vertexArray: Float32Array,
    uvArray: Float32Array,
    multiplyColor: ColorRGBA,
    screenColor: ColorRGBA,
    opacity: number,
    colorBlendMode: number,
    invertedMask: boolean,
  ): void;
  release(): void;
}

interface InternalModelForRenderer {
  renderer?: CubismRendererRuntimeLike;
  viewport?: number[];
  drawingMatrix?: { a: number; b: number; c: number; d: number; tx: number; ty: number };
  draw?: (gl: WebGLRenderingContext) => void;
}

interface PixiFramebufferLike {
  glFramebuffers?: Record<number, { framebuffer: WebGLFramebuffer | null } | undefined>;
}

interface PixiRendererLike {
  CONTEXT_UID: number;
  framebuffer?: {
    current: PixiFramebufferLike | null;
    unknownFramebuffer?: PixiFramebufferLike;
  };
}

interface Live2DModelForRenderer {
  _render?: (renderer: PixiRendererLike) => void;
  internalModel?: InternalModelForRenderer;
}

/** Pre-packed static geometry metadata for all drawables in a model. */
export interface PackedModelGeometry {
  drawableCount: number;
  totalVertices: number;
  totalFloats: number;
  totalIndices: number;
  /** True when all model vertices fit within 16-bit indices, allowing single-bind attribs. */
  useGlobalIndexOffset: boolean;
  vertexFloatOffsets: Int32Array;
  vertexByteOffsets: Int32Array;
  vertexFloatCounts: Int32Array;
  indexByteOffsets: Int32Array;
  indexCounts: Int32Array;
  packedUvs: Float32Array;
  packedIndices: Uint16Array;
  uvToDrawableIndex: Map<Float32Array, number>;
}

/**
 * Builds packed UV and index buffers plus per-drawable byte offsets from a Cubism model.
 * When total vertices fit inside `Uint16` (`<= 65535`), indices are pre-offset globally so
 * `gl.vertexAttribPointer` only needs to be configured once per frame instead of per drawable.
 */
export function buildPackedModelGeometry(model: CubismModelForRenderer): PackedModelGeometry {
  const drawableCount = model.getDrawableCount();
  const vertexFloatOffsets = new Int32Array(drawableCount);
  const vertexByteOffsets = new Int32Array(drawableCount);
  const vertexFloatCounts = new Int32Array(drawableCount);
  const indexByteOffsets = new Int32Array(drawableCount);
  const indexCounts = new Int32Array(drawableCount);

  let totalVertices = 0;
  let totalIndices = 0;
  for (let d = 0; d < drawableCount; ++d) {
    const vCount = model.getDrawableVertexCount(d);
    const iCount = model.getDrawableVertexIndexCount(d);
    vertexFloatOffsets[d] = totalVertices * 2;
    vertexByteOffsets[d] = totalVertices * 8;
    vertexFloatCounts[d] = vCount * 2;
    indexByteOffsets[d] = totalIndices * 2;
    indexCounts[d] = iCount;
    totalVertices += vCount;
    totalIndices += iCount;
  }

  const useGlobalIndexOffset = totalVertices <= 65535;
  const totalFloats = totalVertices * 2;
  const packedUvs = new Float32Array(totalFloats);
  const packedIndices = new Uint16Array(totalIndices);
  const uvToDrawableIndex = new Map<Float32Array, number>();

  let runningVertexOffset = 0;
  let runningIndexOffset = 0;
  for (let d = 0; d < drawableCount; ++d) {
    const vCount = model.getDrawableVertexCount(d);
    const iCount = indexCounts[d];
    const uvs = model.getDrawableVertexUvs(d);
    if (uvs) {
      uvToDrawableIndex.set(uvs, d);
      if (vCount > 0) {
        packedUvs.set(uvs.length === vCount * 2 ? uvs : uvs.subarray(0, vCount * 2), runningVertexOffset * 2);
      }
    }

    if (iCount > 0) {
      const indices = model.getDrawableVertexIndices(d);
      if (useGlobalIndexOffset && runningVertexOffset > 0) {
        for (let k = 0; k < iCount; ++k) {
          packedIndices[runningIndexOffset + k] = indices[k] + runningVertexOffset;
        }
      } else {
        packedIndices.set(indices.length === iCount ? indices : indices.subarray(0, iCount), runningIndexOffset);
      }
    }

    runningVertexOffset += vCount;
    runningIndexOffset += iCount;
  }

  return {
    drawableCount,
    totalVertices,
    totalFloats,
    totalIndices,
    useGlobalIndexOffset,
    vertexFloatOffsets,
    vertexByteOffsets,
    vertexFloatCounts,
    indexByteOffsets,
    indexCounts,
    packedUvs,
    packedIndices,
    uvToDrawableIndex,
  };
}

interface CompiledProgram {
  program: WebGLProgram;
  uMatrix: WebGLUniformLocation | null;
  uClipMatrix: WebGLUniformLocation | null;
  uChannelFlag: WebGLUniformLocation | null;
  uBaseColor: WebGLUniformLocation | null;
  uMultiplyColor: WebGLUniformLocation | null;
  uScreenColor: WebGLUniformLocation | null;
  mvpVersion: number;
  lastBaseR: number;
  lastBaseG: number;
  lastBaseB: number;
  lastBaseA: number;
  lastMulR: number;
  lastMulG: number;
  lastMulB: number;
  lastMulA: number;
  lastScrR: number;
  lastScrG: number;
  lastScrB: number;
  lastScrA: number;
  lastClipContext: ClippingContextLike | null;
}

interface GpuResources {
  gl: WebGLRenderingContext;
  programs: [CompiledProgram, CompiledProgram, CompiledProgram, CompiledProgram];
  staticUvBuffer: WebGLBuffer;
  staticIndexBuffer: WebGLBuffer;
  vertexRing: WebGLBuffer[];
  ringIndex: number;
  packedVertices: Float32Array;
  hasUploadedVertices: boolean;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vsSource: string,
  fsSource: string,
  hasTexture1: boolean,
): CompiledProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }

  // Bind attribute locations identically across all 4 programs so attrib arrays 0 & 1 never change.
  gl.bindAttribLocation(program, 0, 'a_position');
  gl.bindAttribLocation(program, 1, 'a_texCoord');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  gl.useProgram(program);
  const sTex0 = gl.getUniformLocation(program, 's_texture0');
  if (sTex0 !== null) gl.uniform1i(sTex0, 0);
  if (hasTexture1) {
    const sTex1 = gl.getUniformLocation(program, 's_texture1');
    if (sTex1 !== null) gl.uniform1i(sTex1, 1);
  }
  gl.useProgram(null);

  return {
    program,
    uMatrix: gl.getUniformLocation(program, 'u_matrix'),
    uClipMatrix: gl.getUniformLocation(program, 'u_clipMatrix'),
    uChannelFlag: gl.getUniformLocation(program, 'u_channelFlag'),
    uBaseColor: gl.getUniformLocation(program, 'u_baseColor'),
    uMultiplyColor: gl.getUniformLocation(program, 'u_multiplyColor'),
    uScreenColor: gl.getUniformLocation(program, 'u_screenColor'),
    mvpVersion: -1,
    lastBaseR: Number.NaN,
    lastBaseG: Number.NaN,
    lastBaseB: Number.NaN,
    lastBaseA: Number.NaN,
    lastMulR: Number.NaN,
    lastMulG: Number.NaN,
    lastMulB: Number.NaN,
    lastMulA: Number.NaN,
    lastScrR: Number.NaN,
    lastScrG: Number.NaN,
    lastScrB: Number.NaN,
    lastScrA: Number.NaN,
    lastClipContext: null,
  };
}

function initGpuResources(gl: WebGLRenderingContext, geom: PackedModelGeometry): GpuResources | null {
  const pMask = createProgram(gl, VS_SETUP_MASK, FS_SETUP_MASK, false);
  const pNorm = createProgram(gl, VS_NORMAL, FS_NORMAL, false);
  const pMasked = createProgram(gl, VS_MASKED, FS_MASKED, true);
  const pMaskedInv = createProgram(gl, VS_MASKED, FS_MASKED_INVERTED, true);
  if (!pMask || !pNorm || !pMasked || !pMaskedInv) {
    if (pMask) gl.deleteProgram(pMask.program);
    if (pNorm) gl.deleteProgram(pNorm.program);
    if (pMasked) gl.deleteProgram(pMasked.program);
    if (pMaskedInv) gl.deleteProgram(pMaskedInv.program);
    return null;
  }

  const staticUvBuffer = gl.createBuffer();
  const staticIndexBuffer = gl.createBuffer();
  const vertexRing: WebGLBuffer[] = [];
  for (let i = 0; i < VERTEX_RING_COUNT; ++i) {
    const buf = gl.createBuffer();
    if (buf) vertexRing.push(buf);
  }

  if (!staticUvBuffer || !staticIndexBuffer || vertexRing.length !== VERTEX_RING_COUNT) {
    gl.deleteProgram(pMask.program);
    gl.deleteProgram(pNorm.program);
    gl.deleteProgram(pMasked.program);
    gl.deleteProgram(pMaskedInv.program);
    if (staticUvBuffer) gl.deleteBuffer(staticUvBuffer);
    if (staticIndexBuffer) gl.deleteBuffer(staticIndexBuffer);
    for (const buf of vertexRing) gl.deleteBuffer(buf);
    return null;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, staticUvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, geom.packedUvs, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, staticIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geom.packedIndices, gl.STATIC_DRAW);

  const vertexByteLength = Math.max(4, geom.totalFloats * 4);
  for (let i = 0; i < VERTEX_RING_COUNT; ++i) {
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexRing[i]);
    gl.bufferData(gl.ARRAY_BUFFER, vertexByteLength, gl.STREAM_DRAW);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  return {
    gl,
    programs: [pMask, pNorm, pMasked, pMaskedInv],
    staticUvBuffer,
    staticIndexBuffer,
    vertexRing,
    ringIndex: 0,
    packedVertices: new Float32Array(geom.totalFloats),
    hasUploadedVertices: false,
  };
}

function disposeGpuResources(res: GpuResources | null): void {
  if (!res) return;
  const { gl } = res;
  for (const prog of res.programs) {
    gl.deleteProgram(prog.program);
  }
  gl.deleteBuffer(res.staticUvBuffer);
  gl.deleteBuffer(res.staticIndexBuffer);
  for (const buf of res.vertexRing) {
    gl.deleteBuffer(buf);
  }
}

/**
 * Installs the zero-visual-quality-loss WebGL renderer optimization patch on a loaded
 * Cubism 4 `Live2DModel`. Cleans up all allocated WebGL programs and buffers automatically
 * when the model's renderer is released.
 * @param live2dModel The loaded `Live2DModel` instance.
 * @returns `true` if the patch was installed, `false` if skipped.
 */
export function patchCubismRenderer(live2dModel: unknown): boolean {
  const l2d = live2dModel as Live2DModelForRenderer | null | undefined;
  const internal = l2d?.internalModel;
  const renderer = internal?.renderer;
  const coreModel = renderer?.getModel();
  if (!l2d || !internal || !renderer || !coreModel) {
    return false;
  }

  const geom = buildPackedModelGeometry(coreModel);
  if (geom.drawableCount === 0 || geom.totalFloats === 0 || geom.totalIndices === 0) {
    return false;
  }

  let gpu: GpuResources | null = null;
  let frameCounter = 0;
  let trackedFbo: WebGLFramebuffer | null | undefined;
  let lastFbo: WebGLFramebuffer | null = null;
  let lastViewport: number[] = [0, 0, 0, 0];

  // Per-pass WebGL state cache (reset on every preDraw / pass entry).
  let currentProgramId = -1;
  let currentBlendMode = -1;
  let currentCulling: boolean | null = null;
  let currentTex0: WebGLTexture | null = null;
  let currentTex1: WebGLTexture | null = null;
  let activeVertexBuffer: WebGLBuffer | null = null;
  let geometryBound = false;

  const resetPassState = (): void => {
    currentProgramId = -1;
    currentBlendMode = -1;
    currentCulling = null;
    currentTex0 = null;
    currentTex1 = null;
    geometryBound = false;
    if (gpu) {
      gpu.programs[PROG_MASKED].lastClipContext = null;
      gpu.programs[PROG_MASKED_INVERTED].lastClipContext = null;
    }
  };

  const ensureGpu = (gl: WebGLRenderingContext): GpuResources | null => {
    if (gpu && gpu.gl === gl) return gpu;
    if (gpu) {
      disposeGpuResources(gpu);
      gpu = null;
    }
    gpu = initGpuResources(gl, geom);
    return gpu;
  };

  const uploadFrameVertices = (gl: WebGLRenderingContext, res: GpuResources, model: CubismModelForRenderer): void => {
    const packed = res.packedVertices;
    const offsets = geom.vertexFloatOffsets;
    const counts = geom.vertexFloatCounts;
    const fullCopy = !res.hasUploadedVertices;
    let anyChanged = fullCopy;

    for (let d = 0; d < geom.drawableCount; ++d) {
      const floatCount = counts[d];
      if (floatCount <= 0) continue;
      if (!fullCopy && !model.getDrawableDynamicFlagVertexPositionsDidChange(d)) {
        continue;
      }
      const verts = model.getDrawableVertices(d);
      if (verts) {
        packed.set(verts.length === floatCount ? verts : verts.subarray(0, floatCount), offsets[d]);
        anyChanged = true;
      }
    }

    if (anyChanged) {
      res.ringIndex = (res.ringIndex + 1) % VERTEX_RING_COUNT;
      activeVertexBuffer = res.vertexRing[res.ringIndex];
      gl.bindBuffer(gl.ARRAY_BUFFER, activeVertexBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, packed);
      res.hasUploadedVertices = true;
    } else if (!activeVertexBuffer) {
      activeVertexBuffer = res.vertexRing[res.ringIndex];
    }
  };

  const bindGeometry = (gl: WebGLRenderingContext, res: GpuResources, drawableIndex: number): void => {
    if (geom.useGlobalIndexOffset) {
      if (geometryBound) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, activeVertexBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.staticUvBuffer);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.staticIndexBuffer);
      geometryBound = true;
      return;
    }

    const byteOffset = geom.vertexByteOffsets[drawableIndex];
    if (!geometryBound) {
      gl.enableVertexAttribArray(0);
      gl.enableVertexAttribArray(1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.staticIndexBuffer);
      geometryBound = true;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, activeVertexBuffer);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, byteOffset);
    gl.bindBuffer(gl.ARRAY_BUFFER, res.staticUvBuffer);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, byteOffset);
  };

  const applyCulling = (gl: WebGLRenderingContext, culling: boolean): void => {
    if (currentCulling === culling) return;
    currentCulling = culling;
    if (culling) {
      gl.enable(gl.CULL_FACE);
    } else {
      gl.disable(gl.CULL_FACE);
    }
  };

  const applyBlendMode = (gl: WebGLRenderingContext, mode: number): void => {
    if (currentBlendMode === mode) return;
    currentBlendMode = mode;
    if (mode === BLEND_ADDITIVE) {
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
    } else if (mode === BLEND_MULTIPLICATIVE) {
      gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    } else if (mode === BLEND_SETUP_MASK) {
      gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_COLOR, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
  };

  const drawMaskDrawable = (
    gl: WebGLRenderingContext,
    res: GpuResources,
    drawableIndex: number,
    texture: WebGLTexture | null,
    culling: boolean,
    clipContext: ClippingContextLike,
  ): void => {
    const indexCount = geom.indexCounts[drawableIndex];
    if (indexCount <= 0) return;

    applyCulling(gl, culling);
    applyBlendMode(gl, BLEND_SETUP_MASK);

    const prog = res.programs[PROG_SETUP_MASK];
    if (currentProgramId !== PROG_SETUP_MASK) {
      gl.useProgram(prog.program);
      currentProgramId = PROG_SETUP_MASK;
    }

    if (currentTex0 !== texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      currentTex0 = texture;
    }

    bindGeometry(gl, res, drawableIndex);

    const channel = clipContext.getClippingManager().getChannelFlagAsColor(clipContext._layoutChannelNo);
    if (prog.uChannelFlag !== null) {
      gl.uniform4f(prog.uChannelFlag, channel.R, channel.G, channel.B, channel.A);
    }
    if (prog.uClipMatrix !== null) {
      gl.uniformMatrix4fv(prog.uClipMatrix, false, clipContext._matrixForMask.getArray());
    }
    const rect = clipContext._layoutBounds;
    if (prog.uBaseColor !== null) {
      gl.uniform4f(
        prog.uBaseColor,
        rect.x * 2 - 1,
        rect.y * 2 - 1,
        rect.getRight() * 2 - 1,
        rect.getBottom() * 2 - 1,
      );
    }

    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, geom.indexByteOffsets[drawableIndex]);
  };

  const drawMainDrawable = (
    gl: WebGLRenderingContext,
    res: GpuResources,
    model: CubismModelForRenderer,
    drawableIndex: number,
    clipContext: ClippingContextLike | null,
    mvpArray: Float32Array,
    modelR: number,
    modelG: number,
    modelB: number,
    modelA: number,
    isPremul: boolean,
    rawMulColors: Float32Array | undefined,
    rawScrColors: Float32Array | undefined,
    modelMulOverwrite: boolean,
    modelScrOverwrite: boolean,
  ): void => {
    const indexCount = geom.indexCounts[drawableIndex];
    if (indexCount <= 0) return;

    const opacity = model.getDrawableOpacity(drawableIndex);
    if (opacity <= OPACITY_EPSILON) return;

    const textureNo = model.getDrawableTextureIndex(drawableIndex);
    const texture = renderer._textures[textureNo] ?? null;
    const blendMode = model.getDrawableBlendMode(drawableIndex);
    const culling = Boolean(model.getDrawableCulling(drawableIndex));
    const invertedMask = clipContext !== null && Boolean(model.getDrawableInvertedMaskBit(drawableIndex));

    const progId = clipContext === null
      ? PROG_UNMASKED
      : invertedMask
        ? PROG_MASKED_INVERTED
        : PROG_MASKED;
    const prog = res.programs[progId];

    applyCulling(gl, culling);
    applyBlendMode(gl, blendMode);

    if (currentProgramId !== progId) {
      gl.useProgram(prog.program);
      currentProgramId = progId;
    }

    if (prog.mvpVersion !== frameCounter && prog.uMatrix !== null) {
      gl.uniformMatrix4fv(prog.uMatrix, false, mvpArray);
      prog.mvpVersion = frameCounter;
    }

    if (clipContext !== null) {
      const maskTex = clipContext.getClippingManager().getColorBuffer()[clipContext._bufferIndex] ?? null;
      if (currentTex1 !== maskTex) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, maskTex);
        currentTex1 = maskTex;
      }
      if (prog.lastClipContext !== clipContext) {
        if (prog.uClipMatrix !== null) {
          gl.uniformMatrix4fv(prog.uClipMatrix, false, clipContext._matrixForDraw.getArray());
        }
        if (prog.uChannelFlag !== null) {
          const channel = clipContext.getClippingManager().getChannelFlagAsColor(clipContext._layoutChannelNo);
          gl.uniform4f(prog.uChannelFlag, channel.R, channel.G, channel.B, channel.A);
        }
        prog.lastClipContext = clipContext;
      }
    }

    if (currentTex0 !== texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      currentTex0 = texture;
    }

    bindGeometry(gl, res, drawableIndex);

    const alpha = modelA * opacity;
    const baseR = isPremul ? modelR * alpha : modelR;
    const baseG = isPremul ? modelG * alpha : modelG;
    const baseB = isPremul ? modelB * alpha : modelB;
    if (
      prog.uBaseColor !== null
      && (prog.lastBaseR !== baseR || prog.lastBaseG !== baseG || prog.lastBaseB !== baseB || prog.lastBaseA !== alpha)
    ) {
      gl.uniform4f(prog.uBaseColor, baseR, baseG, baseB, alpha);
      prog.lastBaseR = baseR;
      prog.lastBaseG = baseG;
      prog.lastBaseB = baseB;
      prog.lastBaseA = alpha;
    }

    let mulR: number;
    let mulG: number;
    let mulB: number;
    let mulA: number;
    if (
      rawMulColors
      && !modelMulOverwrite
      && !model.getOverwriteFlagForDrawableMultiplyColors?.(drawableIndex)
    ) {
      const cOff = drawableIndex * 4;
      mulR = rawMulColors[cOff];
      mulG = rawMulColors[cOff + 1];
      mulB = rawMulColors[cOff + 2];
      mulA = rawMulColors[cOff + 3];
    } else {
      const mc = model.getMultiplyColor(drawableIndex);
      mulR = mc.R;
      mulG = mc.G;
      mulB = mc.B;
      mulA = mc.A;
    }
    if (
      prog.uMultiplyColor !== null
      && (prog.lastMulR !== mulR || prog.lastMulG !== mulG || prog.lastMulB !== mulB || prog.lastMulA !== mulA)
    ) {
      gl.uniform4f(prog.uMultiplyColor, mulR, mulG, mulB, mulA);
      prog.lastMulR = mulR;
      prog.lastMulG = mulG;
      prog.lastMulB = mulB;
      prog.lastMulA = mulA;
    }

    let scrR: number;
    let scrG: number;
    let scrB: number;
    let scrA: number;
    if (
      rawScrColors
      && !modelScrOverwrite
      && !model.getOverwriteFlagForDrawableScreenColors?.(drawableIndex)
    ) {
      const cOff = drawableIndex * 4;
      scrR = rawScrColors[cOff];
      scrG = rawScrColors[cOff + 1];
      scrB = rawScrColors[cOff + 2];
      scrA = rawScrColors[cOff + 3];
    } else {
      const sc = model.getScreenColor(drawableIndex);
      scrR = sc.R;
      scrG = sc.G;
      scrB = sc.B;
      scrA = sc.A;
    }
    if (
      prog.uScreenColor !== null
      && (prog.lastScrR !== scrR || prog.lastScrG !== scrG || prog.lastScrB !== scrB || prog.lastScrA !== scrA)
    ) {
      gl.uniform4f(prog.uScreenColor, scrR, scrG, scrB, scrA);
      prog.lastScrR = scrR;
      prog.lastScrG = scrG;
      prog.lastScrB = scrB;
      prog.lastScrA = scrA;
    }

    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, geom.indexByteOffsets[drawableIndex]);
  };

  // Capture Pixi's currently bound FBO before internalModel.draw() runs so we avoid gl.getParameter().
  const origRender = l2d._render?.bind(l2d);
  if (origRender) {
    l2d._render = function renderWithTrackedFbo(pixiRenderer: PixiRendererLike): void {
      const fbSys = pixiRenderer.framebuffer;
      if (fbSys) {
        if (fbSys.current === null) {
          trackedFbo = null;
        } else if (fbSys.current && fbSys.current !== fbSys.unknownFramebuffer) {
          trackedFbo = fbSys.current.glFramebuffers?.[pixiRenderer.CONTEXT_UID]?.framebuffer ?? null;
        } else {
          trackedFbo = undefined;
        }
      } else {
        trackedFbo = undefined;
      }
      try {
        origRender(pixiRenderer);
      } finally {
        trackedFbo = undefined;
      }
    };
  }

  // Wrap setRenderState to remember FBO/viewport while keeping Cubism's internal s_fbo/s_viewport in sync.
  const origSetRenderState = renderer.setRenderState.bind(renderer);
  renderer.setRenderState = function setRenderStateTracked(fbo: WebGLFramebuffer | null, viewport: number[]): void {
    lastFbo = fbo;
    lastViewport = viewport;
    origSetRenderState(fbo, viewport);
  };

  // Invalidate cached GPU resources whenever the WebGL context is (re)initialized.
  const origStartUp = renderer.startUp?.bind(renderer);
  if (origStartUp) {
    renderer.startUp = function startUpResetGpu(gl: WebGLRenderingContext): void {
      if (gpu) {
        disposeGpuResources(gpu);
        gpu = null;
      }
      origStartUp(gl);
    };
  }

  // Avoid gl.getParameter(FRAMEBUFFER_BINDING) inside internalModel.draw when Pixi's FBO is known.
  // Restore gl.getParameter immediately after the single FBO query so drawModel never sees a spoofed FBO.
  const origDraw = internal.draw?.bind(internal);
  if (origDraw) {
    internal.draw = function drawWithoutFboQuery(gl: WebGLRenderingContext): void {
      if (trackedFbo === undefined) {
        origDraw(gl);
        return;
      }
      const origGetParameter = gl.getParameter;
      const knownFbo = trackedFbo;
      gl.getParameter = function interceptedGetParameter(pname: number): unknown {
        if (pname === gl.FRAMEBUFFER_BINDING) {
          gl.getParameter = origGetParameter;
          return knownFbo;
        }
        return origGetParameter.call(this, pname);
      };
      try {
        origDraw(gl);
      } finally {
        gl.getParameter = origGetParameter;
      }
    };
  }

  // Pixi resets shader, geometry, state, and textures around Live2DModel._render(),
  // so 22 synchronous gl.getParameter()/getVertexAttrib() readbacks per frame are unnecessary.
  renderer.saveProfile = function skipProfileSave(): void {};
  renderer.restoreProfile = function lightProfileRestore(this: CubismRendererRuntimeLike): void {
    const gl = this.gl;
    if (!gl) return;
    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.colorMask(true, true, true, true);
  };

  renderer.preDraw = function fastPreDraw(this: CubismRendererRuntimeLike): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.firstDraw) {
      this.firstDraw = false;
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.enable(gl.BLEND);
    gl.colorMask(true, true, true, true);
    resetPassState();
  };

  const origDrawMesh = renderer.drawMesh.bind(renderer);
  renderer.drawMesh = function fastDrawMesh(
    this: CubismRendererRuntimeLike,
    textureNo: number,
    indexCount: number,
    vertexCount: number,
    indexArray: Uint16Array,
    vertexArray: Float32Array,
    uvArray: Float32Array,
    multiplyColor: ColorRGBA,
    screenColor: ColorRGBA,
    opacity: number,
    colorBlendMode: number,
    invertedMask: boolean,
  ): void {
    const gl = this.gl;
    const clipMask = this.getClippingContextBufferForMask();
    const drawableIndex = geom.uvToDrawableIndex.get(uvArray);
    if (gl && clipMask !== null && drawableIndex !== undefined) {
      const res = ensureGpu(gl);
      if (res) {
        const texture = this._textures[textureNo] ?? null;
        drawMaskDrawable(gl, res, drawableIndex, texture, this.isCulling(), clipMask);
        this.setClippingContextBufferForDraw(null);
        this.setClippingContextBufferForMask(null);
        return;
      }
    }

    // Fallback path if drawMesh is ever invoked directly outside doDrawModel/mask setup.
    resetPassState();
    origDrawMesh(
      textureNo,
      indexCount,
      vertexCount,
      indexArray,
      vertexArray,
      uvArray,
      multiplyColor,
      screenColor,
      opacity,
      colorBlendMode,
      invertedMask,
    );
  };

  const origDoDrawModel = renderer.doDrawModel.bind(renderer);
  renderer.doDrawModel = function fastDoDrawModel(this: CubismRendererRuntimeLike): void {
    const gl = this.gl;
    const model = this.getModel();
    if (!gl || !model) return;

    const res = ensureGpu(gl);
    if (!res) {
      origDoDrawModel();
      return;
    }

    frameCounter += 1;
    uploadFrameVertices(gl, res, model);

    const clipManager = this._clippingManager;
    if (clipManager) {
      this.preDraw();
      clipManager.setupClippingContext(model, this);
    }

    this.preDraw();

    const drawableCount = model.getDrawableCount();
    const renderOrder = model.getDrawableRenderOrders();
    const sorted = this._sortedDrawableIndexList;
    for (let i = 0; i < drawableCount; ++i) {
      sorted[renderOrder[i]] = i;
    }

    const clipList = clipManager ? clipManager.getClippingContextListForDraw() : null;
    const highPrecisionMask = this.isUsingHighPrecisionMask();
    const mvpArray = this.getMvpMatrix().getArray();
    const mc = this._modelColor;
    const modelR = mc ? mc.R : 1;
    const modelG = mc ? mc.G : 1;
    const modelB = mc ? mc.B : 1;
    const modelA = mc ? mc.A : 1;
    const isPremul = this.isPremultipliedAlpha();
    const rawDrawables = model._model?.drawables;
    const rawMulColors = rawDrawables?.multiplyColors;
    const rawScrColors = rawDrawables?.screenColors;
    const modelMulOverwrite = Boolean(model.getOverwriteFlagForModelMultiplyColors?.());
    const modelScrOverwrite = Boolean(model.getOverwriteFlagForModelScreenColors?.());

    for (let i = 0; i < drawableCount; ++i) {
      const drawableIndex = sorted[i];
      if (!model.getDrawableDynamicFlagIsVisible(drawableIndex)) {
        continue;
      }

      const clipContext = clipList ? clipList[drawableIndex] : null;
      if (clipContext !== null && highPrecisionMask && clipManager) {
        if (clipContext._isUsing) {
          const maskSize = clipManager.getClippingMaskBufferSize();
          gl.viewport(0, 0, maskSize, maskSize);
          this.preDraw();
          gl.bindFramebuffer(gl.FRAMEBUFFER, clipContext.getClippingManager().getMaskRenderTexture()[clipContext._bufferIndex]);
          gl.clearColor(1, 1, 1, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        const clipDrawCount = clipContext._clippingIdCount;
        for (let k = 0; k < clipDrawCount; ++k) {
          const clipDrawIndex = clipContext._clippingIdList[k];
          if (!model.getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
            continue;
          }
          const texture = this._textures[model.getDrawableTextureIndex(clipDrawIndex)] ?? null;
          drawMaskDrawable(gl, res, clipDrawIndex, texture, Boolean(model.getDrawableCulling(clipDrawIndex)), clipContext);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, lastFbo);
        this.setClippingContextBufferForMask(null);
        gl.viewport(lastViewport[0], lastViewport[1], lastViewport[2], lastViewport[3]);
        this.preDraw();
      }

      drawMainDrawable(
        gl,
        res,
        model,
        drawableIndex,
        clipContext,
        mvpArray,
        modelR,
        modelG,
        modelB,
        modelA,
        isPremul,
        rawMulColors,
        rawScrColors,
        modelMulOverwrite,
        modelScrOverwrite,
      );
    }

    this.setClippingContextBufferForDraw(null);
    this.setClippingContextBufferForMask(null);
  };

  const origRelease = renderer.release.bind(renderer);
  renderer.release = function releaseWithPatchedGpu(): void {
    disposeGpuResources(gpu);
    gpu = null;
    origRelease();
  };

  return true;
}
