/**
 * Zero-allocation runtime patch for Cubism 4 `CubismPhysics`.
 *
 * The upstream `pixi-live2d-display-lipsyncpatch` Cubism 4 runtime allocates
 * hundreds of `Float32Array.slice()` copies, `.slice()` sub-arrays, and thousands
 * of temporary `CubismVector2` instances inside `evaluate()`, `updateParticles()`,
 * and `interpolate()` on every render frame. On mobile browsers this drives severe
 * garbage-collection stutter even when rendering is light.
 *
 * This patch replaces `evaluate` and `interpolate` on a loaded model's physics
 * instance with mathematically identical, in-place, zero-allocation implementations.
 */

const AIR_RESISTANCE = 5;
const MAXIMUM_WEIGHT = 100;
const MOVEMENT_THRESHOLD = 1e-3;
const MAX_DELTA_TIME = 5;
const DEG_TO_RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;

const SOURCE_X = 0;
const SOURCE_Y = 1;

interface Vec2Like {
  x: number;
  y: number;
}

interface NormalizationLike {
  minimum: number;
  maximum: number;
  defalut: number;
}

interface PhysicsInputLike {
  source: { id: string };
  sourceParameterIndex: number;
  weight: number;
  reflect: boolean;
  getNormalizedParameterValue: (
    targetTranslation: Vec2Like,
    targetAngle: { angle: number },
    value: number,
    min: number,
    max: number,
    def: number,
    normPos: NormalizationLike,
    normAngle: NormalizationLike,
    isInverted: boolean,
    weight: number,
  ) => void;
}

interface PhysicsOutputLike {
  destination: { id: string };
  destinationParameterIndex: number;
  vertexIndex: number;
  translationScale: Vec2Like;
  angleScale: number;
  weight: number;
  type: number;
  reflect: boolean;
  valueBelowMinimum: number;
  valueExceededMaximum: number;
}

interface PhysicsParticleLike {
  position: Vec2Like;
  lastPosition: Vec2Like;
  lastGravity: Vec2Like;
  force: Vec2Like;
  velocity: Vec2Like;
  mobility: number;
  delay: number;
  acceleration: number;
  radius: number;
}

interface PhysicsSubRigLike {
  inputCount: number;
  outputCount: number;
  particleCount: number;
  baseInputIndex: number;
  baseOutputIndex: number;
  baseParticleIndex: number;
  normalizationPosition: NormalizationLike;
  normalizationAngle: NormalizationLike;
}

interface PhysicsRigLike {
  subRigCount: number;
  fps: number;
  settings: PhysicsSubRigLike[];
  inputs: PhysicsInputLike[];
  outputs: PhysicsOutputLike[];
  particles: PhysicsParticleLike[];
}

interface PhysicsOutputBufferLike {
  outputs: number[];
}

interface CubismCoreModelForPhysics {
  getParameterCount(): number;
  getParameterIndex(id: string): number;
  getModel(): {
    parameters: {
      values: Float32Array;
      maximumValues: Float32Array;
      minimumValues: Float32Array;
      defaultValues: Float32Array;
    };
  };
}

/** Minimal runtime surface of a Cubism 4 `CubismPhysics` instance. */
export interface CubismPhysicsLike {
  _physicsRig?: PhysicsRigLike;
  _currentRigOutputs?: PhysicsOutputBufferLike[];
  _previousRigOutputs?: PhysicsOutputBufferLike[];
  _currentRemainTime: number;
  _parameterCaches?: Float32Array;
  _parameterInputCaches?: Float32Array;
  _options: {
    gravity: Vec2Like;
    wind: Vec2Like;
  };
  evaluate(model: CubismCoreModelForPhysics, deltaTimeSeconds: number): void;
  interpolate(model: CubismCoreModelForPhysics, weight: number): void;
}

/**
 * Signed angle in radians from vector `(fromX, fromY)` to `(toX, toY)`, wrapped to `[-PI, PI]`.
 * Matches `CubismMath.directionToRadian`.
 */
export function directionToRadian(fromX: number, fromY: number, toX: number, toY: number): number {
  let ret = Math.atan2(toY, toX) - Math.atan2(fromY, fromX);
  while (ret < -Math.PI) {
    ret += TWO_PI;
  }
  while (ret > Math.PI) {
    ret -= TWO_PI;
  }
  return ret;
}

/**
 * Updates one output parameter slot in-place without slicing `target`.
 * Matches Cubism's `updateOutputParameterValue`.
 */
