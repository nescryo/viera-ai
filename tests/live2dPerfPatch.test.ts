import { describe, expect, it, vi } from 'vitest';
import { directionToRadian, patchCubismPhysics, type CubismPhysicsLike } from '../src/avatar/live2dPhysicsPatch';
import {
  buildPackedModelGeometry,
  patchCubismRenderer,
  type CubismModelForRenderer,
  type CubismRendererRuntimeLike,
} from '../src/avatar/live2dRendererPatch';

// Reference implementation mirroring Cubism SDK's original CubismPhysics math (with slices/vectors)
// so we can assert exact numerical parity against our zero-allocation patch.
function refDirectionToRadian(from: { x: number; y: number }, to: { x: number; y: number }): number {
  let ret = Math.atan2(to.y, to.x) - Math.atan2(from.y, from.x);
  while (ret < -Math.PI) ret += Math.PI * 2;
  while (ret > Math.PI) ret -= Math.PI * 2;
  return ret;
}

function makePhysicsFixture(fps: number) {
  const paramIds = ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamHairX', 'ParamHairY', 'ParamHairAng'];
  const values = new Float32Array([12, -8, 15, 0, 0, 0]);
  const minValues = new Float32Array([-30, -30, -30, -1, -1, -1]);
  const maxValues = new Float32Array([30, 30, 30, 1, 1, 1]);
  const defaultValues = new Float32Array([0, 0, 0, 0, 0, 0]);

  const model = {
    getParameterCount: () => paramIds.length,
    getParameterIndex: (id: string) => paramIds.indexOf(id),
    getModel: () => ({
      parameters: {
        values,
        minimumValues: minValues,
        maximumValues: maxValues,
        defaultValues,
      },
    }),
  };

  const normPos = { minimum: -10, maximum: 10, defalut: 0 };
  const normAng = { minimum: -30, maximum: 30, defalut: 0 };

  const normalize = (val: number, min: number, max: number, nMin: number, nMax: number, nDef: number, inv: boolean) => {
    const clamped = Math.max(min, Math.min(max, val));
    const mid = min + Math.abs(max - min) / 2;
    const p = clamped - mid;
    let res = nDef;
    if (p > 0) {
      res = p * ((nMax - nDef) / (max - mid)) + nDef;
    } else if (p < 0) {
      res = p * ((nMin - nDef) / (min - mid)) + nDef;
    }
    return inv ? res : -res;
  };

  const makeParticle = (y: number, radius: number) => ({
    position: { x: 0, y },
    lastPosition: { x: 0, y },
    lastGravity: { x: 0, y: 1 },
    force: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    mobility: 0.9,
    delay: 0.8,
    acceleration: 1.2,
    radius,
  });

  const physics: CubismPhysicsLike = {
    _currentRemainTime: 0,
    _options: {
      gravity: { x: 0, y: -1 },
      wind: { x: 0.05, y: 0.02 },
    },
    _currentRigOutputs: [{ outputs: [0, 0, 0] }],
    _previousRigOutputs: [{ outputs: [0, 0, 0] }],
    _physicsRig: {
      subRigCount: 1,
      fps,
      settings: [
        {
          inputCount: 3,
          outputCount: 3,
          particleCount: 3,
          baseInputIndex: 0,
          baseOutputIndex: 0,
          baseParticleIndex: 0,
          normalizationPosition: normPos,
          normalizationAngle: normAng,
        },
      ],
      inputs: [
        {
          source: { id: 'ParamAngleX' },
          sourceParameterIndex: -1,
          weight: 60,
          reflect: false,
          getNormalizedParameterValue: (t, _a, v, mn, mx, _d, np, _na, inv, w) => {
            t.x += normalize(v, mn, mx, np.minimum, np.maximum, np.defalut, inv) * w;
          },
        },
        {
          source: { id: 'ParamAngleY' },
          sourceParameterIndex: -1,
          weight: 40,
          reflect: true,
          getNormalizedParameterValue: (t, _a, v, mn, mx, _d, np, _na, inv, w) => {
            t.y += normalize(v, mn, mx, np.minimum, np.maximum, np.defalut, inv) * w;
          },
        },
        {
          source: { id: 'ParamAngleZ' },
          sourceParameterIndex: -1,
          weight: 80,
          reflect: false,
          getNormalizedParameterValue: (_t, a, v, mn, mx, _d, _np, na, inv, w) => {
            a.angle += normalize(v, mn, mx, na.minimum, na.maximum, na.defalut, inv) * w;
          },
        },
      ],
      outputs: [
        {
          destination: { id: 'ParamHairX' },
          destinationParameterIndex: -1,
          vertexIndex: 1,
          translationScale: { x: 0.25, y: 0.25 },
          angleScale: 1,
          weight: 100,
          type: 0,
          reflect: false,
          valueBelowMinimum: 0,
          valueExceededMaximum: 0,
        },
        {
          destination: { id: 'ParamHairY' },
          destinationParameterIndex: -1,
          vertexIndex: 2,
          translationScale: { x: 0.25, y: 0.3 },
          angleScale: 1,
          weight: 70,
          type: 1,
          reflect: true,
          valueBelowMinimum: 0,
          valueExceededMaximum: 0,
        },
        {
          destination: { id: 'ParamHairAng' },
          destinationParameterIndex: -1,
          vertexIndex: 2,
          translationScale: { x: 1, y: 1 },
          angleScale: 1.5,
          weight: 100,
          type: 2,
          reflect: false,
          valueBelowMinimum: 0,
          valueExceededMaximum: 0,
        },
      ],
      particles: [makeParticle(0, 0), makeParticle(5, 5), makeParticle(11, 6)],
    },
    evaluate: () => {},
    interpolate: () => {},
  };

  return { model, physics, values };
}

