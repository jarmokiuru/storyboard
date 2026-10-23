# Changelog

## 2026-10-23 — Storyboard v0.2.0 (phase 2: boards without 3D)
- The app now opens at the site root: projects list, new project with aspect ratio, delete, import project file.
- Board editor modelled on Storyboarder: tool column (light pencil, pencil, pen, brush, eraser, note pen, move/scale), three sizes and five colours per tool, straight-line toggle.
- Line weight from Pencil tilt and stroke speed; pressure used automatically if a pen reports it. Stroke prediction on.
- Five layers (reference, fill, pencil, ink, notes) with visibility, opacity and an active layer; clear layer.
- Scenes with headings built from Kohtaus # / INT/EXT / Lokaatio / Vuorokaudenaika; boards numbered by Kuva #, continuation boards shown as 1b, 1c.
- Board strip grouped by scene: tap to select, press-and-hold to drag within a scene, collapse scenes, jump list.
- Guides: grid, centre marks, thirds, horizon (adjustable per board), 93% action safe, protection ratio lines, onion skin.
- Reference photo (fit or fill), also pasted with Cmd-V on the Mac.
- Undo/redo: buttons, two-finger tap / three-finger tap, Cmd-Z / Cmd-Shift-Z.
- Fingers pan and pinch-zoom; palm rejection once the Pencil is used.
- Saves on the device as you draw. Export project file (.storyboard) and board PNG; "last exported" note and a nudge after 3 days.
- Works offline once opened (offline copy), with a "new version ready" prompt.

## 2026-10-23 — Pencil test v0.1.0
- Phase 1 pencil test page at `pencil-test/`: pencil (pressure → line width) and shading (tilt → broad lead) strokes, live pressure and tilt readings, palm rejection once the Pencil is seen, input delay and sample rate, optional stroke prediction, offline copy, home-screen install, "Copy results" for reporting back.
- Root page links to the test.

## 2026-10-23
- Build spec, project note and generic sample files. No app code yet.
