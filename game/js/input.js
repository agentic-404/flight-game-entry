// Ridge Runner — keyboard and mouse input. Keys are read as held state
// every frame; confirm/pause are edge-triggered actions the loop takes.
export const ACTION_NONE = 0;
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

const KEYMAP = {
  KeyW: 'throttleUp',
  ArrowUp: 'pitchUp',
  KeyS: 'throttleDown',
  ArrowDown: 'pitchDown',
  KeyA: 'bankLeft',
  ArrowLeft: 'bankLeft',
  KeyD: 'bankRight',
  ArrowRight: 'bankRight',
};

export function createInput() {
  const held = {
    throttleUp: false,
    throttleDown: false,
    pitchUp: false,
    pitchDown: false,
    bankLeft: false,
    bankRight: false,
  };
  let actions = ACTION_NONE;

  function onKeyDown(event) {
    const field = KEYMAP[event.code];
    if (field) {
      held[field] = true;
      event.preventDefault();
      return;
    }
    if (event.code === 'Enter' || event.code === 'Space') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (event.code === 'KeyR') {
      actions |= ACTION_RESTART;
    }
  }

  function onKeyUp(event) {
    const field = KEYMAP[event.code];
    if (field) held[field] = false;
  }

  function onBlur() {
    for (const key of Object.keys(held)) held[key] = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    held,
    /** Take and clear the actions queued since the last call. */
    takeActions() {
      const taken = actions;
      actions = ACTION_NONE;
      return taken;
    },
  };
}

/** Mouse (and touch) only starts and restarts: the flying is keyboard. */
export function attachClickStart(element, onClick) {
  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    onClick();
  });
}