function applyOutputParameterValue(
  target: Float32Array,
  destIndex: number,
  minValue: number,
  maxValue: number,
  translation: number,
  output: PhysicsOutputLike,
): void {
  const outputScale = output.type === SOURCE_X
    ? output.translationScale.x
    : output.type === SOURCE_Y
      ? output.translationScale.y
      : output.angleScale;
  let value = translation * outputScale;

  if (value < minValue) {
    if (value < output.valueBelowMinimum) {
      output.valueBelowMinimum = value;
    }
    value = minValue;
  } else if (value > maxValue) {
    if (value > output.valueExceededMaximum) {
      output.valueExceededMaximum = value;
    }
    value = maxValue;
  }

  const weight = output.weight / MAXIMUM_WEIGHT;
  if (weight >= 1) {
    target[destIndex] = value;
  } else {
    target[destIndex] = target[destIndex] * (1 - weight) + value * weight;
  }
}

/**
 * Advances a pendulum particle strand in-place with zero object allocations.
 * Matches Cubism's `updateParticles` formula, including sequential x->y rotation.
 */
function updateParticlesInPlace(
  particles: PhysicsParticleLike[],
  baseIndex: number,
  strandCount: number,
  totalTransX: number,
  totalTransY: number,
  totalAngleDeg: number,
  windX: number,
  windY: number,
  thresholdValue: number,
  deltaTimeSeconds: number,
): void {
  if (strandCount <= 0) return;

  const root = particles[baseIndex];
  root.position.x = totalTransX;
  root.position.y = totalTransY;

  const totalRadian = totalAngleDeg * DEG_TO_RAD;
  let gravX = Math.sin(totalRadian);
  let gravY = Math.cos(totalRadian);
  const gravLen = Math.sqrt(gravX * gravX + gravY * gravY);
  if (gravLen > 0) {
    gravX /= gravLen;
    gravY /= gravLen;
  }

  for (let i = 1; i < strandCount; ++i) {
    const prev = particles[baseIndex + i - 1];
    const cur = particles[baseIndex + i];

    const fx = gravX * cur.acceleration + windX;
    const fy = gravY * cur.acceleration + windY;

    const lastPosX = cur.position.x;
    const lastPosY = cur.position.y;
    cur.lastPosition.x = lastPosX;
    cur.lastPosition.y = lastPosY;

    const delay = cur.delay * deltaTimeSeconds * 30;
    const prevPosX = prev.position.x;
    const prevPosY = prev.position.y;

    let dirX = lastPosX - prevPosX;
    let dirY = lastPosY - prevPosY;

    const radian = directionToRadian(cur.lastGravity.x, cur.lastGravity.y, gravX, gravY) / AIR_RESISTANCE;
    const cosR = Math.cos(radian);
    const sinR = Math.sin(radian);
    // Preserve Cubism SDK's exact sequential mutation of dirX before computing dirY.
    dirX = cosR * dirX - dirY * sinR;
    dirY = sinR * dirX + dirY * cosR;

    const delaySq = delay * delay;
    let posX = prevPosX + dirX + cur.velocity.x * delay + fx * delaySq;
    let posY = prevPosY + dirY + cur.velocity.y * delay + fy * delaySq;

    let newDirX = posX - prevPosX;
    let newDirY = posY - prevPosY;
    const newLen = Math.sqrt(newDirX * newDirX + newDirY * newDirY);
    if (newLen > 0) {
      newDirX /= newLen;
      newDirY /= newLen;
    }

    posX = prevPosX + newDirX * cur.radius;
    posY = prevPosY + newDirY * cur.radius;

    if (Math.abs(posX) < thresholdValue) {
      posX = 0;
    }

    cur.position.x = posX;
    cur.position.y = posY;

    if (delay !== 0) {
      const invDelay = 1 / delay;
      cur.velocity.x = (posX - lastPosX) * invDelay * cur.mobility;
      cur.velocity.y = (posY - lastPosY) * invDelay * cur.mobility;
    }

    cur.force.x = 0;
    cur.force.y = 0;
    cur.lastGravity.x = gravX;
    cur.lastGravity.y = gravY;
  }
}

/**
 * Installs zero-allocation `evaluate` and `interpolate` methods on a Cubism 4
 * internal model's physics solver. Safe no-op if the model has no physics rig.
 * @param internalModel The `internalModel` of a loaded Cubism 4 `Live2DModel`.
 * @returns `true` if the patch was installed, `false` if skipped.
 */
