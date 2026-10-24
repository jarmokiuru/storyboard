# Integration with Jarmo's workflow

**In plain words:** the app is the visual step of shot planning. Claude (in Jarmo's chat, with his skill system) feeds it a starter project. Jarmo boards on the iPad and saves the project file to the production's Drive folder. Claude reads that file back for the Daily Package, the briefs and a few checks. Written 2026-10-25 from the chat side; the app side is built here.

Markers as in `SPEC.md`: **[decision]** = Jarmo's call, don't change without asking; **[proposed]** = suggested, not yet confirmed by him.

## Where the app sits
- **Before it:** the `breakdown-outputs` skill makes `Breakdown.xlsx` and `Shot List.xlsx` (column spec in SPEC §4). Script revisions go through `screenplay-revision-diff`.
- **Alongside:** floor plans and Shot Designer. One plan per location feeds both (SPEC §8.6).
- **After it:** `department-briefs`, `shot-list-statistics`, `shooting-day-recap` (the Daily Package PDF), pitch deck and Lookbook.

## Decisions
- 2026-10-25 — **No new columns in `Shot List.xlsx`.** It has to stay fast to write and read. [decision]
- 2026-10-25 — **Camera height, tilt, pan and 3D position live only in the app** (and in the project file and shot data sheet). They are planning values and won't match the real set exactly, so they never go back into the shot list. [decision]
- The only value that may flow back to `Shot List.xlsx` is **Lens/Focal**, which is already a column there. The merge is done on the chat side, never by the app (standing rule in `CLAUDE.md`).

## App work, in priority order

### 1. Lens: shot list and 3D camera agree
Verified in the code on 2026-10-25 (v0.5.2): `board.lens` (text from the shot list, e.g. "50mm") and `board.shot3d.camera.focal` are separate. The 3D camera always starts on 35 mm whatever the shot list says. The shot data sheet exports `board.lens`, so a lens changed in 3D never reaches it.
- Opening the Shot Generator on a board with no 3D camera yet: start on the focal length parsed from `board.lens` ("50mm", "50 mm", "50", "Z 50mm" → 50). Fall back to 35 mm if nothing parses. A zoom range ("24-70mm") → use the first number and show the range in the readout.
- *Save to board* with a focal length different from `board.lens`: update `board.lens` to the new value ("50mm"), and say so in a small notice, e.g. "Lens/Focal changed 35mm → 50mm".
- Re-importing a shot list whose Lens/Focal differs from the board: use the existing change list (ticked by default). Accepting it changes only `board.lens`; the 3D camera keeps its focal length until the Shot Generator is opened and saved again.

### 2. Write down the project file format
Add `docs/project-format.md` describing `project.json` inside the `.storyboard` zip: every field, its unit, the plan axes (x west→east, z north→south, y up, metres; pan 0 = north; rot 0 = facing south), and the layer and thumbnail paths. Give it a `format` number (currently 1). Raise the number on any change that breaks reading, and note it in the changelog. Claude on the chat side reads and writes this file, so the document must stay current.

### 3. Accept a starter project written by Claude
Claude will write a `.storyboard` file with no drawings, holding:
- scenes (with act breaks), boards with `Kuva #`, Kuvakoko, Sisältö, Lens/Focal, Movement, Notes
- `project` aspect ratio, camera format (`project.sensor`) and lens set — from the project's *Kuvauksen metodit* note / Tech Specs
- character names and heights for the figure menu
- locations with room sizes, openings and tag (measured / traced / assumed)

App side:
- Opening a project file with no `layers/` or `thumbs/` must work: boards start blank and thumbnails are made on first view.
- Opening a starter file for a project already on the device: offer **merge** (the same rules as the shot-list re-import: new scenes and boards added, changed text listed, drawings and 3D never touched), next to the existing *replace* and *copy*.
- If the file's `format` is newer than the app knows, refuse with a plain message ("This file is from a newer version — reload the app").
- Add `samples/starter.storyboard` built from the kitchen sample to test it.
- Characters: if the project lists heights (e.g. A 182 cm), the Add menu uses them.

### 4. Renumbered shots
Shots are matched by `Kohtaus #` + `Kuva #` (verified in `importer.js`). A renumbered shot would arrive as a new empty board, and its drawing would stay on the old number (inferred from the merge rules). Import → *Renumber list…* takes a small CSV from `screenplay-revision-diff`:
```
old Kohtaus #,old Kuva #,new Kohtaus #,new Kuva #
12,3,12,4
12,4,12A,1
```
Show the moves as a list to confirm, then move the boards with all their drawings and 3D data. Apply all moves at once, so swapped numbers don't collide. Numbers that don't exist are listed and skipped.

### 5. Location files (with phase 5, floor plans)
One file per location (proposed name `<Location>.location.json`): room, openings, furniture, north angle, tag, plus optional GPS and a plan image with two calibration points. The app imports and exports these. The chat-side floor-plan step writes them, and the same plan becomes the Shot Designer background.

## Storage and naming [proposed]
- The project file lives on Jarmo's Drive in the production's camera folder, e.g. `KUVAUS/Storyboard/<Project>.storyboard`. Board PNGs and the shot data sheet go beside it when exported.
- Board image names stay `<Kohtaus #>-<board>.png` (e.g. `12-3b.png`). The Daily Package matches pictures to shots by these names. Don't change the pattern without noting it here.

## Used on the chat side (no app work, for reference)
- **Daily Package:** a board picture beside each shot on the scene pages.
- **Briefs:** camera heights from the boards may flag low-mode or high-rig set-ups in the GRIP brief; the lenses per day may feed the CAM brief.
- **Checks:** shots without a board, Lens/Focal mismatches, turning-point shots without a board.