function runReferenceEvaluate(
  physics: CubismPhysicsLike,
  model: ReturnType<typeof makePhysicsFixture>['model'],
  dt: number,
): void {
  if (dt <= 0) return;
  const rig = physics._physicsRig!;
  physics._currentRemainTime += dt;
  if (physics._currentRemainTime > 5) physics._currentRemainTime = 0;

  const { values, minimumValues, maximumValues, defaultValues } = model.getModel().parameters;
  if (!physics._parameterCaches || physics._parameterCaches.length < model.getParameterCount()) {
    physics._parameterCaches = new Float32Array(model.getParameterCount());
  }
  if (!physics._parameterInputCaches || physics._parameterInputCaches.length < model.getParameterCount()) {
    physics._parameterInputCaches = new Float32Array(model.getParameterCount());
    for (let j = 0; j < model.getParameterCount(); ++j) physics._parameterInputCaches[j] = values[j];
  }

  const pdt = rig.fps > 0 ? 1 / rig.fps : dt;
  const applyOut = (arr: Float32Array, idx: number, val: number, out: (typeof rig.outputs)[number]) => {
    const scale = out.type === 0 ? out.translationScale.x : out.type === 1 ? out.translationScale.y : out.angleScale;
    let v = val * scale;
    if (v < minimumValues[idx]) {
      if (v < out.valueBelowMinimum) out.valueBelowMinimum = v;
      v = minimumValues[idx];
    } else if (v > maximumValues[idx]) {
      if (v > out.valueExceededMaximum) out.valueExceededMaximum = v;
      v = maximumValues[idx];
    }
    const w = out.weight / 100;
    arr[idx] = w >= 1 ? v : arr[idx] * (1 - w) + v * w;
  };

  while (physics._currentRemainTime >= pdt) {
    for (let s = 0; s < rig.subRigCount; ++s) {
      for (let i = 0; i < rig.settings[s].outputCount; ++i) {
        physics._previousRigOutputs![s].outputs[i] = physics._currentRigOutputs![s].outputs[i];
      }
    }
    const iw = pdt / physics._currentRemainTime;
    for (let j = 0; j < model.getParameterCount(); ++j) {
      physics._parameterCaches[j] = physics._parameterInputCaches[j] * (1 - iw) + values[j] * iw;
      physics._parameterInputCaches[j] = physics._parameterCaches[j];
    }
    for (let s = 0; s < rig.subRigCount; ++s) {
      const setting = rig.settings[s];
      const totalAngle = { angle: 0 };
      const totalTrans = { x: 0, y: 0 };
      const inputs = rig.inputs.slice(setting.baseInputIndex);
      const outputs = rig.outputs.slice(setting.baseOutputIndex);
      const strand = rig.particles.slice(setting.baseParticleIndex);

      for (let i = 0; i < setting.inputCount; ++i) {
        if (inputs[i].sourceParameterIndex === -1) {
          inputs[i].sourceParameterIndex = model.getParameterIndex(inputs[i].source.id);
        }
        const idx = inputs[i].sourceParameterIndex;
        inputs[i].getNormalizedParameterValue(
          totalTrans,
          totalAngle,
          physics._parameterCaches[idx],
          minimumValues[idx],
          maximumValues[idx],
          defaultValues[idx],
          setting.normalizationPosition,
          setting.normalizationAngle,
          inputs[i].reflect,
          inputs[i].weight / 100,
        );
      }

      const radAngle = (-totalAngle.angle / 180) * Math.PI;
      totalTrans.x = totalTrans.x * Math.cos(radAngle) - totalTrans.y * Math.sin(radAngle);
      totalTrans.y = totalTrans.x * Math.sin(radAngle) + totalTrans.y * Math.cos(radAngle);

      strand[0].position = { x: totalTrans.x, y: totalTrans.y };
      const tr = (totalAngle.angle / 180) * Math.PI;
      const g = { x: Math.sin(tr), y: Math.cos(tr) };
      const gl = Math.hypot(g.x, g.y);
      g.x /= gl;
      g.y /= gl;

      const threshold = 1e-3 * setting.normalizationPosition.maximum;
      for (let i = 1; i < setting.particleCount; ++i) {
        strand[i].force = {
          x: g.x * strand[i].acceleration + physics._options.wind.x,
          y: g.y * strand[i].acceleration + physics._options.wind.y,
        };
        strand[i].lastPosition = { x: strand[i].position.x, y: strand[i].position.y };
        const delay = strand[i].delay * pdt * 30;
        const dir = {
          x: strand[i].position.x - strand[i - 1].position.x,
          y: strand[i].position.y - strand[i - 1].position.y,
        };
        const r = refDirectionToRadian(strand[i].lastGravity, g) / 5;
        dir.x = Math.cos(r) * dir.x - dir.y * Math.sin(r);
        dir.y = Math.sin(r) * dir.x + dir.y * Math.cos(r);
        strand[i].position = {
          x: strand[i - 1].position.x + dir.x + strand[i].velocity.x * delay + strand[i].force.x * delay * delay,
          y: strand[i - 1].position.y + dir.y + strand[i].velocity.y * delay + strand[i].force.y * delay * delay,
        };
        const nd = {
          x: strand[i].position.x - strand[i - 1].position.x,
          y: strand[i].position.y - strand[i - 1].position.y,
        };
        const nl = Math.hypot(nd.x, nd.y);
        strand[i].position = {
          x: strand[i - 1].position.x + (nd.x / nl) * strand[i].radius,
          y: strand[i - 1].position.y + (nd.y / nl) * strand[i].radius,
        };
        if (Math.abs(strand[i].position.x) < threshold) strand[i].position.x = 0;
        if (delay !== 0) {
          strand[i].velocity = {
            x: ((strand[i].position.x - strand[i].lastPosition.x) / delay) * strand[i].mobility,
            y: ((strand[i].position.y - strand[i].lastPosition.y) / delay) * strand[i].mobility,
          };
        }
        strand[i].force = { x: 0, y: 0 };
        strand[i].lastGravity = { x: g.x, y: g.y };
      }

      for (let i = 0; i < setting.outputCount; ++i) {
        const pIdx = outputs[i].vertexIndex;
        if (outputs[i].destinationParameterIndex === -1) {
          outputs[i].destinationParameterIndex = model.getParameterIndex(outputs[i].destination.id);
        }
        const trans = {
          x: strand[pIdx].position.x - strand[pIdx - 1].position.x,
          y: strand[pIdx].position.y - strand[pIdx - 1].position.y,
        };
        let outVal: number;
        if (outputs[i].type === 0) {
          outVal = outputs[i].reflect ? -trans.x : trans.x;
        } else if (outputs[i].type === 1) {
          outVal = outputs[i].reflect ? -trans.y : trans.y;
        } else {
          const pg = pIdx >= 2
            ? {
                x: strand[pIdx - 1].position.x - strand[pIdx - 2].position.x,
                y: strand[pIdx - 1].position.y - strand[pIdx - 2].position.y,
              }
            : { x: -physics._options.gravity.x, y: -physics._options.gravity.y };
          outVal = refDirectionToRadian(pg, trans);
          if (outputs[i].reflect) outVal = -outVal;
        }
        physics._currentRigOutputs![s].outputs[i] = outVal;
        applyOut(physics._parameterCaches, outputs[i].destinationParameterIndex, outVal, outputs[i]);
      }
    }
    physics._currentRemainTime -= pdt;
  }

  const alpha = physics._currentRemainTime / pdt;
  for (let s = 0; s < rig.subRigCount; ++s) {
    const setting = rig.settings[s];
    for (let i = 0; i < setting.outputCount; ++i) {
      const out = rig.outputs[setting.baseOutputIndex + i];
      const dest = out.destinationParameterIndex;
      if (dest === -1) continue;
      const blended =
        physics._previousRigOutputs![s].outputs[i] * (1 - alpha)
        + physics._currentRigOutputs![s].outputs[i] * alpha;
      applyOut(values, dest, blended, out);
    }
  }
}

