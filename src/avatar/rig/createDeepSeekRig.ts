import type * as PIXI from 'pixi.js';
import type {
  ArmSide,
  ClothHit,
  DeepSeekRigFrameState,
  EarSide,
  EmotionMoodOffsets,
  ExternalTouchState,
  FaceTouchMode,
  HairGroup,
  Live2DModelLike,
  SkirtSide,
  TailZone,
} from './types';
import { EMPTY_EXTERNAL_TOUCH } from './types';
import { computeEmotionMoodOffsets, createCoordConverter, createParamAccessors } from './math';
import { createFaceTouchController } from './faceTouch';
import { createBodyIdleController } from './bodyIdle';
import { createHeadFollowController } from './headFollow';
import { createHairPhysicsController } from './hairPhysics';
import { createEarTouchController } from './earTouch';
import { createArmTouchController } from './armTouch';
import { createChestTouchController } from './chestTouch';
import { createSkirtTouchController } from './skirtTouch';
import { createClothTouchController } from './clothTouch';
import { createTailTouchController } from './tailTouch';

export interface DeepSeekRig {
  /** Called in `afterMotionUpdate` (before `physics.evaluate()`). */
  stepPrePhysics(dt: number, state: DeepSeekRigFrameState): void;
  /** Called in `beforeModelUpdate` (after expressions & lip-sync, before `coreModel.update()`). */
  stepPostPhysics(dt: number, state: DeepSeekRigFrameState): void;
  /** Resets all springs and touch states. */
  reset(): void;
  /** Unbinds all DOM listeners and restores the original `coreModel.update`. */
  dispose(): void;
}

const INTERACTIVE_UI_SELECTOR =
  'button, a, input, textarea, select, [role="button"], [contenteditable="true"], .chat-bubble';

/** Minimal DOM element surface needed to decide whether a pointerdown may pass through to the Live2D rig. */
export interface PassThroughElementLike {
  closest(selector: string): PassThroughFeedLike | PassThroughElementLike | null;
}

