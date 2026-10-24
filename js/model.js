// Project data: scenes (one per Kohtaus #) and boards (one or more per Kuva #). SPEC §3.

export const LAYERS = ["reference", "fill", "pencil", "ink", "notes"];
export const LAYER_LABELS = { reference: "Reference", fill: "Fill", pencil: "Pencil", ink: "Ink", notes: "Notes" };

export const RATIOS = [
  { label: "2.39:1", value: 2.39 },
  { label: "2.00:1", value: 2 },
  { label: "1.85:1", value: 1.85 },
  { label: "1.78:1 (16:9)", value: 1.7778 },
  { label: "1.66:1", value: 1.66 },
  { label: "1.33:1 (4:3)", value: 1.3333 },
];

// Every board is drawn at this width; height follows the aspect ratio.
export const BOARD_WIDTH = 2048;
export const boardHeight = (ratio) => Math.round(BOARD_WIDTH / ratio);
export const ratioLabel = (ratio) => ratio.toFixed(2) + ":1";

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function newLayers() {
  return Object.fromEntries(LAYERS.map((n) => [n, { visible: true, opacity: 1, hasData: false }]));
}

// Kitchen from SPEC §10: long walls run east–west so the window, centred in the long wall, faces south.
export function defaultRoom(exterior = false) {
  return {
    exterior,
    w: 5.0, d: 4.0, h: 2.6,
    door: { wall: "e", offset: 0, width: 0.9, height: 2.1 },
    window: { wall: "s", offset: 0, width: 1.4, height: 1.2, sill: 0.9 },
    north: 0,
  };
}

export function newScene(fields = {}) {
  return { id: uid(), kohtaus: "", intExt: "INT", lokaatio: "", aika: "", synopsis: "", henkilot: "", actBefore: "", collapsed: false, ...fields };
}

export function newBoard(sceneId, kuva, newShot) {
  return {
    id: uid(), sceneId, kuva: String(kuva), newShot,
    kuvakoko: "", sisalto: "", lens: "", movement: "", dialogue: "", action: "", notes: "",
    horizon: 0.5, layers: newLayers(),
  };
}

export function newProject(title, ratio) {
  const scene = newScene({ kohtaus: "1" });
  const now = Date.now();
  return {
    format: 1, id: uid(), title, ratio, created: now, modified: now,
    exported: null, editedSinceExport: false, firstEditSinceExport: null,
    scenes: [scene], boards: [newBoard(scene.id, 1, true)],
  };
}

// "1. INT. KEITTIÖ – PÄIVÄ"
export function heading(scene) {
  const loc = (scene.lokaatio || "").toUpperCase();
  const time = (scene.aika || "").toUpperCase();
  let s = [scene.kohtaus && scene.kohtaus + ".", scene.intExt && scene.intExt + ".", loc].filter(Boolean).join(" ");
  if (time) s += (loc ? " – " : " ") + time;
  return s.trim() || "Untitled scene";
}

export const sceneBoards = (p, sceneId) => p.boards.filter((b) => b.sceneId === sceneId);
export const orderedBoards = (p) => p.scenes.flatMap((s) => sceneBoards(p, s.id));
export const sceneOf = (p, board) => p.scenes.find((s) => s.id === board.sceneId);

// Continuation boards within a shot show as 3, 3b, 3c — by order, never stored.
export function boardLabel(p, board) {
  const same = sceneBoards(p, board.sceneId).filter((b) => b.kuva === board.kuva);
  const i = same.indexOf(board);
  return i <= 0 ? board.kuva : board.kuva + String.fromCharCode(97 + i);
}

export function nextKuva(p, sceneId) {
  const nums = sceneBoards(p, sceneId).map((b) => parseInt(b.kuva, 10)).filter((n) => !isNaN(n));
  return Math.max(0, ...nums) + 1;
}

export function insertBoardAfter(p, ref, newShot) {
  const b = newBoard(ref.sceneId, newShot ? nextKuva(p, ref.sceneId) : ref.kuva, newShot);
  if (!newShot) Object.assign(b, { kuvakoko: ref.kuvakoko, sisalto: ref.sisalto ?? "", lens: ref.lens, movement: ref.movement });
  p.boards.splice(p.boards.indexOf(ref) + 1, 0, b);
  return b;
}

// A board placed before ref, continuing ref's shot (it takes the shot's first letter; nothing is renumbered).
export function insertBoardBefore(p, ref) {
  const b = newBoard(ref.sceneId, ref.kuva, false);
  Object.assign(b, { kuvakoko: ref.kuvakoko, sisalto: ref.sisalto ?? "", lens: ref.lens, movement: ref.movement });
  p.boards.splice(p.boards.indexOf(ref), 0, b);
  return b;
}

// Storyboarder's "/": a continuing board becomes the start of a new shot (next free Kuva #), or a shot's
// start board joins the shot before it. Only this board's number changes.
export function toggleNewShot(p, board) {
  const boards = sceneBoards(p, board.sceneId);
  const prev = boards[boards.indexOf(board) - 1];
  if (board.newShot && prev) {
    board.newShot = false;
    board.kuva = prev.kuva;
  } else if (!board.newShot) {
    board.newShot = true;
    board.kuva = String(nextKuva(p, board.sceneId));
  }
}

// Swap with the neighbouring board in the same scene (-1 = left, +1 = right).
export function nudgeBoard(p, board, dir) {
  const boards = sceneBoards(p, board.sceneId);
  const other = boards[boards.indexOf(board) + dir];
  if (!other) return false;
  moveBoard(p, board, other, dir > 0);
  return true;
}

export function duplicateBoard(p, ref) {
  const b = { ...structuredClone(ref), id: uid(), newShot: false };
  p.boards.splice(p.boards.indexOf(ref) + 1, 0, b);
  return b;
}

export function removeBoard(p, board) {
  p.boards.splice(p.boards.indexOf(board), 1);
}

export function moveBoard(p, board, target, after) {
  removeBoard(p, board);
  p.boards.splice(p.boards.indexOf(target) + (after ? 1 : 0), 0, board);
}

export function moveBoardToScene(p, board, sceneId) {
  removeBoard(p, board);
  const last = sceneBoards(p, sceneId).pop();
  board.sceneId = sceneId;
  if (last) p.boards.splice(p.boards.indexOf(last) + 1, 0, board);
  else p.boards.push(board);
}

export function addScene(p, scene) {
  p.scenes.push(scene);
  const b = newBoard(scene.id, 1, true);
  p.boards.push(b);
  return b;
}

export function removeScene(p, scene) {
  const removed = sceneBoards(p, scene.id);
  p.scenes.splice(p.scenes.indexOf(scene), 1);
  p.boards = p.boards.filter((b) => b.sceneId !== scene.id);
  return removed;
}

export function nextSceneNumber(p) {
  const nums = p.scenes.map((s) => parseInt(s.kohtaus, 10)).filter((n) => !isNaN(n));
  return Math.max(0, ...nums) + 1;
}

export function ago(time) {
  const days = Math.floor((Date.now() - time) / 864e5);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago";
}
