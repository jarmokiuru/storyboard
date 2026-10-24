# Changelog

## 2026-10-24 — Storyboard v0.4.0 (phase 4, step 1: set and camera)
- Shot Generator (button in the board panel) opens full screen.
- Set per location, shared by every scene shot there: room width, depth and ceiling height, a door and a window placed on any wall, or an exterior (ground and horizon). Tagged measured / traced / assumed. The sample kitchen is 5.0 m west–east × 4.0 m north–south, 2.6 m ceiling.
- Camera with real lenses: camera format from verified ARRI sizes (ALEXA 35, ALEXA Mini LF, ALEXA Mini) or generic Super 35 / full frame; primes 14–135 mm or any focal length; angle of view from the sensor area the frame actually uses.
- Views: Camera (masked to the project ratio), Top (plan) and Orbit, with a small inset of the other view. Drag to pan/tilt in the camera view; in the top view drag the camera to move it and the end of its yellow lines to aim it. Height, pan, tilt and roll sliders; readout of focal length, horizontal angle of view, height and tilt.
- Mac keys in the Shot Generator: W/A/S/D move, R/F up/down, Z/X roll, arrows pan/tilt, Esc back.
- Save to board puts the camera view on the board's reference layer and keeps the camera, so reopening carries on from it. Camera height and tilt go into the shot data sheet.
- Bundled offline: three.js 0.186.1 and Wonder Unit's essential figures and objects (MIT), listed in vendor/LICENSES.md.

## 2026-10-23 — Storyboard v0.3.6
- Shot data sheet (Export → Shot data sheet .xlsx / .csv): one row per board with Kohtaus #, Kuva #, Board (1, 1b…), Kuvakoko, Lens/Focal, camera height (cm), tilt (°), Movement and the board's image file name. Camera height and tilt stay empty until the Shot Generator (phase 4) fills them.
- All boards as PNGs (.zip): every board at full size, named as in the sheet (e.g. 1-1b.png). The single-board PNG uses the same name.

## 2026-10-23 — Storyboard v0.3.5
- Pencil log also records the Pencil as reported through Safari's older touch channel, to tell whether a missing stroke was dropped by Safari or never sent by the iPad.

## 2026-10-23 — Storyboard v0.3.4
- Pencil log: large touches the iPad cancels by itself (a resting hand, a grip on the edge) are folded into one summary line, so they no longer push the Pencil events out of the log. It now keeps 300 lines.

## 2026-10-23 — Storyboard v0.3.3
- Pencil log (Guides → Pencil log…): records what the iPad sends for each stroke, to track down strokes that never appear. Copy it and paste it into the chat. Drawing itself is unchanged.

## 2026-10-23 — Storyboard v0.3.2
- Fewer missing strokes: if Safari loses the end of a stroke, the next touch of the Pencil finishes it and starts a new line instead of being ignored.
- Two-finger tap undo is stricter: only a quick tap with two fingertips landing together counts, so a hand settling on the glass no longer undoes the last line.

## 2026-10-23 — Storyboard v0.3.1
- Hide panel / Show panel button (or P on the Mac): the frame grows into the space.
- Focus button (or F): hides the panel and the board strip for the biggest frame; tap again to bring them back. Remembered between sessions.

## 2026-10-23 — Storyboard v0.3.0 (phase 3: PDF and imports)
- Contact-sheet PDF (Export → Contact sheet PDF): 1, 2, 3, 4, 6, 8, 9 or 12 boards per page or a custom rows × columns grid; A4 or Letter; landscape or portrait; choose scenes; choose what prints under each frame (scene heading, Kuva #, Kuvakoko, Lens/Focal, Movement, Sisältö, dialogue, action, notes); each scene on a new page; DRAFT mark. Settings are remembered per project.
- Blank worksheet PDF: empty frames at the project's aspect ratio with writing lines.
- Import (top bar): Breakdown.xlsx, Shot List.xlsx, a Fountain/text script file, or pasted script text. Column matching asked once per project. Re-imports add new scenes and shots, fill empty fields, list changed text to accept or keep, list problems, and never touch drawings.
- Act dividers from the breakdown show in the board strip; editable in the scene dialog.
- New Sisältö field on each board (from the shot list).
- PDF and spreadsheet reading are done by the app itself — no outside libraries.

## 2026-10-23 — Storyboard v0.2.1
- Tilt now widens the line: Safari's in-between Pencil samples carry a placeholder upright angle, so they now borrow the angle of the event they arrive with. Pencil and light pencil widen more when tipped.
- Palm rejection: fingers already resting when the Pencil touches down, or landing while or just after it draws, can no longer pan or zoom the board.

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