describe('live2dPhysicsPatch', () => {
  it('wraps directionToRadian identically to CubismMath across [-PI, PI]', () => {
    expect(directionToRadian(1, 0, 0, 1)).toBeCloseTo(Math.PI / 2, 12);
    expect(directionToRadian(-1, 0.01, -1, -0.01)).toBeGreaterThan(0);
    expect(directionToRadian(-1, -0.01, -1, 0.01)).toBeLessThan(0);
  });

  it('matches Cubism SDK reference physics outputs across multi-step ticks and fractional interpolation', () => {
    const patched = makePhysicsFixture(60);
    const reference = makePhysicsFixture(60);

    expect(patchCubismPhysics({ physics: patched.physics })).toBe(true);

    const frameSteps = [0.008, 0.016, 0.025, 0.009, 0.033, 0.016];
    for (let step = 0; step < frameSteps.length; ++step) {
      // Vary input parameters across frames
      const ax = Math.sin(step * 1.1) * 24;
      const ay = Math.cos(step * 0.7) * 18;
      const az = Math.sin(step * 0.5) * 20;
      patched.values[0] = ax;
      patched.values[1] = ay;
      patched.values[2] = az;
      reference.values[0] = ax;
      reference.values[1] = ay;
      reference.values[2] = az;

      patched.physics.evaluate(patched.model, frameSteps[step]);
      runReferenceEvaluate(reference.physics, reference.model, frameSteps[step]);

      for (let i = 0; i < patched.values.length; ++i) {
        expect(patched.values[i]).toBeCloseTo(reference.values[i], 6);
      }
    }
  });

  it('safely skips models without a physics rig', () => {
    expect(patchCubismPhysics(null)).toBe(false);
    expect(patchCubismPhysics({})).toBe(false);
  });
});

