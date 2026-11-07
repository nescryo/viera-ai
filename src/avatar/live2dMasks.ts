/** Subset of the plugin's private clipping manager API that we rely on. */
interface ClippingManagerLike {
  constructor: new () => ClippingManagerLike;
  getClippingMaskBufferSize(): number;
  setClippingMaskBufferSize(size: number): void;
  release(): void;
  initialize(model: unknown, drawableCount: number, masks: unknown, maskCounts: unknown, renderTextureCount: number): void;
}

interface RendererLike {
  _clippingManager?: ClippingManagerLike;
  getModel(): {
    getDrawableCount(): number;
    getDrawableMasks(): unknown;
    getDrawableMaskCounts(): unknown;
  };
}

/**
 * Rebuilds the clipping-mask manager with more render textures.
 *
 * Cubism supports at most 36 clipping masks with the default single render
 * texture. Models with more masks (e.g. DeepSeek-chan has 49) leave the extra
 * masked parts (mouth interior, nose highlight, ...) unclipped and visibly wrong.
 * Each extra render texture adds capacity for 32 more masks (max 64 with 2).
 *
 * The plugin does not expose this setting, so this reaches into its renderer.
 * @param internalModel The `internalModel` of a loaded Cubism 4 Live2DModel.
 * @param renderTextureCount Number of mask render textures (1 keeps the default).
 */
export function setMaskRenderTextureCount(internalModel: unknown, renderTextureCount: number): void {
  if (renderTextureCount <= 1) return;
  const renderer = (internalModel as { renderer?: RendererLike }).renderer;
  const manager = renderer?._clippingManager;
  if (!renderer || !manager) return;

  const model = renderer.getModel();
  const size = manager.getClippingMaskBufferSize();
  manager.release();

  const next = new manager.constructor();
  next.setClippingMaskBufferSize(size);
  next.initialize(
    model,
    model.getDrawableCount(),
    model.getDrawableMasks(),
    model.getDrawableMaskCounts(),
    renderTextureCount
  );
  renderer._clippingManager = next;
}
