# The `.storyboard` project file — format 1

**In plain words:** a `.storyboard` file is a zip. Inside is `project.json` (all the text and numbers), one PNG per drawn layer, and a small JPEG per board. Claude on the chat side reads it for the Daily Package and briefs, and writes *starter* files (no drawings) for the app to open. Keep this document in step with the code (`js/projectfile.js`, `js/model.js`); see `INTEGRATION.md`.

Markers: **[required]** must be present in a starter file; everything else is optional and gets a default.

## Zip contents

| Path | What |
|---|---|
| `project.json` | `{ "app": "storyboard", "format": 1, "project": { … } }` — UTF-8 JSON |
| `layers/<board id>/<layer>.png` | One per drawn layer. `<layer>` is `reference`, `fill`, `pencil`, `ink` or `notes`. Full board size: 2048 px wide × 2048 / aspect ratio high, transparent where empty. |
| `thumbs/<board id>.jpg` | 320 px wide, on white. Optional; the app makes it when the board is next saved. |
| `plans/<location id>.png` or `.jpg` | A location's floor-plan picture (see `locations[].plan`). At most 4096 px on its long side. |

Entries may be stored or deflated. A file with only `project.json` is valid (a starter file).

**`format`** is raised only when a change would stop an older app reading the file correctly; adding an optional field does not raise it. The app refuses a file whose `format` is higher than it knows ("This file is from a newer version of Storyboard — reload the app to update it"). Every raise is noted in `CHANGELOG.md`.

## Units and axes

