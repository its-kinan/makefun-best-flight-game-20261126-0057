// Keyboard, mouse and touch input. Held keys steer; one-shot presses (start,
// restart, pause, mission select) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice.
// On-screen buttons mirror the keys for mouse and touch pilots.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_UP = 4;
export const ACTION_DOWN = 8;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MISSION_KEYS = new Map([
  ['Digit1', 0],
  ['Digit2', 1],
  ['Digit3', 2],
]);

export function createInput(canvas) {
  const held = {
    pitchUp: false,
    pitchDown: false,
    rollLeft: false,
    rollRight: false,
    throttleUp: false,
    throttleDown: false,
  };
  let actions = 0;
  let missionPick = -1;

  window.addEventListener('keydown', (event) => {
    if (PITCH_UP.has(event.code)) held.pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) held.pitchDown = true;
    else if (ROLL_LEFT.has(event.code)) held.rollLeft = true;
    else if (ROLL_RIGHT.has(event.code)) held.rollRight = true;
    else if (THROTTLE_UP.has(event.code)) held.throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) held.throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MISSION_KEYS.has(event.code)) {
      missionPick = MISSION_KEYS.get(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (PITCH_UP.has(event.code)) held.pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) held.pitchDown = false;
    else if (ROLL_LEFT.has(event.code)) held.rollLeft = false;
    else if (ROLL_RIGHT.has(event.code)) held.rollRight = false;
    else if (THROTTLE_UP.has(event.code)) held.throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) held.throttleDown = false;
  });
  window.addEventListener('blur', () => {
    for (const key of Object.keys(held)) held[key] = false;
  });

  // Pointer steering: drag on the canvas banks and pitches toward the drag.
  let pointer = null;
  canvas.addEventListener('pointerdown', (event) => {
    pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointer && event.pointerId === pointer.id) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }
  });
  const endPointer = (event) => {
    if (pointer && event.pointerId === pointer.id) pointer = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function bindButton(id, on, off) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      on();
    });
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  }
  bindButton('btn-throttle-up', () => { held.throttleUp = true; }, () => { held.throttleUp = false; });
  bindButton('btn-throttle-down', () => { held.throttleDown = true; }, () => { held.throttleDown = false; });
  bindButton('btn-pitch-up', () => { held.pitchUp = true; }, () => { held.pitchUp = false; });
  bindButton('btn-pitch-down', () => { held.pitchDown = true; }, () => { held.pitchDown = false; });
  bindButton('btn-roll-left', () => { held.rollLeft = true; }, () => { held.rollLeft = false; });
  bindButton('btn-roll-right', () => { held.rollRight = true; }, () => { held.rollRight = false; });
  const startBtn = document.getElementById('btn-start');
  if (startBtn) startBtn.addEventListener('click', () => { actions |= ACTION_CONFIRM; });
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) pauseBtn.addEventListener('click', () => { actions |= ACTION_PAUSE; });

  return {
    /** -1..1 pitch stick (up is positive climb), -1..1 roll stick, -1..1 throttle. */
    stick() {
      let pitch = 0;
      let roll = 0;
      if (held.pitchUp) pitch += 1;
      if (held.pitchDown) pitch -= 1;
      if (held.rollLeft) roll -= 1;
      if (held.rollRight) roll += 1;
      if (pointer) {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        roll = Math.max(-1, Math.min(1, (pointer.x - cx) / (rect.width * 0.3)));
        pitch = Math.max(-1, Math.min(1, (cy - pointer.y) / (rect.height * 0.3)));
      }
      let throttle = 0;
      if (held.throttleUp) throttle += 1;
      if (held.throttleDown) throttle -= 1;
      return { pitch, roll, throttle };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeMissionPick() {
      const pick = missionPick;
      missionPick = -1;
      return pick;
    },
  };
}