export function patchCubismPhysics(internalModel: unknown): boolean {
  const physics = (internalModel as { physics?: CubismPhysicsLike } | null | undefined)?.physics;
  const rig = physics?._physicsRig;
  if (
    !physics
    || !rig
    || !Array.isArray(rig.settings)
    || !Array.isArray(rig.inputs)
    || !Array.isArray(rig.outputs)
    || !Array.isArray(rig.particles)
    || !Array.isArray(physics._currentRigOutputs)
    || !Array.isArray(physics._previousRigOutputs)
  ) {
    return false;
  }

  // Reusable scratch objects eliminate per-subrig allocations inside evaluate().
  const totalTranslation: Vec2Like = { x: 0, y: 0 };
  const totalAngle = { angle: 0 };

  physics.interpolate = function interpolateZeroAlloc(
    this: CubismPhysicsLike,
    model: CubismCoreModelForPhysics,
    weight: number,
  ): void {
    const activeRig = this._physicsRig;
    const currentRigOutputs = this._currentRigOutputs;
    const previousRigOutputs = this._previousRigOutputs;
    if (!activeRig || !currentRigOutputs || !previousRigOutputs) return;

    const params = model.getModel().parameters;
    const parameterValues = params.values;
    const parameterMinimumValues = params.minimumValues;
    const parameterMaximumValues = params.maximumValues;
    const settings = activeRig.settings;
    const outputs = activeRig.outputs;
    const subRigCount = activeRig.subRigCount;
    const oneMinusWeight = 1 - weight;

    for (let settingIndex = 0; settingIndex < subRigCount; ++settingIndex) {
      const currentSetting = settings[settingIndex];
      const baseOutput = currentSetting.baseOutputIndex;
      const outputCount = currentSetting.outputCount;
      const prevOuts = previousRigOutputs[settingIndex].outputs;
      const currOuts = currentRigOutputs[settingIndex].outputs;

      for (let i = 0; i < outputCount; ++i) {
        const output = outputs[baseOutput + i];
        const destIdx = output.destinationParameterIndex;
        if (destIdx < 0) continue;

        const blended = prevOuts[i] * oneMinusWeight + currOuts[i] * weight;
        applyOutputParameterValue(
          parameterValues,
          destIdx,
          parameterMinimumValues[destIdx],
          parameterMaximumValues[destIdx],
          blended,
          output,
        );
      }
    }
  };

  physics.evaluate = function evaluateZeroAlloc(
    this: CubismPhysicsLike,
    model: CubismCoreModelForPhysics,
    deltaTimeSeconds: number,
  ): void {
    if (deltaTimeSeconds <= 0) return;

    const activeRig = this._physicsRig;
    const currentRigOutputs = this._currentRigOutputs;
    const previousRigOutputs = this._previousRigOutputs;
    if (!activeRig || !currentRigOutputs || !previousRigOutputs) return;

    this._currentRemainTime += deltaTimeSeconds;
    if (this._currentRemainTime > MAX_DELTA_TIME) {
      this._currentRemainTime = 0;
    }

    const params = model.getModel().parameters;
    const parameterValues = params.values;
    const parameterMaximumValues = params.maximumValues;
    const parameterMinimumValues = params.minimumValues;
    const parameterDefaultValues = params.defaultValues;
    const paramCount = model.getParameterCount();

    if (!this._parameterCaches || this._parameterCaches.length < paramCount) {
      this._parameterCaches = new Float32Array(paramCount);
    }
    if (!this._parameterInputCaches || this._parameterInputCaches.length < paramCount) {
      this._parameterInputCaches = new Float32Array(paramCount);
      for (let j = 0; j < paramCount; ++j) {
        this._parameterInputCaches[j] = parameterValues[j];
      }
    }

    const parameterCaches = this._parameterCaches;
    const parameterInputCaches = this._parameterInputCaches;
    const physicsDeltaTime = activeRig.fps > 0 ? 1 / activeRig.fps : deltaTimeSeconds;
    const settings = activeRig.settings;
    const inputs = activeRig.inputs;
    const outputs = activeRig.outputs;
    const particles = activeRig.particles;
    const subRigCount = activeRig.subRigCount;
    const windX = this._options.wind.x;
    const windY = this._options.wind.y;
    const gravX = this._options.gravity.x;
    const gravY = this._options.gravity.y;

    while (this._currentRemainTime >= physicsDeltaTime) {
      for (let settingIndex = 0; settingIndex < subRigCount; ++settingIndex) {
        const outputCount = settings[settingIndex].outputCount;
        const prevOuts = previousRigOutputs[settingIndex].outputs;
        const currOuts = currentRigOutputs[settingIndex].outputs;
        for (let i = 0; i < outputCount; ++i) {
          prevOuts[i] = currOuts[i];
        }
      }

      const inputWeight = physicsDeltaTime / this._currentRemainTime;
      const oneMinusInputWeight = 1 - inputWeight;
      for (let j = 0; j < paramCount; ++j) {
        const blended = parameterInputCaches[j] * oneMinusInputWeight + parameterValues[j] * inputWeight;
        parameterCaches[j] = blended;
        parameterInputCaches[j] = blended;
      }

      for (let settingIndex = 0; settingIndex < subRigCount; ++settingIndex) {
        totalAngle.angle = 0;
        totalTranslation.x = 0;
        totalTranslation.y = 0;

        const currentSetting = settings[settingIndex];
        const baseInput = currentSetting.baseInputIndex;
        const inputCount = currentSetting.inputCount;
        const baseOutput = currentSetting.baseOutputIndex;
        const outputCount = currentSetting.outputCount;
        const baseParticle = currentSetting.baseParticleIndex;
        const particleCount = currentSetting.particleCount;

        for (let i = 0; i < inputCount; ++i) {
          const inp = inputs[baseInput + i];
          let srcIdx = inp.sourceParameterIndex;
          if (srcIdx === -1) {
            srcIdx = model.getParameterIndex(inp.source.id);
            inp.sourceParameterIndex = srcIdx;
          }
          if (srcIdx < 0) continue;

          inp.getNormalizedParameterValue(
            totalTranslation,
            totalAngle,
            parameterCaches[srcIdx],
            parameterMinimumValues[srcIdx],
            parameterMaximumValues[srcIdx],
            parameterDefaultValues[srcIdx],
            currentSetting.normalizationPosition,
            currentSetting.normalizationAngle,
            inp.reflect,
            inp.weight / MAXIMUM_WEIGHT,
          );
        }

        const radAngle = -totalAngle.angle * DEG_TO_RAD;
        const cosA = Math.cos(radAngle);
        const sinA = Math.sin(radAngle);
        // Preserve Cubism SDK's exact sequential mutation of totalTranslation.x before y.
        totalTranslation.x = totalTranslation.x * cosA - totalTranslation.y * sinA;
        totalTranslation.y = totalTranslation.x * sinA + totalTranslation.y * cosA;

        updateParticlesInPlace(
          particles,
          baseParticle,
          particleCount,
          totalTranslation.x,
          totalTranslation.y,
          totalAngle.angle,
          windX,
          windY,
          MOVEMENT_THRESHOLD * currentSetting.normalizationPosition.maximum,
          physicsDeltaTime,
        );

        const currOuts = currentRigOutputs[settingIndex].outputs;
        for (let i = 0; i < outputCount; ++i) {
          const output = outputs[baseOutput + i];
          const particleIndex = output.vertexIndex;
          let destIdx = output.destinationParameterIndex;
          if (destIdx === -1) {
            destIdx = model.getParameterIndex(output.destination.id);
            output.destinationParameterIndex = destIdx;
          }
          if (particleIndex < 1 || particleIndex >= particleCount) {
            continue;
          }

          const curPos = particles[baseParticle + particleIndex].position;
          const prevPos = particles[baseParticle + particleIndex - 1].position;
          const transX = curPos.x - prevPos.x;
          const transY = curPos.y - prevPos.y;

          let outputValue: number;
          if (output.type === SOURCE_X) {
            outputValue = output.reflect ? -transX : transX;
          } else if (output.type === SOURCE_Y) {
            outputValue = output.reflect ? -transY : transY;
          } else {
            let parentGravX: number;
            let parentGravY: number;
            if (particleIndex >= 2) {
              const prev2Pos = particles[baseParticle + particleIndex - 2].position;
              parentGravX = prevPos.x - prev2Pos.x;
              parentGravY = prevPos.y - prev2Pos.y;
            } else {
              parentGravX = -gravX;
              parentGravY = -gravY;
            }
            outputValue = directionToRadian(parentGravX, parentGravY, transX, transY);
            if (output.reflect) {
              outputValue = -outputValue;
            }
          }

          currOuts[i] = outputValue;
          if (destIdx >= 0) {
            applyOutputParameterValue(
              parameterCaches,
              destIdx,
              parameterMinimumValues[destIdx],
              parameterMaximumValues[destIdx],
              outputValue,
              output,
            );
          }
        }
      }

      this._currentRemainTime -= physicsDeltaTime;
    }

    const alpha = this._currentRemainTime / physicsDeltaTime;
    this.interpolate(model, alpha);
  };

  return true;
}
