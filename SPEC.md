# Storyboard — build spec

**In plain words:** a storyboard app for Jarmo Kiuru (cinematographer, FSC) that runs on his iPad with or without a signal. It copies Storyboarder's drawing tools, board strip and 3D Shot Generator as closely as is practical. Boards sit under scene headings from his breakdown and carry their shot number from his shot list. It prints contact-sheet PDFs with an adjustable number of boards per page. He can draw over any frame with the Apple Pencil.

Version 1 of this spec: 23 October 2026. Test material is a generic kitchen scene (see §10), not a real production.

Every claim below is marked where it matters:
- **[verified]** checked against a source while writing this spec
- **[verify at build]** believed true, must be confirmed before relying on it
- **[decision]** chosen by Jarmo; do not change without asking him

---

## 1. Who uses it, on what

| Device | Role | Notes |
|---|---|---|
| iPad Air 11-inch (M3), Safari, Apple Pencil | **Primary.** Drawing, 3D blocking, PDF export | Must work fully offline [decision] |
| MacBook Pro 2017, 2.3 GHz dual-core Intel i5, macOS 13.7 | Secondary. Organising, PDF, typing metadata | Weak machine; Storyboarder desktop was too heavy on it. 3D must stay light here |
| iPhone 13 Pro Max | Viewing boards only | No editing required |

Jarmo is not a programmer. Anything the app says to him uses film words, not software words. Interface language: English, using Storyboarder's terms. Column names from his spreadsheets stay Finnish (`Kohtaus #`, `Kuva #`).

## 2. Delivery: an installable web app that works offline

- **Hosting:** GitHub Pages from this repository (`main` branch, root or `/docs`, whichever the build ends up needing). The repository is public; no project data is ever committed — boards live only on Jarmo's devices.
- **Install:** Jarmo opens the Pages address once in Safari while online and uses *Add to Home Screen*. From then on it opens like an app.
- **Offline:** a service worker caches every file the app needs: code, libraries, fonts, icons and the 3D models. After the first load, nothing is fetched from the network. **No CDN links at runtime.** All libraries are copied into `vendor/`.
- **Updates:** when online, the app checks for a new version and shows "New version ready — reload" rather than swapping code mid-session. The version number is visible in the app's About panel.
- **Storage:** IndexedDB, one database per device. Call `navigator.storage.persist()` on first run.
  - [verify at build] Home-screen web apps on iPadOS are exempt from Safari's 7-day storage deletion for websites. Confirm against current WebKit documentation; if this no longer holds, say so to Jarmo before phase 1 ships.
- **Moving work between devices / backup:** export a project file (`.storyboard`, a zip of JSON + PNG layers + 3D scene data) to Files / iCloud Drive / Google Drive, and import it on another device. Manual, not live sync [decision: accepted]. The app shows "Last exported: N days ago" in the project header and nudges after 3 days of edits without an export.
- **Prefer no build step.** Plain ES modules, vendored libraries. Only add a bundler if a real need appears, and record why in `CLAUDE.md`.

Suggested libraries (all must be vendored, licence checked and noted in `vendor/LICENSES.md`):
- three.js — 3D [verify at build: MIT]
- jsPDF — PDF output [verify at build: MIT]
- SheetJS community edition — reading `.xlsx` [verify at build: Apache-2.0]
- JSZip — project file [verify at build: MIT/GPL dual]

## 3. Data model

```
Project
  title, aspect ratio (e.g. 2.39:1), camera format (sensor), lens set, export history
  Locations[]            -- a 3D "set" shared by every scene shot there
    name, room (W×D×H m), openings (doors, windows), objects, floor-plan image + scale, north angle
  Scenes[]               -- one per Kohtaus #
    Kohtaus #, INT/EXT, Lokaatio, Vuorokaudenaika, Synopsis, Henkilöt, location ref
    Boards[]             -- one per Kuva # (or several boards per shot, see below)
      Kuva #, Kuvakoko (shot size), Sisältö, Lens/Focal, Movement, Notes
      dialogue, action
      camera: position, height (cm), pan, tilt, roll, focal length (mm)
      character placements + poses (overrides of the location's defaults)
      layers: reference, fill, pencil, ink, notes  (PNG each, plus opacity/visibility)
      new-shot flag (true = this board starts a new Kuva #; false = continuation board within the same shot)
```

