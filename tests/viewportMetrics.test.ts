import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_HEIGHT_THRESHOLD,
  computeViewportLayout,
  isEditableElement,
  type ViewportSnapshot,
} from '../src/services/viewportMetrics';

function makeSnapshot(overrides: Partial<ViewportSnapshot> = {}): ViewportSnapshot {
  return {
    width: 390,
    height: 740,
    offsetTop: 0,
    layoutHeight: 740,
    scale: 1,
    isTouchDevice: true,
    isTextInputFocused: false,
    ...overrides,
  };
}

describe('isEditableElement', () => {
  it('returns true for text inputs, textareas, and contentEditable nodes', () => {
    expect(isEditableElement({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isEditableElement({ tagName: 'INPUT', type: 'email' })).toBe(true);
    expect(isEditableElement({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isEditableElement({ tagName: 'input' })).toBe(true);
    expect(isEditableElement({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableElement({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('returns false for non-text inputs, disabled/readOnly fields, and non-editable nodes', () => {
    expect(isEditableElement({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isEditableElement({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isEditableElement({ tagName: 'INPUT', type: 'radio' })).toBe(false);
    expect(isEditableElement({ tagName: 'INPUT', type: 'button' })).toBe(false);
    expect(isEditableElement({ tagName: 'INPUT', type: 'file' })).toBe(false);
    expect(isEditableElement({ tagName: 'INPUT', type: 'text', disabled: true })).toBe(false);
    expect(isEditableElement({ tagName: 'INPUT', type: 'text', readOnly: true })).toBe(false);
    expect(isEditableElement({ tagName: 'DIV' })).toBe(false);
    expect(isEditableElement(null)).toBe(false);
    expect(isEditableElement(undefined)).toBe(false);
  });
});

describe('computeViewportLayout', () => {
  it('initializes app and scene height to the visible viewport height on mobile load', () => {
    const initial = computeViewportLayout(null, makeSnapshot({ height: 740, layoutHeight: 740 }));
    expect(initial.appTop).toBe(0);
    expect(initial.appHeight).toBe(740);
    expect(initial.sceneHeight).toBe(740);
    expect(initial.isKeyboardOpen).toBe(false);
  });

  it('locks sceneHeight and shrinks only appHeight when Android Chrome keyboard opens (resizes-content)', () => {
    const initial = computeViewportLayout(null, makeSnapshot({ height: 740, layoutHeight: 740 }));
    const open = computeViewportLayout(
      initial.nextState,
      makeSnapshot({
        height: 420,
        layoutHeight: 420,
        offsetTop: 0,
        isTextInputFocused: true,
      }),
    );

    expect(open.isKeyboardOpen).toBe(true);
    expect(open.appTop).toBe(0);
    expect(open.appHeight).toBe(420);
    expect(open.sceneHeight).toBe(740);
  });

  it('tracks visualViewport offsetTop and locks sceneHeight when iOS Safari pans for keyboard', () => {
    const initial = computeViewportLayout(null, makeSnapshot({ height: 664, layoutHeight: 664 }));
    const open = computeViewportLayout(
      initial.nextState,
      makeSnapshot({
        height: 364,
        layoutHeight: 664,
        offsetTop: 300,
        isTextInputFocused: true,
      }),
    );

    expect(open.isKeyboardOpen).toBe(true);
    expect(open.appTop).toBe(300);
    expect(open.appHeight).toBe(364);
    expect(open.sceneHeight).toBe(664);

    // Mid-close frame after blur: keep sceneHeight locked until the keyboard finishes sliding down.
    const closing = computeViewportLayout(
      open.nextState,
      makeSnapshot({
        height: 480,
        layoutHeight: 664,
        offsetTop: 184,
        isTextInputFocused: false,
      }),
    );
    expect(closing.isKeyboardOpen).toBe(true);
    expect(closing.sceneHeight).toBe(664);

    // Fully closed: returns cleanly to the baseline height.
    const closed = computeViewportLayout(
      closing.nextState,
      makeSnapshot({
        height: 664,
        layoutHeight: 664,
        offsetTop: 0,
        isTextInputFocused: false,
      }),
    );
    expect(closed.isKeyboardOpen).toBe(false);
    expect(closed.appTop).toBe(0);
    expect(closed.appHeight).toBe(664);
    expect(closed.sceneHeight).toBe(664);
  });

  it('clears keyboard-open state when Android system back hides keyboard while input stays focused', () => {
    const initial = computeViewportLayout(null, makeSnapshot({ height: 740, layoutHeight: 740 }));
    const open = computeViewportLayout(
      initial.nextState,
      makeSnapshot({ height: 420, layoutHeight: 420, isTextInputFocused: true }),
    );
    const dismissed = computeViewportLayout(
      open.nextState,
      makeSnapshot({ height: 740, layoutHeight: 740, isTextInputFocused: true }),
    );

    expect(dismissed.isKeyboardOpen).toBe(false);
    expect(dismissed.appHeight).toBe(740);
    expect(dismissed.sceneHeight).toBe(740);
  });

  it('tracks small browser address-bar height changes without flagging a keyboard', () => {
    const initial = computeViewportLayout(null, makeSnapshot({ height: 740, layoutHeight: 740 }));
    const barHidden = computeViewportLayout(
      initial.nextState,
      makeSnapshot({ height: 800, layoutHeight: 800 }),
    );
    expect(barHidden.isKeyboardOpen).toBe(false);
    expect(barHidden.appHeight).toBe(800);
    expect(barHidden.sceneHeight).toBe(800);

    const drop = Math.min(60, KEYBOARD_HEIGHT_THRESHOLD - 1);
    const barShown = computeViewportLayout(
      barHidden.nextState,
      makeSnapshot({ height: 800 - drop, layoutHeight: 800 - drop, isTextInputFocused: true }),
    );
    expect(barShown.isKeyboardOpen).toBe(false);
    expect(barShown.appHeight).toBe(800 - drop);
    expect(barShown.sceneHeight).toBe(800 - drop);
  });

  it('resets baseline dimensions cleanly on orientation change', () => {
    const portrait = computeViewportLayout(null, makeSnapshot({ width: 390, height: 740, layoutHeight: 740 }));
    const landscape = computeViewportLayout(
      portrait.nextState,
      makeSnapshot({ width: 740, height: 360, layoutHeight: 360 }),
    );

    expect(landscape.isKeyboardOpen).toBe(false);
    expect(landscape.appHeight).toBe(360);
    expect(landscape.sceneHeight).toBe(360);
    expect(landscape.nextState.stableWidth).toBe(740);
    expect(landscape.nextState.stableHeight).toBe(360);
  });

  it('does not treat desktop window resizes or touch split-screen without focus as a keyboard', () => {
    const desktopInit = computeViewportLayout(
      null,
      makeSnapshot({ width: 1280, height: 900, layoutHeight: 900, isTouchDevice: false }),
    );
    const desktopResized = computeViewportLayout(
      desktopInit.nextState,
      makeSnapshot({
        width: 1280,
        height: 550,
        layoutHeight: 550,
        isTouchDevice: false,
        isTextInputFocused: true,
      }),
    );
    expect(desktopResized.isKeyboardOpen).toBe(false);
    expect(desktopResized.appHeight).toBe(550);
    expect(desktopResized.sceneHeight).toBe(550);

    const touchInit = computeViewportLayout(null, makeSnapshot({ width: 390, height: 740, layoutHeight: 740 }));
    const splitScreen = computeViewportLayout(
      touchInit.nextState,
      makeSnapshot({ width: 390, height: 370, layoutHeight: 370, isTextInputFocused: false }),
    );
    expect(splitScreen.isKeyboardOpen).toBe(false);
    expect(splitScreen.appHeight).toBe(370);
    expect(splitScreen.sceneHeight).toBe(370);
  });

  it('ignores pinch-zoom shrinkage and clamps negative overscroll offsetTop', () => {
    const initial = computeViewportLayout(null, makeSnapshot({ height: 740, layoutHeight: 740 }));
    const zoomed = computeViewportLayout(
      initial.nextState,
      makeSnapshot({ height: 400, layoutHeight: 740, offsetTop: 120, scale: 1.8, isTextInputFocused: true }),
    );
    expect(zoomed.isKeyboardOpen).toBe(false);
    expect(zoomed.appTop).toBe(0);
    expect(zoomed.appHeight).toBe(740);
    expect(zoomed.sceneHeight).toBe(740);

    const overscroll = computeViewportLayout(
      initial.nextState,
      makeSnapshot({ height: 740, layoutHeight: 740, offsetTop: -24 }),
    );
    expect(overscroll.appTop).toBe(0);
  });
});
