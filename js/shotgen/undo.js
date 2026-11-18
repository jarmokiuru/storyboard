// Undo and redo in the Shot Generator (Jarmo, 2026-11-18). Keeps whole copies of what can change — figures, furniture,
// room, camera, light, colours, shading — and notices a change by comparing a fresh copy with the last one. A change is
// taken in once the finger or key is up, so one drag or one held key is one step.

const LIMIT = 100;

// read() → the state as text; write(text) puts a state back. Returns { check, undo, redo, reset, can }.
export function makeUndo(read, write) {
  let past = [];
  let future = [];
  let last = read();
  const check = () => {
    const now = read();
    if (now === last) return;
    past.push(last);
    if (past.length > LIMIT) past.shift();
    future = [];
    last = now;
  };
  const go = (from, to) => {
    check();
    if (!from.length) return false;
    to.push(last);
    last = from.pop();
    write(last);
    return true;
  };
  return {
    check,
    undo: () => go(past, future),
    redo: () => go(future, past),
    reset: () => { past = []; future = []; last = read(); },
    can: () => ({ undo: past.length > 0, redo: future.length > 0 }),
  };
}
