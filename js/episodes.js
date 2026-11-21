// Episodes and switching scenes on or off for storyboarding (Jarmo, 2026-11-21). The data rules are in model.js
// ("episodes and the scene index"); this file changes them. The dialog is scene-index.js.

import { uid, newScene, newBoard, shownScenes, isOn, sceneBoards } from "./model.js";

// A new episode with one empty scene, made the open one. The first time, the scenes so far become an episode of
// their own (firstName).
export function addEpisode(p, name, firstName) {
  p.episodes = p.episodes || [];
  if (!p.episodes.length) {
    const first = { id: uid(), name: firstName };
    p.episodes.push(first);
    for (const s of p.scenes) s.episodeId = first.id;
  }
  const e = { id: uid(), name };
  p.episodes.push(e);
  const scene = newScene({ kohtaus: "1", episodeId: e.id });
  p.scenes.push(scene);
  p.boards.push(newBoard(scene.id, 1, true));
  p.openEpisode = e.id;
  return e;
}

// Takes an episode out with its scenes and boards; returns the boards (their pictures still need deleting).
export function removeEpisode(p, e) {
  const gone = new Set(p.scenes.filter((s) => s.episodeId === e.id).map((s) => s.id));
  const boards = p.boards.filter((b) => gone.has(b.sceneId));
  p.scenes = p.scenes.filter((s) => !gone.has(s.id));
  p.boards = p.boards.filter((b) => !gone.has(b.sceneId));
  p.episodes = p.episodes.filter((x) => x !== e);
  if (p.openEpisode === e.id) p.openEpisode = p.episodes[0]?.id;
  return boards;
}

export const drawnBoards = (boards) => boards.filter((b) => Object.values(b.layers).some((l) => l.hasData) || b.shot3d).length;

// Switch a scene on or off for storyboarding. The open episode always keeps one scene on, so the editor has a
// board to show: returns false (and changes nothing) for the last one.
export function setOn(p, scene, on) {
  if (!on && isOn(scene) && shownScenes(p).length === 1 && shownScenes(p)[0] === scene) return false;
  if (on) delete scene.storyboard; else scene.storyboard = false;
  delete scene.storyboardAuto;   // chosen by hand: imports leave it alone from now on
  if (on && !sceneBoards(p, scene.id).length) p.boards.push(newBoard(scene.id, 1, true));
  return true;
}

// For the projects list and the index: "45 scenes, 12 storyboarded".
export function sceneCount(p) {
  const all = p.scenes.length, on = p.scenes.filter(isOn).length;
  const eps = p.episodes?.length ? `${p.episodes.length} episodes · ` : "";
  return eps + (all === on ? `${all} ${all === 1 ? "scene" : "scenes"}` : `${all} scenes, ${on} storyboarded`);
}