function createMockWebGLContext() {
  let nextId = 1;
  const counts = {
    bufferData: 0,
    bufferSubData: 0,
    useProgram: 0,
    useProgramNull: 0,
    drawElements: 0,
    blendFuncSeparate: 0,
    getParameter: 0,
    deleteBuffer: 0,
    deleteProgram: 0,
    vertexAttribPointer: 0,
  };

  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    STREAM_DRAW: 0x88e0,
    FLOAT: 0x1406,
    UNSIGNED_SHORT: 0x1403,
    TRIANGLES: 0x0004,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE_2D: 0x0de1,
    SCISSOR_TEST: 0x0c11,
    STENCIL_TEST: 0x0b90,
    DEPTH_TEST: 0x0b71,
    CULL_FACE: 0x0b44,
    BLEND: 0x0be2,
    CCW: 0x0901,
    ZERO: 0,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE_MINUS_SRC_COLOR: 0x0301,
    DST_COLOR: 0x0306,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_BINDING: 0x8ca6,
    COLOR_BUFFER_BIT: 0x4000,
    createShader: () => ({ id: nextId++ }),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    deleteShader: () => {},
    createProgram: () => ({ id: nextId++ }),
    bindAttribLocation: () => {},
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getUniformLocation: (_p: unknown, name: string) => ({ name }),
    deleteProgram: () => {
      counts.deleteProgram += 1;
    },
    useProgram: (p: unknown) => {
      counts.useProgram += 1;
      if (p === null) counts.useProgramNull += 1;
    },
    uniform1i: () => {},
    uniform4f: () => {},
    uniformMatrix4fv: () => {},
    createBuffer: () => ({ id: nextId++ }),
    deleteBuffer: () => {
      counts.deleteBuffer += 1;
    },
    bindBuffer: () => {},
    bufferData: () => {
      counts.bufferData += 1;
    },
    bufferSubData: () => {
      counts.bufferSubData += 1;
    },
    enableVertexAttribArray: () => {},
    disableVertexAttribArray: () => {},
    vertexAttribPointer: () => {
      counts.vertexAttribPointer += 1;
    },
    activeTexture: () => {},
    bindTexture: () => {},
    enable: () => {},
    disable: () => {},
    frontFace: () => {},
    colorMask: () => {},
    blendFuncSeparate: () => {
      counts.blendFuncSeparate += 1;
    },
    drawElements: () => {
      counts.drawElements += 1;
    },
    viewport: () => {},
    bindFramebuffer: () => {},
    clearColor: () => {},
    clear: () => {},
    getParameter: () => {
      counts.getParameter += 1;
      return null;
    },
  };

  return { gl: gl as unknown as WebGLRenderingContext, counts };
}

