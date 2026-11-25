import { useLayoutEffect } from 'react';
import {
  computeViewportLayout,
  isEditableElement,
  type EditableElementLike,
  type ViewportTrackerState,
} from '../services/viewportMetrics';

const FOCUS_OUT_SETTLE_MS = 450;

function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  return coarsePointer || navigator.maxTouchPoints > 0;
}

function resetDocumentScroll(): void {
  if (window.scrollY !== 0 || document.documentElement.scrollTop !== 0) {
    window.scrollTo(0, 0);
  }
}

/**
 * Synchronizes `--app-top`, `--app-height`, and `--scene-height` CSS custom properties
 * (plus the `keyboard-open` root class) with the browser's `visualViewport`.
 *
 * Keeps the header and chat overlay within the visible viewport on mobile browsers and
 * prevents software keyboards from pushing the Live2D character or header off-screen.
 */
export function useMobileViewport(): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    let state: ViewportTrackerState | null = null;
    let settleTimer: number | null = null;
    let appliedTop = '';
    let appliedHeight = '';
    let appliedSceneHeight = '';
    let appliedKeyboardOpen = false;

    const sync = (forceClearKeyboardLatch = false): void => {
      if (forceClearKeyboardLatch && state) {
        state = { ...state, wasKeyboardOpen: false };
      }

      const prevKeyboardOpen = state?.wasKeyboardOpen ?? false;
      const snapshot = {
        width: vv ? vv.width : window.innerWidth,
        height: vv ? vv.height : window.innerHeight,
        offsetTop: vv ? vv.offsetTop : 0,
        layoutHeight: window.innerHeight,
        scale: vv ? vv.scale : 1,
        isTouchDevice: detectTouchDevice(),
        isTextInputFocused: isEditableElement(document.activeElement as EditableElementLike | null),
      };

      const result = computeViewportLayout(state, snapshot);
      state = result.nextState;

      const nextTop = `${result.appTop}px`;
      const nextHeight = `${result.appHeight}px`;
      const nextSceneHeight = `${result.sceneHeight}px`;

      if (nextTop !== appliedTop) {
        appliedTop = nextTop;
        root.style.setProperty('--app-top', nextTop);
      }
      if (nextHeight !== appliedHeight) {
        appliedHeight = nextHeight;
        root.style.setProperty('--app-height', nextHeight);
      }
      if (nextSceneHeight !== appliedSceneHeight) {
        appliedSceneHeight = nextSceneHeight;
        root.style.setProperty('--scene-height', nextSceneHeight);
      }
      if (result.isKeyboardOpen !== appliedKeyboardOpen) {
        appliedKeyboardOpen = result.isKeyboardOpen;
        root.classList.toggle('keyboard-open', result.isKeyboardOpen);
      }

      if (prevKeyboardOpen && !result.isKeyboardOpen) {
        resetDocumentScroll();
      }
    };

    const handleResizeOrScroll = (): void => {
      sync(false);
    };

    const handleFocusIn = (): void => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      sync(false);
    };

    const handleFocusOut = (): void => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        const stillFocused = isEditableElement(document.activeElement as EditableElementLike | null);
        if (!stillFocused) {
          resetDocumentScroll();
          sync(true);
        }
      }, FOCUS_OUT_SETTLE_MS);
    };

    resetDocumentScroll();
    sync(false);

    vv?.addEventListener('resize', handleResizeOrScroll);
    vv?.addEventListener('scroll', handleResizeOrScroll);
    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('orientationchange', handleResizeOrScroll);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      if (settleTimer !== null) {
        window.clearTimeout(settleTimer);
      }
      vv?.removeEventListener('resize', handleResizeOrScroll);
      vv?.removeEventListener('scroll', handleResizeOrScroll);
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('orientationchange', handleResizeOrScroll);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      root.classList.remove('keyboard-open');
      root.style.removeProperty('--app-top');
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--scene-height');
    };
  }, []);
}
