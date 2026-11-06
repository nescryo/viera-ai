import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display-lipsyncpatch/cubism4';
import type { Persona } from '../../types';
import { getCharacterPackage } from '../../characters/registry';
import type { CharacterPackage } from '../../characters/types';
import { ttsService } from '../../services/ttsService';
import { LipSyncSolver, SILENT_VISEMES, resolveLipSyncSource } from '../../services/tts/lipSyncSolver';
import { DEFAULT_EMOTION_ID } from '../../data/emotionRegistry';
import { setMaskRenderTextureCount } from '../../avatar/live2dMasks';
import { ParamBlender, resolveEmotionTargets, smoothFactor } from '../../avatar/paramBlender';

// pixi-live2d-display reads window.PIXI.Ticker to auto-update models.
(window as unknown as { PIXI: typeof PIXI }).PIXI = PIXI;
Live2DModel.registerTicker(PIXI.Ticker);

const MAX_HEAD_ANGLE = 30;
const MAX_BODY_ANGLE = 10;

interface SceneProps {
  currentPersona: CharacterPackage | Persona;
  currentEmotion: string;
  /** True while the LLM is generating or the reply is being spoken; eyes lock on the viewer */
  isReplying?: boolean;
}

/** Live2D viewport: loads the character's model and drives gaze, breathing, emotion and lip-sync. */
export const Scene: React.FC<SceneProps> = React.memo(({
  currentPersona,
  currentEmotion,
  isReplying = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs so state changes do not reload the model
  const emotionRef = useRef(currentEmotion);
  const replyingRef = useRef(isReplying);
  useEffect(() => { emotionRef.current = currentEmotion; }, [currentEmotion]);
  useEffect(() => { replyingRef.current = isReplying; }, [isReplying]);

  const personaId = currentPersona.id;

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const config = getCharacterPackage(personaId).model;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const app = new PIXI.Application({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1
    });
    host.appendChild(app.view as HTMLCanvasElement);

    Live2DModel.from(config.modelUrl, { autoHitTest: false, autoFocus: false })
      .then((model) => {
        if (disposed) {
          model.destroy();
          return;
        }

        const internal = model.internalModel;
        // The plugin's typings do not expose the EventEmitter methods of InternalModel.
        const events = internal as unknown as {
          on(event: 'beforeModelUpdate', fn: () => void): void;
          off(event: 'beforeModelUpdate', fn: () => void): void;
        };
        const core = internal.coreModel as unknown as {
          getParameterIndex(id: string): number;
          getParameterMinimumValue(index: number): number;
          getParameterMaximumValue(index: number): number;
          setParameterValueById(id: string, value: number): void;
        };

        // Parameter IDs that do not exist on this model are ignored.
        const hasParam = new Map<string, boolean>();
        const setParam = (id: string | undefined, value: number): void => {
          if (!id) return;
          let ok = hasParam.get(id);
          if (ok === undefined) {
            ok = core.getParameterIndex(id) >= 0;
            hasParam.set(id, ok);
          }
          if (!ok) return;
          const index = core.getParameterIndex(id);
          const clamped = Math.max(core.getParameterMinimumValue(index), Math.min(core.getParameterMaximumValue(index), value));
          core.setParameterValueById(id, clamped);
        };

        setMaskRenderTextureCount(internal, config.maskRenderTextures ?? 1);

        model.anchor.set(0.5, 0.5);
        app.stage.addChild(model);

        const layout = (): void => {
          const { width, height } = app.screen;
          const s = (height * config.scale) / internal.originalHeight;
          model.scale.set(s);
          model.position.set(width * config.anchor[0], height * config.anchor[1]);
        };
        layout();
        const resizeObserver = new ResizeObserver(layout);
        resizeObserver.observe(host);

        const pointer = { targetX: 0, targetY: 0, x: 0, y: 0 };
        const onPointerMove = (e: PointerEvent): void => {
          const rect = host.getBoundingClientRect();
          const cx = rect.left + rect.width * config.anchor[0];
          const cy = rect.top + rect.height * config.anchor[1];
          pointer.targetX = Math.max(-1, Math.min(1, (e.clientX - cx) / (rect.width / 2)));
          pointer.targetY = Math.max(-1, Math.min(1, -(e.clientY - cy) / (rect.height / 2)));
        };
        window.addEventListener('pointermove', onPointerMove);

        const blender = new ParamBlender();
        const lipSync = new LipSyncSolver();
        let elapsed = 0;

        // Runs right before the core model is updated, so these values win over motions.
        const onBeforeModelUpdate = (): void => {
          const delta = Math.min(app.ticker.deltaMS / 1000, 0.1);
          elapsed += delta;

          // Gaze: lock on the viewer while replying, otherwise follow the pointer.
          const gx = replyingRef.current ? 0 : pointer.targetX;
          const gy = replyingRef.current ? 0 : pointer.targetY;
          const follow = smoothFactor(4, delta);
          pointer.x += (gx - pointer.x) * follow;
          pointer.y += (gy - pointer.y) * follow;

          const p = config.params;
          setParam(p.angleX, pointer.x * MAX_HEAD_ANGLE);
          setParam(p.angleY, pointer.y * MAX_HEAD_ANGLE);
          setParam(p.bodyAngleX, pointer.x * MAX_BODY_ANGLE);
          setParam(p.eyeBallX, pointer.x);
          setParam(p.eyeBallY, pointer.y);
          setParam(p.breath, 0.5 + 0.5 * Math.sin(elapsed * 1.6));

          const targets = resolveEmotionTargets(config.emotions, emotionRef.current, DEFAULT_EMOTION_ID);
          blender.step(targets, delta).forEach((value, id) => setParam(id, value));

          const source = resolveLipSyncSource({
            isWebAudioPlaying: ttsService.isWebAudioPlaying(),
            isWebSpeechSpeaking: ttsService.isWebSpeechSpeaking()
          });
          const visemes = source === 'audio' ? ttsService.getVisemeWeights() : SILENT_VISEMES;
          const frame = lipSync.step(source, visemes, delta, elapsed);
          setParam(p.mouthOpen, frame.openness);
          if (p.visemes) {
            setParam(p.visemes.a, frame.a);
            setParam(p.visemes.i, frame.i);
            setParam(p.visemes.u, frame.u);
            setParam(p.visemes.e, frame.e);
            setParam(p.visemes.o, frame.o);
          }
        };
        events.on('beforeModelUpdate', onBeforeModelUpdate);

        cleanup = () => {
          events.off('beforeModelUpdate', onBeforeModelUpdate);
          window.removeEventListener('pointermove', onPointerMove);
          resizeObserver.disconnect();
        };
      })
      .catch((err: unknown) => {
        console.error('Failed to load Live2D model:', err);
      });

    return () => {
      disposed = true;
      cleanup?.();
      app.destroy(true, { children: true, texture: true, baseTexture: true });
    };
  }, [personaId]);

  return (
    <div className="scene-container">
      <div ref={containerRef} className="live2d-canvas-container" />
    </div>
  );
});