/** Minimal scrollable feed container surface for touch-scroll preservation. */
export interface PassThroughFeedLike {
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Returns true if a `pointerdown` on `target` is allowed to hit-test the Live2D canvas:
 * - Always true directly on `canvas`.
 * - True on empty space inside `.chat-messages-feed` (excluding `.chat-bubble` text and
 *   interactive controls like buttons/links), so users can freely select/copy message text
 *   and scroll with the mouse wheel while still touching the character through feed gaps.
 * - On touchscreens, preserves native vertical touch-scrolling when the chat feed overflows.
 */
export function canStartRigPointerDown(
  target: unknown,
  canvas: unknown,
  pointerType: string,
): boolean {
  if (target === canvas) return true;
  if (!target || typeof (target as PassThroughElementLike).closest !== 'function') return false;

  const el = target as PassThroughElementLike;
  if (el.closest(INTERACTIVE_UI_SELECTOR)) return false;

  const feed = el.closest('.chat-messages-feed') as PassThroughFeedLike | null;
  if (!feed) return false;

  if (pointerType === 'touch' && feed.scrollHeight > feed.clientHeight + 2) {
    return false;
  }
  return true;
}

/**
 * Wires the complete DeepSeek-chan animation & interactive touch pipeline:
 * - Two-stage physics (`PositionX/Y/Z` pre-physics + crisp grounded posture post-physics)
 * - Nose-anchored cursor gaze follow + cascading maid headdress & head ribbons
 * - 26-parameter multi-segment hair physics + heavy back-hair pendulum (`LateHairZ`)
 * - Whale-ear idle twitches, emotion-coupled perk/droop, and interactive ear grab/squish
 * - Face touch (cheek pull, eye poke, headpat), 2-bone arm IK + speaking gestures + billowing sleeves,
 *   chest touch, short/long skirt pinch, cloth pinch, and 5-bone whale tail wag
 */
export function createDeepSeekRig(
  model: Live2DModelLike,
  app: PIXI.Application,
): DeepSeekRig {
  const internal = model.internalModel;
  const core = internal.coreModel;
  const view = app.view as HTMLCanvasElement;

  // Disable plugin's built-in CubismBreath so Viera's BreathingCycle and BodyIdle are the
  // single clean source of truth (avoids double-breathing and phantom head sway while replying).
  internal.breath?.setParameters([]);

  const params = createParamAccessors(core);
  const coords = createCoordConverter(model, view, app.screen);

  const faceTouch = createFaceTouchController(internal, params, coords);
  const bodyIdle = createBodyIdleController(internal, params);
  const headFollow = createHeadFollowController(internal, params, coords);
  const hairPhysics = createHairPhysicsController(internal, params, coords);
  const earTouch = createEarTouchController(internal, params, coords);
  const armTouch = createArmTouchController(internal, params, coords);
  const chestTouch = createChestTouchController(internal, params, coords);
  const skirtTouch = createSkirtTouchController(internal, params, coords);
  const clothTouch = createClothTouchController(internal, params, coords);
  const tailTouch = createTailTouchController(internal, params, coords);

  // Single clean coreModel.update() wrapper for all vertex deformations, restored on dispose().
  const origCoreUpdate = core.update.bind(core);
  core.update = (): void => {
    origCoreUpdate();
    faceTouch.applyVertexDeform();
    earTouch.applyVertexDeform();
    skirtTouch.applyVertexDeform();
    clothTouch.applyVertexDeform();
    tailTouch.applyVertexDeform();
  };

  let currentExt: ExternalTouchState = { ...EMPTY_EXTERNAL_TOUCH };
  let activeChest: 'left' | 'right' | null = null;
  let activeEar: EarSide | null = null;
  let activeFace: FaceTouchMode | null = null;
  let activeSkirt: SkirtSide | null = null;
  let activeCloth: ClothHit | null = null;
  let activeTail: TailZone | null = null;
  let activeArm: ArmSide | null = null;
  let activeHair: HairGroup | null = null;
  let activePointerId: number | null = null;
  let lastEmotionBase: string | null = null;
  let lastMood: EmotionMoodOffsets = {
    swayScale: 1,
    earPerk: 0,
    earFlare: 0,
    postureY: 0,
    shoulderY: 0,
    headPitch: 0,
    headTilt: 0,
  };

  const isDragging = (): boolean => Boolean(
    activeChest || activeEar || activeFace || activeSkirt ||
    activeCloth || activeTail || activeArm || activeHair,
  );

  const setExt = (patch: Partial<ExternalTouchState>): void => {
    currentExt = { ...EMPTY_EXTERNAL_TOUCH, ...patch };
    faceTouch.setExternalTouch(currentExt);
  };

  const releaseDrag = (): void => {
    if (activePointerId !== null) {
      try {
        if (view.hasPointerCapture(activePointerId)) {
          view.releasePointerCapture(activePointerId);
        }
      } catch {
        // Pointer capture may already be released by the browser.
      }
      activePointerId = null;
    }
    activeChest = null;
    activeEar = null;
    activeFace = null;
    activeSkirt = null;
    activeCloth = null;
    activeTail = null;
    activeArm = null;
    activeHair = null;
    view.style.cursor = '';
    if (document.body.style.cursor === 'grabbing') {
      document.body.style.cursor = '';
    }
    chestTouch.pointerUp();
    earTouch.pointerUp();
    armTouch.pointerUp();
    hairPhysics.pointerUp();
    faceTouch.pointerUp();
    skirtTouch.pointerUp();
    clothTouch.pointerUp();
    tailTouch.pointerUp();
    setExt({});
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (isDragging()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!canStartRigPointerDown(e.target, view, e.pointerType)) return;

    // 1. Front upper cloth accents (chest bow/collar & shoulder frills drawn over bodice).
    const frontCloth = clothTouch.tryPointerDown(e.clientX, e.clientY, 'frontTop');
    if (frontCloth) {
      activeCloth = frontCloth;
      setExt({ cloth: frontCloth });
    } else {
      // 2. Chest touch.
      const chestSide = chestTouch.tryPointerDown(e.clientX, e.clientY);
      if (chestSide) {
        activeChest = chestSide;
        setExt({ chest: chestSide });
        bodyIdle.triggerStartle(chestSide === 'left' ? 1 : -1, 0.9);
        earTouch.triggerTwitch('both', 0.7);
        hairPhysics.triggerImpulse(chestSide === 'left' ? 1 : -1, 0.85);
      } else {
        // 3. Whale ears (visible fins outside face/eyes/front-hair occluders).
        const earSide = earTouch.tryPointerDown(e.clientX, e.clientY);
        if (earSide) {
          activeEar = earSide;
          setExt({ ear: earSide });
          bodyIdle.triggerStartle(earSide === 'left' ? 1 : -1, 0.65);
          hairPhysics.triggerImpulse(earSide === 'left' ? 1 : -1, 0.55);
        } else {
          // 4. Face (cheek pinch, eye poke, headpat).
          const faceMode = faceTouch.tryPointerDown(e.clientX, e.clientY);
          if (faceMode) {
            activeFace = faceMode;
            if (faceMode === 'eye') {
              bodyIdle.triggerStartle(0, 0.6);
              earTouch.triggerTwitch('both', 0.7);
              hairPhysics.triggerImpulse(0, 0.6);
            }
          } else {
            // 5. Mid/lower cloth (waist corset/belt & thigh garter bows).
            const midCloth = clothTouch.tryPointerDown(e.clientX, e.clientY, 'midLower');
            if (midCloth) {
              activeCloth = midCloth;
              setExt({ cloth: midCloth });
            } else {
              // 6. Articulated 2-bone IK arms.
              const armSide = armTouch.tryPointerDown(e.clientX, e.clientY);
              if (armSide) {
                activeArm = armSide;
                setExt({ arm: armSide });
              } else {
                // 7. Skirt (short & long).
                const skirtSide = skirtTouch.tryPointerDown(e.clientX, e.clientY);
                if (skirtSide) {
                  activeSkirt = skirtSide;
                  setExt({ skirt: skirtSide });
                  bodyIdle.triggerStartle(skirtSide === 'left' ? 1 : skirtSide === 'right' ? -1 : 0, 0.8);
                  earTouch.triggerTwitch('both', 0.8);
                  hairPhysics.triggerImpulse(skirtSide === 'left' ? 1 : -1, 0.75);
                } else {
                  // 8. Back waist bow tails.
                  const backCloth = clothTouch.tryPointerDown(e.clientX, e.clientY, 'back');
                  if (backCloth) {
                    activeCloth = backCloth;
                    setExt({ cloth: backCloth });
                  } else {
                    // 9. Whale tail (5-bone skinning chain + fluke flip + plush squish).
                    const tailZone = tailTouch.tryPointerDown(e.clientX, e.clientY);
                    if (tailZone) {
                      activeTail = tailZone;
                      setExt({ tail: tailZone });
                      bodyIdle.triggerStartle(tailZone === 'left' ? -1 : 1, 0.95);
                      earTouch.triggerTwitch('both', 1.05);
                      hairPhysics.triggerImpulse(tailZone === 'left' ? -1 : 1, 0.9);
                    } else {
                      // 10. Multi-segment hair drag fallback.
                      const hairGroup = hairPhysics.tryPointerDown(e.clientX, e.clientY);
                      if (hairGroup) {
                        activeHair = hairGroup;
                        setExt({ hair: hairGroup });
                      } else {
                        return;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Prevent browser text selection when grabbing the character through the chat overlay.
    if (e.target !== view && e.cancelable) {
      e.preventDefault();
    }

    activePointerId = e.pointerId;
    view.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      // Window-level pointer listeners handle drag tracking even without capture.
    }
  };

  const onWindowPointerMove = (e: PointerEvent): void => {
    if (!isDragging()) {
      headFollow.setPointer(e.clientX, e.clientY);
      return;
    }
    if (activePointerId !== null && e.pointerId !== activePointerId) return;

    const dt = Math.max(app.ticker.deltaMS / 1000, 1 / 120);
    if (activeEar) {
      const { dragX, dragY } = earTouch.pointerMove(e.clientX, e.clientY);
      setExt({ ear: activeEar, dragX, dragY });
    } else if (activeFace) {
      faceTouch.pointerMove(e.clientX, e.clientY);
    } else if (activeCloth) {
      const { dragX, dragY } = clothTouch.pointerMove(e.clientX, e.clientY);
      setExt({ cloth: activeCloth, dragX, dragY });
    } else if (activeSkirt) {
      const { dragX, dragY } = skirtTouch.pointerMove(e.clientX, e.clientY);
      setExt({ skirt: activeSkirt, dragX, dragY });
    } else if (activeTail) {
      const { dragX, dragY } = tailTouch.pointerMove(e.clientX, e.clientY);
      setExt({ tail: activeTail, dragX, dragY });
    } else if (activeChest) {
      const { dragX, dragY } = chestTouch.pointerMove(e.clientX, e.clientY);
      setExt({ chest: activeChest, dragX, dragY });
    } else if (activeArm) {
      const { dragX, dragY } = armTouch.pointerMove(e.clientX, e.clientY, dt);
      setExt({ arm: activeArm, dragX, dragY });
    } else if (activeHair) {
      const { dragX, dragY } = hairPhysics.pointerMove(e.clientX, e.clientY, dt);
      setExt({ hair: activeHair, dragX, dragY });
    }
  };

  const onWindowPointerUp = (e: PointerEvent): void => {
    if (!isDragging()) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    releaseDrag();
  };

  const onPointerLeaveWindow = (): void => {
    headFollow.clearPointer();
  };

  const onWindowBlur = (): void => {
    headFollow.clearPointer();
    if (isDragging()) releaseDrag();
  };

  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointercancel', onWindowPointerUp);
  document.addEventListener('mouseleave', onPointerLeaveWindow);
  window.addEventListener('blur', onWindowBlur);

  return {
    stepPrePhysics(dt: number, state: DeepSeekRigFrameState): void {
      lastMood = computeEmotionMoodOffsets(
        state.spec.base,
        state.spec.baseWeight,
        state.spec.modifiers,
      );

      // Subtle ear/hair accent when LLM emotion shifts into high-arousal or joyful states.
      if (state.spec.base !== lastEmotionBase) {
        if (lastEmotionBase !== null) {
          if (state.spec.base === 'surprised' || state.spec.base === 'terrified') {
            earTouch.triggerTwitch('both', 0.7);
            hairPhysics.triggerImpulse(0, 0.4);
          } else if (state.spec.base === 'happy') {
            earTouch.triggerTwitch('right', 0.45);
          }
        }
        lastEmotionBase = state.spec.base;
      }

      faceTouch.stepPrePhysics(dt);
      const snap = faceTouch.getSnapshot();
      const dragging = isDragging();

      headFollow.setInput({
        enabled: true,
        suppressed: dragging,
        patActive: snap.mode === 'headpat',
        patHappy: snap.patHappy,
        patDragX: snap.patDragX,
        patDragY: snap.patDragY,
      });
      headFollow.stepPrePhysics(dt);

      const fOff = headFollow.getFollowOffset();
      bodyIdle.setInput({
        faceMode: snap.mode,
        cheekSide: snap.cheekSide,
        eyeSide: snap.eyeSide,
        patHappy: snap.patHappy,
        patDragX: snap.patDragX,
        patDragY: snap.patDragY,
        cheekXNorm: snap.cheekXNorm,
        cheekYNorm: snap.cheekYNorm,
        external: currentExt,
        followActive: headFollow.isPointerActive(),
        followX: fOff.x,
        followY: fOff.y,
        isReplying: state.isReplying,
        breath: state.breath,
        mood: lastMood,
      });
      bodyIdle.stepPrePhysics(dt);

      hairPhysics.setInput({
        patActive: snap.mode === 'headpat',
        patDragX: snap.patDragX,
        patDragY: snap.patDragY,
        patHappy: snap.patHappy,
      });
    },

    stepPostPhysics(dt: number, state: DeepSeekRigFrameState): void {
      faceTouch.stepPostPhysics(dt);
      bodyIdle.stepPostPhysics(dt);
      headFollow.stepPostPhysics(dt);
      hairPhysics.stepPostPhysics(dt);

      const snap = faceTouch.getSnapshot();
      const fOff = headFollow.getFollowOffset();

      // Feed final combined head angles and cached emotion mood into whale ears.
      earTouch.setMoodInput({
        faceMode: snap.mode,
        cheekSide: snap.cheekSide,
        eyeSide: snap.eyeSide,
        patHappy: snap.patHappy,
        patDragX: snap.patDragX,
        headAngleY: params.getParam('ParamAngleY'),
        headAngleZ: params.getParam('ParamAngleZ'),
        external: currentExt,
        mood: lastMood,
      });
      earTouch.stepPostPhysics(dt);

      // Feed current-frame lip-sync openness so speaking arm gestures & sleeve billow stay in sync.
      armTouch.setMoodInput({
        faceMode: snap.mode,
        patHappy: snap.patHappy,
        external: currentExt,
        speechLevel: state.speechLevel ?? 0,
        bodyDriverX: fOff.x * 10,
      });
      armTouch.stepPostPhysics(dt);

      chestTouch.stepPostPhysics(dt, state.breath.level);
      skirtTouch.stepPostPhysics(dt);
      clothTouch.stepPostPhysics(dt);
      tailTouch.stepPostPhysics(dt);
    },

    reset(): void {
      releaseDrag();
      bodyIdle.reset();
      headFollow.reset();
      hairPhysics.reset();
      earTouch.reset();
      armTouch.reset();
      faceTouch.reset();
      chestTouch.reset();
      skirtTouch.reset();
      clothTouch.reset();
      tailTouch.reset();
    },

    dispose(): void {
      releaseDrag();
      core.update = origCoreUpdate;
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
      document.removeEventListener('mouseleave', onPointerLeaveWindow);
      window.removeEventListener('blur', onWindowBlur);
    },
  };
}