function createMockModel(): CubismModelForRenderer {
  // 3 drawables: #0 visible opacity 1, #1 visible opacity 0 (should be skipped in main pass), #2 visible opacity 1
  const verts = [
    new Float32Array([0, 0, 1, 0, 0, 1]),
    new Float32Array([0, 0, 1, 0, 0, 1]),
    new Float32Array([0, 0, 1, 0, 0, 1]),
  ];
  const uvs = [
    new Float32Array([0, 0, 1, 0, 0, 1]),
    new Float32Array([0, 0, 1, 0, 0, 1]),
    new Float32Array([0, 0, 1, 0, 0, 1]),
  ];
  const indices = [
    new Uint16Array([0, 1, 2]),
    new Uint16Array([0, 1, 2]),
    new Uint16Array([0, 1, 2]),
  ];
  const opacities = [1, 0, 1];
  const multiplyColors = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const screenColors = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  return {
    getDrawableCount: () => 3,
    getDrawableRenderOrders: () => [0, 1, 2],
    getDrawableTextureIndex: () => 0,
    getDrawableVertexCount: () => 3,
    getDrawableVertexIndexCount: () => 3,
    getDrawableVertexIndices: (i) => indices[i],
    getDrawableVertices: (i) => verts[i],
    getDrawableVertexUvs: (i) => uvs[i],
    getDrawableOpacity: (i) => opacities[i],
    getDrawableBlendMode: () => 0,
    getDrawableCulling: () => false,
    getDrawableInvertedMaskBit: () => false,
    getDrawableDynamicFlagIsVisible: () => true,
    getDrawableDynamicFlagVertexPositionsDidChange: () => true,
    getMultiplyColor: () => ({ R: 1, G: 1, B: 1, A: 1 }),
    getScreenColor: () => ({ R: 0, G: 0, B: 0, A: 0 }),
    _model: { drawables: { multiplyColors, screenColors } },
  };
}

