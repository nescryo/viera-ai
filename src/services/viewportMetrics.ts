/** Minimum vertical viewport shrinkage (px) treated as a mobile virtual keyboard opening. */
export const KEYBOARD_HEIGHT_THRESHOLD = 120;

const WIDTH_CHANGE_EPSILON = 2;
const PINCH_ZOOM_SCALE_THRESHOLD = 1.02;

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** Raw viewport measurements sampled from `window` and `window.visualViewport`. */
export interface ViewportSnapshot {
  /** Visual viewport width in CSS pixels. */
  width: number;
  /** Visual viewport height in CSS pixels. */
  height: number;
  /** Visual viewport top offset relative to the layout viewport (CSS pixels). */
  offsetTop: number;
  /** Layout viewport height (`window.innerHeight`) in CSS pixels. */
  layoutHeight: number;
  /** Visual viewport pinch-zoom scale (`1` when unzoomed). */
  scale: number;
  /** True on touch/coarse-pointer devices where software keyboards appear. */
  isTouchDevice: boolean;
  /** True when an editable text field currently has focus. */
  isTextInputFocused: boolean;
}

/** Persistent baseline tracked across consecutive resize/scroll events. */
export interface ViewportTrackerState {
  stableWidth: number;
  stableHeight: number;
  wasKeyboardOpen: boolean;
}

/** Computed CSS pixel values applied to the app shell and Live2D scene container. */
export interface ViewportLayoutResult {
  appTop: number;
  appHeight: number;
  sceneHeight: number;
  isKeyboardOpen: boolean;
  nextState: ViewportTrackerState;
}

/** Minimal element surface needed to detect editable fields without requiring a full DOM. */
export interface EditableElementLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
}

/**
 * Returns true if the active element can summon a software keyboard on mobile.
 * Excludes non-text `<input>` controls such as range sliders, checkboxes, and buttons.
 */
export function isEditableElement(el: EditableElementLike | null | undefined): boolean {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const inputType = (el.type ?? 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(inputType);
  }
  return false;
}

/**
 * Computes fixed app-shell bounds and a keyboard-stable Live2D scene height from a
 * viewport snapshot.
 *
 * - Keeps the app shell (`appTop`, `appHeight`) tightly aligned to the visible viewport
 *   so mobile browser navigation bars and software keyboards never push the header off-screen.
 * - Keeps `sceneHeight` locked to the full non-keyboard viewport height while a mobile
 *   keyboard is open so the Live2D canvas does not shrink, jump, or reallocate WebGL buffers.
 */
export function computeViewportLayout(
  prevState: ViewportTrackerState | null,
  snapshot: ViewportSnapshot,
): ViewportLayoutResult {
  const width = Math.max(1, Math.round(snapshot.width));
  const height = Math.max(1, Math.round(snapshot.height));
  const layoutHeight = Math.max(1, Math.round(snapshot.layoutHeight));
  const offsetTop = Math.max(0, Math.round(snapshot.offsetTop));
  const scale = Number.isFinite(snapshot.scale) && snapshot.scale > 0 ? snapshot.scale : 1;

  if (!prevState) {
    const initialKeyboardOpen =
      snapshot.isTouchDevice &&
      snapshot.isTextInputFocused &&
      layoutHeight - height >= KEYBOARD_HEIGHT_THRESHOLD;
    const stableHeight = initialKeyboardOpen ? layoutHeight : height;
    return {
      appTop: offsetTop,
      appHeight: height,
      sceneHeight: stableHeight,
      isKeyboardOpen: initialKeyboardOpen,
      nextState: {
        stableWidth: width,
        stableHeight,
        wasKeyboardOpen: initialKeyboardOpen,
      },
    };
  }

  if (scale > PINCH_ZOOM_SCALE_THRESHOLD) {
    return {
      appTop: 0,
      appHeight: layoutHeight,
      sceneHeight: prevState.stableHeight,
      isKeyboardOpen: false,
      nextState: {
        stableWidth: prevState.stableWidth,
        stableHeight: prevState.stableHeight,
        wasKeyboardOpen: false,
      },
    };
  }

  if (!snapshot.isTouchDevice) {
    return {
      appTop: 0,
      appHeight: height,
      sceneHeight: height,
      isKeyboardOpen: false,
      nextState: {
        stableWidth: width,
        stableHeight: height,
        wasKeyboardOpen: false,
      },
    };
  }

  const widthChanged = Math.abs(width - prevState.stableWidth) > WIDTH_CHANGE_EPSILON;
  if (widthChanged) {
    const keyboardOpenAfterRotate =
      snapshot.isTextInputFocused && layoutHeight - height >= KEYBOARD_HEIGHT_THRESHOLD;
    const nextStableHeight = keyboardOpenAfterRotate ? layoutHeight : height;
    return {
      appTop: offsetTop,
      appHeight: height,
      sceneHeight: nextStableHeight,
      isKeyboardOpen: keyboardOpenAfterRotate,
      nextState: {
        stableWidth: width,
        stableHeight: nextStableHeight,
        wasKeyboardOpen: keyboardOpenAfterRotate,
      },
    };
  }

  const baselineHeight = Math.max(prevState.stableHeight, height);
  const heightDrop = baselineHeight - height;
  const isKeyboardOpen =
    heightDrop >= KEYBOARD_HEIGHT_THRESHOLD &&
    (snapshot.isTextInputFocused || prevState.wasKeyboardOpen);

  if (isKeyboardOpen) {
    return {
      appTop: offsetTop,
      appHeight: height,
      sceneHeight: baselineHeight,
      isKeyboardOpen: true,
      nextState: {
        stableWidth: prevState.stableWidth,
        stableHeight: baselineHeight,
        wasKeyboardOpen: true,
      },
    };
  }

  return {
    appTop: offsetTop,
    appHeight: height,
    sceneHeight: height,
    isKeyboardOpen: false,
    nextState: {
      stableWidth: prevState.stableWidth,
      stableHeight: height,
      wasKeyboardOpen: false,
    },
  };
}
