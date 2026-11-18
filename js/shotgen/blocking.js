// One 3D space per scene (Jarmo, 2026-11-18). The figures — the blocking — belong to the scene and every board in it
// sees them; each board is a camera. A figure can be made "this board only" on one board: that board then keeps its
// own copy of the figure (board.ownFigures[id]), so actors can move during the scene without unlinking the rest.
//
//   scene.blocking = { figures: [figure…] }          shared
//   board.ownFigures = { figureId: figure }          this board's own versions
//   board.shot3d.figures                             what the board's saved picture showed (kept, never read back)
//
// Characters keep one colour everywhere: project.characters[].colour, matched by figure name.

import { FIGURE_COLOURS } from "./catalog.js";
import { orderedBoards } from "../model.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The scene's shared blocking, made the first time from the boards saved before v0.22.0: the last board in the scene
// with figures gives the shared figures; any other board whose copy of a figure differs keeps it as its own, so every
// saved picture can be made again exactly. A figure missing from that last board is left out (still in shot3d.figures).
export function sceneBlocking(project, scene) {
  if (scene.blocking?.figures) return scene.blocking;
  const boards = orderedBoards(project).filter((b) => b.sceneId === scene.id);
  const source = [...boards].reverse().find((b) => b.shot3d?.figures?.length);
  const shared = structuredClone(source?.shot3d.figures || []);
  for (const b of boards) {
    if (b === source || !b.shot3d?.figures) continue;
    for (const f of b.shot3d.figures) {
      const s = shared.find((x) => x.id === f.id);
      if (s && !same(s, f)) (b.ownFigures = b.ownFigures || {})[f.id] = structuredClone(f);
    }
  }
  scene.blocking = { figures: shared };
  return scene.blocking;
}

// The figures as this board sees them: the shared ones, with the board's own versions swapped in. These are the live
// objects (editing one edits the shared figure, or the board's own copy).
export function boardFigures(project, scene, board) {
  const own = board.ownFigures || {};
  return sceneBlocking(project, scene).figures.map((f) => own[f.id] || f);
}

export const isOwn = (board, id) => !!board.ownFigures?.[id];

// "This board only" on: the board gets its own copy of the figure as it is now. Off: back to the shared figure (the
// board's own changes are dropped). Returns the object the board now uses.
export function setOwn(project, scene, board, id, on) {
  const shared = sceneBlocking(project, scene).figures.find((f) => f.id === id);
  if (!shared) return null;
  if (on) {
    board.ownFigures = board.ownFigures || {};
    board.ownFigures[id] = board.ownFigures[id] || structuredClone(shared);
    return board.ownFigures[id];
  }
  if (board.ownFigures) delete board.ownFigures[id];
  return shared;
}

// A figure taken out of the scene: from the shared list and from every board's own versions.
export function removeFigure(project, scene, id) {
  const list = sceneBlocking(project, scene).figures;
  const i = list.findIndex((f) => f.id === id);
  if (i >= 0) list.splice(i, 1);
  for (const b of project.boards) if (b.sceneId === scene.id && b.ownFigures) delete b.ownFigures[id];
}

// ---------- one colour per character ----------

export const named = (name) => !!(name && name.trim() && name.trim() !== "?");

// Only the cast gets a colour of its own: the characters the project lists with a body (project.characters with a
// model — from the starter file, e.g. Stig and Jian). Everyone else — extras, the press, speaking extras, figures
// without a name — is plain clay, unless a colour is picked by hand in the figure's panel (Jarmo, 2026-11-18).
//   character.colour       the cast member's colour (given by the project, or the first free one)
//   character.handColour   picked by hand for that name, for cast and extras alike (PLAIN = picked plain)
//   figure.handColour      picked by hand for one figure without a name
// Entries the app adds just to hold a hand colour have model null, so they never count as cast.
export const PLAIN = "#d6d1c9";

const character = (project, name) => (project.characters || []).find((x) => x.name === name.trim());
export const isCast = (project, name) => named(name) && !!character(project, name)?.model;

export function colourFor(project, name, fig) {
  if (!named(name)) return fig?.handColour || PLAIN;
  const c = character(project, name);
  if (c?.handColour) return c.handColour;
  if (!c?.model) return PLAIN;
  if (!c.colour) {
    const used = new Set(project.characters.map((x) => x.colour).filter(Boolean));
    c.colour = FIGURE_COLOURS.find((x) => !used.has(x)) || FIGURE_COLOURS[project.characters.indexOf(c) % FIGURE_COLOURS.length];
  }
  return c.colour;
}

// A colour picked by hand: for every figure of that name, or for this one figure when it has no name.
export function pickColour(project, fig, colour) {
  if (!named(fig.name)) {
    if (colour === PLAIN) delete fig.handColour;
    else fig.handColour = colour;
    return;
  }
  project.characters = project.characters || [];
  let c = character(project, fig.name);
  if (!c) project.characters.push((c = { name: fig.name.trim(), model: null, height: null }));
  c.handColour = colour;
}

// Every figure takes its colour by the rules above (all scenes, all boards' own copies).
export function syncColours(project) {
  const paint = (f) => { f.colour = colourFor(project, f.name, f); };
  for (const s of project.scenes) for (const f of s.blocking?.figures || []) paint(f);
  for (const b of project.boards) for (const f of Object.values(b.ownFigures || {})) paint(f);
}

// ---------- is the saved picture out of date? ----------

const round = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);
const tidy = (o) => JSON.stringify(o, (k, v) => round(v));

// What a picture depends on besides the camera: the room, its furniture and the shading look.
export const setStamp = (project, loc) => tidy({ room: loc.room, objects: loc.objects || [], shading: project.shading || "clay" });

// A board's saved 3D picture no longer matches its camera, light, figures or (when known) the set.
export function pictureStale(project, scene, board, loc) {
  const s = board.shot3d;
  if (!s?.figures || !board.layers?.reference?.hasData) return false;
  if (s.setStamp && s.setStamp !== setStamp(project, loc)) return true;
  if (s.savedCamera && tidy(s.savedCamera) !== tidy(s.camera)) return true;
  if (s.savedLight && tidy(s.savedLight) !== tidy({ sun: s.sun, light: s.light })) return true;
  return tidy(s.figures) !== tidy(boardFigures(project, scene, board));
}