describe('live2dRendererPatch', () => {
  it('packs static UVs and global-offset indices when total vertices fit in Uint16', () => {
    const model = createMockModel();
    const geom = buildPackedModelGeometry(model);

    expect(geom.useGlobalIndexOffset).toBe(true);
    expect(geom.totalVertices).toBe(9);
    expect(geom.totalIndices).toBe(9);
    // Drawable 0: [0,1,2], Drawable 1: [3,4,5], Drawable 2: [6,7,8]
    expect(Array.from(geom.packedIndices)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(geom.uvToDrawableIndex.get(model.getDrawableVertexUvs(2))).toBe(2);
  });

  it('deduplicates WebGL state, skips zero-opacity drawables, avoids getParameter, and frees GPU buffers on release', () => {
    const { gl, counts } = createMockWebGLContext();
    const model = createMockModel();
    const mvp = new Float32Array(16);
    const origRelease = vi.fn();

    let clipMask: unknown = null;
    let clipDraw: unknown = null;
    const renderer: CubismRendererRuntimeLike = {
      gl,
      firstDraw: true,
      _model: model,
      _modelColor: { R: 1, G: 1, B: 1, A: 1 },
      _textures: { 0: { tex: 0 } as unknown as WebGLTexture },
      _sortedDrawableIndexList: [0, 0, 0],
      _clippingManager: null,
      getModel: () => model,
      getMvpMatrix: () => ({ getArray: () => mvp }),
      isPremultipliedAlpha: () => true,
      isCulling: () => false,
      setIsCulling: () => {},
      isUsingHighPrecisionMask: () => false,
      getClippingContextBufferForMask: () => clipMask as never,
      setClippingContextBufferForMask: (c) => {
        clipMask = c;
      },
      getClippingContextBufferForDraw: () => clipDraw as never,
      setClippingContextBufferForDraw: (c) => {
        clipDraw = c;
      },
      setRenderState: () => {},
      saveProfile: () => {
        gl.getParameter(gl.FRAMEBUFFER_BINDING);
      },
      restoreProfile: () => {},
      preDraw: () => {},
      doDrawModel: () => {},
      drawMesh: () => {},
      release: origRelease,
    };

    const internal = {
      renderer,
      viewport: [0, 0, 390, 844],
      draw: (ctx: WebGLRenderingContext) => {
        renderer.setRenderState(ctx.getParameter(ctx.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null, [0, 0, 390, 844]);
        renderer.saveProfile();
        renderer.doDrawModel();
        renderer.restoreProfile();
      },
    };

    const live2dModel = {
      internalModel: internal,
      _render: () => {
        internal.draw(gl);
      },
    };

    expect(patchCubismRenderer(live2dModel)).toBe(true);

    const pixiRenderer = {
      CONTEXT_UID: 1,
      framebuffer: { current: null },
    };

    // Frame 1: creates 4 programs + 5 buffers (static UV, static Index, 3 ring vertex VBOs)
    live2dModel._render(pixiRenderer as never);
    const bufferDataAfterInit = counts.bufferData;
    expect(bufferDataAfterInit).toBe(5);
    expect(counts.getParameter).toBe(0);
    // Drawable #1 has opacity 0, so only drawables #0 and #2 are drawn
    expect(counts.drawElements).toBe(2);
    expect(counts.bufferSubData).toBe(1);
    expect(counts.blendFuncSeparate).toBe(1);

    // Frame 2: ZERO additional bufferData calls, only 1 bufferSubData, 1 useProgram, 0 getParameter
    const useProgramBeforeFrame2 = counts.useProgram;
    const useProgramNullBeforeFrame2 = counts.useProgramNull;
    live2dModel._render(pixiRenderer as never);
    expect(counts.bufferData).toBe(bufferDataAfterInit);
    expect(counts.bufferSubData).toBe(2);
    expect(counts.drawElements).toBe(4);
    expect(counts.useProgram - useProgramBeforeFrame2).toBe(1);
    expect(counts.useProgramNull - useProgramNullBeforeFrame2).toBe(0);
    expect(counts.getParameter).toBe(0);

    // Release cleans up all 4 programs and all 5 GPU buffers
    renderer.release();
    expect(counts.deleteProgram).toBe(4);
    expect(counts.deleteBuffer).toBe(5);
    expect(origRelease).toHaveBeenCalledTimes(1);
  });

  it('still draws opacity-0 drawables during clipping mask generation', () => {
    const { gl, counts } = createMockWebGLContext();
    const model = createMockModel();
    const mvp = new Float32Array(16);
    const clipMatrix = new Float32Array(16);

    const mockClipManager = {
      setupClippingContext: (m: CubismModelForRenderer, r: CubismRendererRuntimeLike) => {
        // Drawable #1 has opacity 0, but masks use texture alpha so it must still draw in the mask pass.
        r.setClippingContextBufferForMask(mockClipContext);
        r.drawMesh(
          0,
          m.getDrawableVertexIndexCount(1),
          m.getDrawableVertexCount(1),
          m.getDrawableVertexIndices(1),
          m.getDrawableVertices(1),
          m.getDrawableVertexUvs(1),
          { R: 1, G: 1, B: 1, A: 1 },
          { R: 0, G: 0, B: 0, A: 0 },
          0,
          0,
          false,
        );
      },
      getClippingContextListForDraw: () => [null, null, null],
      getClippingMaskBufferSize: () => 256,
      getMaskRenderTexture: () => [],
      getColorBuffer: () => [],
      getChannelFlagAsColor: () => ({ R: 1, G: 0, B: 0, A: 0 }),
    };

    const mockClipContext = {
      _isUsing: true,
      _bufferIndex: 0,
      _layoutChannelNo: 0,
      _layoutBounds: { x: 0, y: 0, getRight: () => 1, getBottom: () => 1 },
      _clippingIdCount: 1,
      _clippingIdList: [1],
      _matrixForMask: { getArray: () => clipMatrix },
      _matrixForDraw: { getArray: () => clipMatrix },
      getClippingManager: () => mockClipManager,
    };

    let clipMask: typeof mockClipContext | null = null;
    const renderer: CubismRendererRuntimeLike = {
      gl,
      firstDraw: true,
      _model: model,
      _modelColor: { R: 1, G: 1, B: 1, A: 1 },
      _textures: { 0: { tex: 0 } as unknown as WebGLTexture },
      _sortedDrawableIndexList: [0, 0, 0],
      _clippingManager: mockClipManager,
      getModel: () => model,
      getMvpMatrix: () => ({ getArray: () => mvp }),
      isPremultipliedAlpha: () => true,
      isCulling: () => false,
      setIsCulling: () => {},
      isUsingHighPrecisionMask: () => false,
      getClippingContextBufferForMask: () => clipMask,
      setClippingContextBufferForMask: (c) => {
        clipMask = c as typeof mockClipContext | null;
      },
      getClippingContextBufferForDraw: () => null,
      setClippingContextBufferForDraw: () => {},
      setRenderState: () => {},
      saveProfile: () => {},
      restoreProfile: () => {},
      preDraw: () => {},
      doDrawModel: () => {},
      drawMesh: () => {},
      release: () => {},
    };

    expect(patchCubismRenderer({ internalModel: { renderer } })).toBe(true);
    renderer.doDrawModel();
    // 1 draw in mask pass (drawable #1 despite opacity 0) + 2 draws in main pass (#0 and #2)
    expect(counts.drawElements).toBe(3);
  });
});
