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
**Done in v0.5.4 (2026-10-25)** — `js/lens.js` reads the Lens/Focal text; the Shot Generator starts on it; *Save to board* / *Save as new board* write the focal length back as "NNmm" with a notice. One reading made here: a zoom text ("24-70mm") is left as it is when the 3D focal length is inside its range; outside the range it's replaced. Re-import needed no change (the existing change list already touches only `board.lens`).

Verified in the code on 2026-10-25 (v0.5.2): `board.lens` (text from the shot list, e.g. "50mm") and `board.shot3d.camera.focal` are separate. The 3D camera always starts on 35 mm whatever the shot list says. The shot data sheet exports `board.lens`, so a lens changed in 3D never reaches it.
- Opening the Shot Generator on a board with no 3D camera yet: start on the focal length parsed from `board.lens` ("50mm", "50 mm", "50", "Z 50mm" → 50). Fall back to 35 mm if nothing parses. A zoom range ("24-70mm") → use the first number and show the range in the readout.
- *Save to board* with a focal length different from `board.lens`: update `board.lens` to the new value ("50mm"), and say so in a small notice, e.g. "Lens/Focal changed 35mm → 50mm".
- Re-importing a shot list whose Lens/Focal differs from the board: use the existing change list (ticked by default). Accepting it changes only `board.lens`; the 3D camera keeps its focal length until the Shot Generator is opened and saved again.

### 2. Write down the project file format
**Done in v0.6.0 (2026-10-25)** — `docs/project-format.md`. `format` stays 1 (only optional fields were added: `characters`, `lenses`).

Add `docs/project-format.md` describing `project.json` inside the `.storyboard` zip: every field, its unit, the plan axes (x west→east, z north→south, y up, metres; pan 0 = north; rot 0 = facing south), and the layer and thumbnail paths. Give it a `format` number (currently 1). Raise the number on any change that breaks reading, and note it in the changelog. Claude on the chat side reads and writes this file, so the document must stay current.

### 3. Accept a starter project written by Claude
**Done in v0.6.0 (2026-10-25)** — starter files may leave out ids, layers and thumbnails, and link boards to scenes by `kohtaus` (`normalizeProject` in `js/projectfile.js`). A newer `format` is refused with the reload message. Same project on the device → *Merge* / *Keep both* / *Replace*; merge is `mergeStarter` in `js/importer.js`. It never changes the aspect ratio (listed as not merged), and drawings in the file aren't brought in. The Add menu takes body and height from `characters`; the lens buttons come from `lenses`. Test file: `samples/starter.storyboard` (built by `samples/make_starter.py`).

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
**Done in v0.6.0 (2026-10-25)** — Import → *Renumber list (.csv)…* (`js/renumber.js`). Commas, semicolons or tabs; a header row is optional. Moves are listed to confirm; all happen at once; a move onto a number that stays put is skipped and listed. A shot moves with all its boards (continuations too); touched scenes are re-sorted by Kuva #. Test file: `samples/renumber.csv`.

Shots are matched by `Kohtaus #` + `Kuva #` (verified in `importer.js`). A renumbered shot would arrive as a new empty board, and its drawing would stay on the old number (inferred from the merge rules). Import → *Renumber list…* takes a small CSV from `screenplay-revision-diff`:
```
old Kohtaus #,old Kuva #,new Kohtaus #,new Kuva #
12,3,12,4
12,4,12A,1
```
Show the moves as a list to confirm, then move the boards with all their drawings and 3D data. Apply all moves at once, so swapped numbers don't collide. Numbers that don't exist are listed and skipped.

### 5. Location files (with phase 5, floor plans)
**Done in v0.10.0 (2026-10-25)** — Shot Generator → *Set…* → *Save location file* / *Open location file…* (`js/location-file.js`; format in `docs/project-format.md`, "Location files"). The plan picture travels inside the file as a data address (`planImage`), with its two corner points. Opening one replaces room, openings, north, tag and plan; furniture only if Jarmo picks the file's. Also in v0.10.0: *Plan for Shot Designer (PNG)* from the app, following the rules below.

One file per location (proposed name `<Location>.location.json`): room, openings, furniture, north angle, tag, plus optional GPS and a plan image with two calibration points. The app imports and exports these. The chat-side floor-plan step writes them, and the same plan becomes the Shot Designer background.

## Chat side: a set and a Shot Designer plan from photos + measurements
Worked through on 2026-10-25 with a test photo (a 12 × 18 ft living room). This step runs in Jarmo's normal chat (the floor-plan / shot-planning side), not in the app: it needs the photos, his measurements and the production's folders. Claude there may use its code tool to write the files; the app only reads the result.

**Input:** one or more photos of the space, plus measurements — at least the room's width and depth (or one wall and the floor area) and the ceiling height. Measurements usually come as plain text beside the photos.

**Reading the photos:**
- Room size from the measurements; the photos give the shape, where the door(s) and window(s) are, and where the main furniture stands.
- When labels and photo disagree, say so plainly and state which reading was used (the test photo labelled both left–right lines as 12 ft and 18 ft; the room was read as 12 ft wide × 18 ft deep from the receding side walls).
- Put the main window wall at north unless the real compass direction is known (`room.north` holds the true bearing later, for sun work).
- Everything estimated from a photo is tagged **assumed**; from a scaled drawing **traced**; from a tape **measured** (SPEC §8.6 decision).
- Furniture becomes the closest library shape from `js/shotgen/catalog.js`, resized to real cm (`w`, `d`, `h`, elevation `y`). No library shape for flat things (rugs) or ceiling fixtures: leave them out and mention them in the chat.

**Output 1 — the set for the Shot Generator:** a starter `.storyboard` file (format in `docs/project-format.md`) with the location (`room`, `objects`, `tag`), one scene that uses it, and one board whose `shot3d.camera` matches the photo's viewpoint (position, height, lens) as a starting frame. Opens as a new project, or merges into the production's project when it carries that project's `id`. Once item 5 is built, the same location can travel as its own location file.

**Output 2 — the plan for Shot Designer** [Jarmo's rules, 2026-10-25]:
- **Blank:** walls, window(s) and door(s) with swing only. **No text, labels, scale bar, north arrow or furniture** — Shot Designer adds its own elements on top.
- **Cropped to the space:** the picture's edges are the room's inside faces, wall to wall, with walls drawn inside the edge. No empty area around it.
- **High resolution:** 800 px per metre (a 3.66 × 5.49 m room → 2928 × 4392 px PNG), with the density stored in the file.
- **Calibrating:** because the picture is exactly wall to wall, its width *is* the room width (and its height the depth). Give those two numbers in the chat, together with anything else worth knowing (tag, assumptions, what was left out). Extra notes go in the chat or a separate file, never on the plan.

The test run's scripts (room reading → starter file, blank plan) were small Python files using only the standard library; any equivalent is fine as long as the outputs follow the rules above.

## Storage and naming [proposed]
- The project file lives on Jarmo's Drive in the production's camera folder, e.g. `KUVAUS/Storyboard/<Project>.storyboard`. Board PNGs and the shot data sheet go beside it when exported.
- Board image names stay `<Kohtaus #>-<board>.png` (e.g. `12-3b.png`). The Daily Package matches pictures to shots by these names. Don't change the pattern without noting it here.

## Used on the chat side (no app work, for reference)
- **Daily Package:** a board picture beside each shot on the scene pages.
- **Briefs:** camera heights from the boards may flag low-mode or high-rig set-ups in the GRIP brief; the lenses per day may feed the CAM brief.
- **Checks:** shots without a board, Lens/Focal mismatches, turning-point shots without a board.
