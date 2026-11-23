// The menu on a board in the strip (Jarmo, 2026-11-23): hold a board and let go, tap the board you're on, or
// right-click it. Every action works on the board on screen; the editor selects the pressed board first.

import { openMenu } from "./ui.js";
import { sceneBoards, boardLabel } from "./model.js";

// a = the editor's actions: newBoard(sameShot?), newShot, duplicate, duplicateAsShot, move(dir), toggleShot, remove.
export function boardMenu(anchor, project, board, a) {
  const boards = sceneBoards(project, board.sceneId);
  const i = boards.indexOf(board);
  const prev = boards[i - 1], next = boards[i + 1];
  const label = boardLabel(project, board);
  const items = [
    { type: "note", label: `Board ${label}` },
    { label: `New board in shot ${board.kuva}`, action: () => a.newBoard() },
    { label: "New shot after this", action: () => a.newShot() },
    { type: "sep" },
    { label: `Duplicate in shot ${board.kuva}`, action: () => a.duplicate() },
    { label: "Duplicate as a new shot", action: () => a.duplicateAsShot() },
    { type: "sep" },
  ];
  if (prev) items.push({ label: "Move left", action: () => a.move(-1) });
  if (next) items.push({ label: "Move right", action: () => a.move(1) });
  if (board.newShot && prev) items.push({ label: `Join shot ${prev.kuva}`, action: () => a.toggleShot() });
  else if (!board.newShot) items.push({ label: "Start a new shot here", action: () => a.toggleShot() });
  items.push({ type: "sep" }, { label: "Delete board…", action: () => a.remove() });
  openMenu(anchor, items);
}