- A shot (`Kuva #`) can have more than one board, e.g. start and end frame of a move. Storyboarder's "new shot" behaviour [verified: N = new board / new shot in Storyboarder's wiki].
- Numbering: boards are numbered by their `Kuva #`. Continuation boards show as `3`, `3b`, `3c`.
- Changing a board's scene or reordering never renumbers `Kuva #` silently; it asks.

## 4. Getting scenes and shots in

Three routes, in order of preference:

1. **Breakdown.xlsx** (Sheet 1, one row per scene). Columns, exactly as Jarmo's files have them [verified from his formatting spec]:
   `Kohtaus # | INT/EXT | Lokaatio | Vuorokaudenaika | Script Day | Sivut | Synopsis | Henkilöt | VÄRI | VALO | CAM | GRIP | SFX | VFX | HUOM`
   - Act-break rows: column A empty/dark, label in column B. Import them as act dividers in the board strip, not as scenes.
   - The scene heading shown in the app is built as `Kohtaus #. INT/EXT. LOKAATIO – VUOROKAUDENAIKA`.
2. **Shot List.xlsx.** Columns [verified]:
   `Kohtaus # | Slugline + Synopsis | Kuva # | Kuvakoko | Sisältö | Lens/Focal | Movement | Notes`
   - A row with `Slugline + Synopsis` filled (merged across) is a scene header row; the rows below it are that scene's shots.
   - Each shot row becomes one empty board, carrying its fields.
   - If a shot row's `Kohtaus #` is blank, inherit it from the header row above.
3. **Pasted script text or a Fountain file.** Detect scene headings starting with `INT.`, `EXT.`, `INT./EXT.`, `I/E` and the Finnish `SIS.`, `ULK.`, `SIS./ULK.`. Number scenes in order unless the heading carries a number.