- Lengths in the 3D set: **metres**, except item sizes, elevations, camera height and figure height, which are **centimetres** (they're typed by hand).
- Angles: **degrees**.
- Plan axes: **x** runs west → east, **z** runs north → south (north is up on the plan), **y** is up. The room's centre is (0, 0).
- Camera **pan** 0 = looking north, + turns right (clockwise seen from above). **Tilt** + = up. **Roll** + = clockwise.
- Item **rot** 0 = facing south (towards the bottom of the plan), + turns clockwise seen from above.

## `project`

| Field | Type | Meaning |
|---|---|---|
| `title` [required] | string | Project name |
| `ratio` | number | Aspect ratio, e.g. 2.39 (default 2.39). Changing it later doesn't resize drawings, so a merge never changes it. |
| `sensor` | string | Camera format id from `js/shotgen/sensors.js`, e.g. `"mlf-45k-og"` (ALEXA Mini LF 4.5K LF 3:2 Open Gate). Default `mlf-45k-og`. |
| `lenses` | number[] | The lens set in mm, shown as the Shot Generator's lens buttons. Default `[14, 18, 25, 35, 50, 85, 100, 135, 150, 180]`. |
| `characters` | object[] | `{ name, model, height }` — see below. Used by the Shot Generator's Add menu. |
| `scenes` [required] | object[] | In story order. |
| `boards` [required] | object[] | Grouped by scene, in board order. |
| `locations` | object[] | 3D sets, one per location. |
| `id` | string | Stable id; a starter file may leave it out (the app makes one). Keep it to let a later starter file *merge* into the same project. |
| `created`, `modified`, `exported` | number | Milliseconds since 1970 (`exported` null = never). Set by the app. |
| `editedSinceExport`, `firstEditSinceExport`, `importMaps`, `pdfOptions` | — | App bookkeeping; leave out of starter files. |

### `characters[]`

| Field | Meaning |
|---|---|
| `name` | As in the scenes' Henkilöt, e.g. `"A"` |
| `model` | Body: `adult-male`, `adult-female`, `teen-male`, `teen-female`, `child`, `baby` |
| `height` | cm, e.g. 182 |

### `scenes[]`

| Field | Meaning |
|---|---|
| `kohtaus` [required] | Kohtaus # as text, e.g. `"12"`, `"12A"` |
| `intExt` | `"INT"`, `"EXT"` or `"INT/EXT"` |
| `lokaatio`, `aika` | Location and time of day (shown upper-case in headings) |
| `synopsis`, `henkilot` | Text; Henkilöt as a comma list, e.g. `"A, B"` |
| `actBefore` | Act divider label shown before this scene, e.g. `"ACT 2"`; empty for none |
| `id` | Optional in starter files |
| `locationId` | Links to `locations[].id`; optional (the app also matches by `lokaatio` name) |
| `collapsed` | App state |

### `boards[]`

| Field | Meaning |
|---|---|
| `kuva` [required] | Kuva # as text |
| `sceneId` or `kohtaus` [one required] | Which scene: by the scene's `id`, or (starter files) by its `kohtaus` |
| `newShot` | `true` = starts a new shot; `false` = continues the shot before it (shown 3b, 3c). Default `true` |
| `kuvakoko`, `sisalto`, `lens`, `movement`, `notes`, `dialogue`, `action` | Text. `lens` is the shot list's Lens/Focal, e.g. `"50mm"` |
| `id` | Optional in starter files |
| `horizon` | Horizon guide, 0 = top … 1 = bottom (default 0.5) |
| `layers` | `{ reference, fill, pencil, ink, notes }`, each `{ visible, opacity (0–1), hasData }`. Leave out of starter files. |
| `shot3d` | `{ locationId, camera, figures }` — the Shot Generator's state for this board (below) |
| `camera` | Copy of `shot3d.camera`'s `height`, `tilt`, `pan`, `focal`, for the shot data sheet |

`shot3d.camera`: `{ x, z (m), height (cm), pan, tilt, roll (°), focal (mm) }`.
`shot3d.figures[]`: `{ id, kind: "figure", model, name, x, z (m), y (cm elevation), rot (°), height (cm), colour ("#rrggbb") }`.
Optional pose fields on a figure (all may be left out; the app fills defaults):
- `pose`: preset id from `POSE_ORDER` in `js/shotgen/poses.js` (`stand`, `walk`, `sitChair`, …). Default `stand`.
- `lookAt`: `""` = where the pose looks, `"camera"` = the lens, another figure's `id`, or `"point"` = `lookPoint`.
- `lookPoint`: `{ x, y, z }` in metres (world), set by dragging the head.
- `joints`: `{ <bone>: [forward, turn, side] }` in degrees, from the *Pose by hand* sliders (bone names as in `JOINTS`).
- `manual`: `{ <bone>: [x, y, z, w] }` local bone rotations (quaternions) left by dragging hands, feet, elbows and knees.
- `hipsShift`: centimetres the hips are raised (+) or lowered (−) with the feet kept planted.

### `locations[]`

| Field | Meaning |
|---|---|
| `name` | e.g. `"Keittiö"` — matched against scenes' `lokaatio` |
| `tag` | `"measured"`, `"traced"` or `"assumed"` |
| `room` | `{ exterior (bool), w, d, h (m), door, window, north (°) }` — `w` west–east, `d` north–south, `h` ceiling |
| `room.door` | `{ wall: "n"|"s"|"e"|"w", offset (m from the wall's centre, + = east or south), width, height (m) }` or null |
| `room.window` | `{ wall, offset, width, height, sill (m) }` or null |
| `objects[]` | Furniture: `{ id, kind: "object", model, x, z (m), y (cm elevation), rot (°), w, d, h (cm) }`. `model` ids are in `js/shotgen/catalog.js`, e.g. `table-sit-rectangle`. |
| `gps` | Optional, carried as given (e.g. `{ lat, lon }`); not used by the app yet |
| `plan` | Optional floor-plan picture, lined up with the room: `{ type ("image/png" or "image/jpeg"), w, h (picture px), a, b ([x, y] px: the north wall's inside NW and NE corners, y down), dist (m between a and b), x, z (m: where the picture's centre lies on the floor), rot (° the picture is turned, + clockwise seen from above) }`. The picture itself is `plans/<location id>.*` in the zip. Scale = `dist` ÷ the a–b distance in px. A merge never brings a plan picture in; open the location file for that. |
| `id` | Optional in starter files |

## Location files (`<Location>.location.json`)

One set on its own (INTEGRATION.md item 5), opened and saved from the Shot Generator's *Set…* menu. UTF-8 JSON:

```
{ "app": "storyboard-location", "format": 1,
  "location": { "name", "tag", "room", "objects", "gps"?, "plan"? },
  "planImage": "data:image/png;base64,…" }
```

Fields as in `locations[]` above (`id`s optional). `planImage` is present only with `plan`. Opening one replaces the open set's room, openings, north, tag, GPS and plan picture; furniture is replaced only if Jarmo picks the file's (asked when both have furniture). The set keeps its own name and its link to the scenes. A newer `format` is refused with the reload message.

## Starter files

A starter file is a `.storyboard` zip holding only `project.json`. Minimal example (see `samples/starter.storyboard` for the full kitchen sample):

```json
{
  "app": "storyboard",
  "format": 1,
  "project": {
    "title": "Kitchen test",
    "ratio": 2.39,
    "sensor": "mlf-45k-og",
    "characters": [{ "name": "A", "model": "adult-male", "height": 182 }],
    "scenes": [{ "kohtaus": "1", "intExt": "INT", "lokaatio": "Keittiö", "aika": "Päivä", "henkilot": "A, B", "actBefore": "ACT 1" }],
    "boards": [{ "kohtaus": "1", "kuva": "1", "kuvakoko": "WS", "lens": "25mm", "movement": "FIX", "sisalto": "Kitchen, A at the counter" }],
    "locations": [{ "name": "Keittiö", "tag": "assumed", "room": { "exterior": false, "w": 5, "d": 4, "h": 2.6, "door": { "wall": "e", "offset": 0, "width": 0.9, "height": 2.1 }, "window": { "wall": "s", "offset": 0, "width": 1.4, "height": 1.2, "sill": 0.9 } } }]
  }
}
```

### Opening a starter file

- **New project on this device:** opened as it is; boards start blank.
- **Same project already on the device** (same `id`): the app offers **Merge**, **Keep both** or **Replace**. Merge follows the shot-list re-import rules: scenes matched by `kohtaus`, boards by `kohtaus` + `kuva`; new ones added; empty fields filled; changed text listed for Jarmo to accept or keep; camera format, lens set, characters and location rooms listed the same way. Drawings, 3D cameras, figures and furniture already on the device are never touched, and drawings inside the file are not brought in by a merge.

## Board picture names

Exported board pictures are named `<Kohtaus #>-<board>.png`, e.g. `12-3b.png` (spaces and `/ \ : * ? " < > |` become `_`). The Daily Package matches pictures to shots by these names; change the pattern only together with `INTEGRATION.md`.