Rules:
- **Column mapping dialog** on first import: show the columns found, pre-matched to the expected names, and remember the mapping per project. Files may drift from the spec.
- **Re-import merges, never wipes.** Match scenes by `Kohtaus #` and shots by `Kohtaus #` + `Kuva #`. New ones are added; changed text fields are shown as a list for Jarmo to accept; drawings and 3D data are never touched by an import.
- Discrepancies (a shot whose scene doesn't exist, duplicate `Kuva #`) are listed, not auto-fixed.

## 5. Getting data out

- **Contact-sheet PDF** (§7).
- **PNG per board** (flattened, at the project aspect ratio).
- **Shot data sheet** (`.xlsx` and `.csv`): one row per board with `Kohtaus #`, `Kuva #`, `Kuvakoko`, `Lens/Focal`, camera height (cm), tilt (°), `Movement`, board image file name. **The app never writes Jarmo's `Shot List.xlsx` itself** — that file has a locked format maintained in chat. This sheet is what gets merged into it.
- **Floor plan for Shot Designer** (§8.6).
- **Project file** (§2).

## 6. Board editor — modelled on Storyboarder

### 6.1 Layout
Follow Storyboarder's arrangement [verified in outline from its README/site; exact positions from memory, match the real app where screenshots are available]:
- **Centre:** the board canvas at the project aspect ratio, with a soft surround.
- **Left:** tool column.
- **Right:** metadata panel — scene heading (read-only), `Kuva #`, Kuvakoko, Lens/Focal, Movement, dialogue, action, notes; buttons for *Shot Generator*, *New board*, *New shot*.
- **Bottom:** board strip of thumbnails, grouped under scene headings (and act dividers). Drag to reorder within a scene. Tap a scene heading to collapse it. Jump list for scenes.
- **Top bar:** project title, undo/redo, guides menu, export menu, last-exported note.
- On iPad portrait: the right panel becomes a sheet that slides up; the strip stays at the bottom.

### 6.2 Drawing tools
Storyboarder's set [verified: light pencil, pencil, pen, brush, eraser, note pen; 3 sizes and a 5-colour palette per tool]:

| Key (Mac) | Tool | Default layer |
|---|---|---|
| 1 | Light pencil (roughing) | pencil |
| 2 | Pencil (sketching) | pencil |
| 3 | Pen (inking) | ink |
| 4 | Brush (shading/fills) | fill |
| 5 | Eraser | active layer |
| 6 | Note pen (red notes, arrows) | notes |

- Three sizes per tool, five colours per tool; greys by default, red for the note pen.
- Straight line: hold Shift (Mac). On iPad: a straight-line toggle in the tool column.
- Move / scale layer contents: Cmd-drag / Cmd-Option-drag on Mac [verified as Storyboarder shortcuts]; a move/scale tool on iPad.
- Colour pick: Option (Mac), long-press on iPad.
- Undo/redo: Cmd-Z / Cmd-Y on Mac; two-finger tap = undo, three-finger tap = redo on iPad.
- Brush size: `[` and `]`.
- Clear layer: Delete/Backspace, with a confirm on iPad.

### 6.3 Apple Pencil
- Pointer Events with `pointerType === "pen"`. Jarmo's Apple Pencil (USB-C) has **no pressure** [verified: apple.com, and the phase 1 test read a fixed 0.30]. Line weight comes from **tilt** (`altitudeAngle`/`azimuthAngle`, or `tiltX`/`tiltY`: upright = thin, tipped = broad soft lead) and **stroke speed** (fast = thinner, tapered) [decision]. If a pen reports pressure that varies, use it automatically for width/opacity.
- Phase 1 results on the iPad Air M3, Safari 27: ~250 samples/s, extra samples between frames available, stroke prediction available and feels good (keep on), palm rejection works [verified].
- Palm rejection: while a pen is in use, ignore single-finger touches on the canvas. Fingers pan (one finger when no pen has been seen this session; otherwise two) and pinch-zoom.
- Strokes are smoothed and drawn at canvas resolution ≥ 2× the display size so PDFs print cleanly.
- Pencil double-tap and squeeze gestures are probably not available to web pages — don't plan around them.

### 6.4 Layers
Five layers per board, bottom to top: **reference** (3D render or pasted photo), **fill**, **pencil**, **ink**, **notes**. Per-layer visibility and opacity. The reference layer can be dimmed to draw over it — this is the "sketch by hand on top" requirement [decision].
(Storyboarder's own layer set is remembered, not verified; the set above is the requirement either way.)

### 6.5 Guides and onion skin
Toggleable overlays [verified: Storyboarder offers grid, centre marks, thirds, angles, onion skin]:
- Grid, centre marks, thirds, horizon/eye-line, safe-action frame.
- Onion skin: previous and next board at low opacity.
- Frame mask: the project aspect ratio, plus optional second ratio lines (e.g. 1.85 inside 2.39) for protection.

### 6.6 Reference images
Paste or pick a photo (scout photo, ShotDeck frame) into the reference layer; fit/fill/crop to frame.

## 7. Contact-sheet PDF

Generated on the device, offline.

- **Boards per page:** adjustable [decision]. Presets 1, 2, 3, 4, 6, 8, 9, 12, plus custom rows × columns.
- Paper: A4 (default) or Letter; portrait or landscape.
- Per panel, toggles: scene heading (when a new scene starts), `Kuva #`, Kuvakoko, Lens/Focal, Movement, dialogue, action, notes. Text sits under each frame.
- Page header: project title, date, page N of M. Optional "DRAFT" mark.
- Scope: whole project, chosen scenes, or a selection of boards.
- New scene starts on a new page (toggle).
- **Blank worksheet:** empty frames at the project aspect ratio with the same grid, for drawing on paper.

## 8. Shot Generator (3D)

Modelled on Storyboarder's Shot Generator [verified in outline: main camera view, top-down view where objects are dragged, characters with pose presets, objects, lights, "save to board"]. Opens full screen from the board; *Save to board* renders the camera view into the reference layer and stores the 3D state on the board; reopening edits it.

### 8.1 Set (shared per location)
- Room builder: width × depth × height in metres; wall thickness; doors and windows as openings placed along walls; floor grid at 1 m; walls can be hidden per view.
- Exterior: ground plane with horizon, no walls.
- Optional floor-plan image as floor texture, calibrated by clicking two points and typing the real distance (§8.6).
- North angle per location (used later for sun direction).

### 8.2 Models
- Use Wonder Unit's **shot-generator-models** library: MIT licence, last commit 31 Aug 2019 [verified]. 83 `.glb` files, 155 MB with source files.
- Ship only the essentials, roughly 15 MB, so they fit in the offline cache:
  - Characters (`characters/essential/`): adult-male, adult-female, teen-male, teen-female, child, baby. Rigged, 67 joints, five detail levels per model (LOD0–LOD4) [verified by inspecting the files].
  - Objects (`objects/essential/`): beds, cabinets, chairs, doors, primitives, stairs, tables, trees, car, bicycle.
- On the 2017 Mac, use a lower detail level (LOD2 or LOD3) by default; full detail on iPad. A setting overrides it.
- Do **not** copy code or pose data from the main Storyboarder repository: it carries no licence file and its terms are unclear [verified: issue #2509]. Author our own pose presets.

### 8.3 Characters
- Add, name (from the scene's `Henkilöt`), colour-tag.
- Height in cm (scale the skeleton except the head, matching how the library is built [verified from the library README]).
- Pose presets (authored here): stand, stand weight-shift, walk, sit chair, sit floor, lie back, lie side, kneel, lean on table, arms crossed, point, phone to ear, look over shoulder.
- Manual posing: select a joint and turn it — built as three sliders (forward, turn, side) per joint in the panel rather than an on-screen ring, matching the slider controls Jarmo asked for elsewhere [as built, v0.7.0]. No phone/QR posing.
- Head/eye-line: aim the head at a point or at another character.

### 8.4 Camera
- Views: **camera** (what the lens sees, masked to the aspect ratio), **top** (plan view, drag to place camera and figures), **orbit** (free look).
- Move in top view by dragging; height slider in cm; pan / tilt / roll with readouts in degrees.
- **Lens:** focal length in mm from the project's lens set (default primes, Jarmo's set: 14, 18, 25, 35, 50, 85, 100, 135, 150, 180 mm [decision 2026-10-24]) or a free value.
- **Angle of view comes from the sensor, not a generic "35 mm equivalent".** Project camera format presets: ARRI Alexa 35, ARRI Alexa Mini LF, ARRI Alexa Mini (Super 35), generic Super 35, generic full frame. [verify at build: take active sensor dimensions for each recording format from ARRI's own spec pages — do not hard-code from memory.] Custom width × height in mm allowed.
- Readout on screen: focal length, horizontal angle of view, camera height, tilt, subject distance to the selected character.
- **Shot-size presets** (ECU, CU, MCU, MS, MLS, LS, WS, EWS — the abbreviations his shot lists use; "FS" and "LS/FS" read as LS): with a character selected, place the camera at the distance that gives that framing with the current lens, keeping the current direction. As built (v0.9.0): the frame edges are cut at the posed figure's own landmarks (crown, eyes, chin, neck, chest, waist, knees, feet); camera height is kept and tilt aims at the frame's middle, unless that would be steeper than about 45°, when the camera drops/rises to the frame's middle. The board's Kuvakoko button is outlined.
- Camera body and frustum visible in top view.
- Mac keys as in Storyboarder 3.0's Shot Generator [verified from its key handling, read-only, 2026-10-24]: W/A/S/D or arrow keys move (forward/left/back/right, smooth while held), R/F up/down, Shift faster; scroll wheel zooms the lens. Z/X roll and Esc are ours.
- Zoom: pinch or scroll in the camera view changes the focal length; in the top and orbit views it zooms the view [decision 2026-10-24].

### 8.5 Rendering and performance
- Flat grey "clay" look with a simple key + fill; optional single sun direction.
- Render only on change (no constant animation loop). Cap pixel ratio on the Mac.
- Target: 2 characters + 10 objects stays responsive on the 2017 Mac (aim ≥ 20 frames per second while dragging).

### 8.6 Floor plan out (for Shot Designer)
Export the top view as PNG and PDF: walls, openings, furniture outlines, a scale bar, one wall labelled with its real length (for calibrating in Shot Designer), and a north arrow. Each plan carries a tag — **measured**, **traced** or **assumed** — printed on the export, so a guess is never mistaken for a measurement [decision].
[verify at build: whether Shot Designer has a background scale setting is unknown; the labelled wall length is the fallback.]

## 9. Build order

Each phase ends with something Jarmo can use and test on the iPad.

1. **Pencil test page.** Pressure, tilt, palm rejection, latency on the iPad Air M3 in Safari, online and as a home-screen app. Report results to Jarmo before phase 2.
2. **Boards without 3D.** Offline install, projects, scenes, board strip, metadata panel, drawing tools, layers, guides, onion skin, reference photos, project file export/import.
3. **Imports and PDF.** Breakdown / Shot List / script import with column mapping and merge; contact-sheet PDF with board-per-page options; blank worksheet; shot data sheet.
4. **Shot Generator.** Room builder, models, characters and poses, camera with sensor-based lenses, shot-size presets, save to board.
5. **Floor plans.** Plan image calibration, plan export for Shot Designer.
6. **Polish.** Performance on the Mac, keyboard shortcuts, iPhone viewing layout.

## 10. Test material — generic

Use the files in `samples/`: a three-scene breakdown, a shot list and the same scenes as a Fountain script, set in a kitchen and a yard. Two characters, **A** (adult male, 182 cm) and **B** (adult female, 168 cm).

- Kitchen: 4.0 × 5.0 m, ceiling 2.6 m. Door in the short wall at one end, window centred in the long wall opposite the counter. Counter along one long wall, a 0.9 × 1.4 m table with two chairs in the middle. North is up on the plan, window faces south.
- Yard: exterior, ground plane, a car and a tree.

### Acceptance checks
- [ ] App installs to the iPad home screen and opens in aeroplane mode with all features, including 3D and PDF.
- [ ] Importing `samples/Breakdown.xlsx` then `samples/Shot List.xlsx` gives 3 scenes with the right headings and 10 boards with the right `Kuva #`.
- [ ] Importing `samples/script.fountain` alone gives the same 3 scene headings (from `SIS.` / `ULK.`).
- [ ] Re-importing a changed shot list keeps all drawings and lists the text changes.
- [ ] Drawing with the Pencil shows pressure; a resting palm leaves no marks.
- [ ] Contact sheet PDF at 1, 4, 6 and 12 boards per page, A4 landscape and portrait, prints with readable text.
- [ ] Shot Generator: kitchen built to size, A seated, B standing at the counter; a 32 mm on Alexa Mini LF framed as MS on B; *Save to board*; draw over it; reopen and adjust.
- [ ] Horizontal angle of view on screen matches a hand calculation from the verified sensor width.
- [ ] Project file exported on iPad opens on the Mac with identical boards.
- [ ] On the 2017 Mac, the kitchen scene with both figures stays responsive.
- [ ] Floor plan export shows scale bar, labelled wall length, north arrow and the plan's tag.

## 11. Out of scope for now
- Animatics: board timing, playback, editing-timeline exports [decision: not needed at this point].
- Live sync between devices; sharing with collaborators.
- VR, multi-user, AI shot generation from text.
- Writing directly into `Shot List.xlsx`.
