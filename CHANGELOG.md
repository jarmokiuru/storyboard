# Changelog

## 2026-11-18 — Storyboard v0.23.3 (original fit, neutral crotch kept)
- Clothes are back to the v0.23.1 fit, so the figures no longer look heavier. The neutral crotch from v0.23.2 stays.

## 2026-11-18 — Storyboard v0.23.2 (neutral crotch, more relaxed clothes)
- The crotch is filled in like a stretched sheet of cloth on every body, so there is no fold or shape between the thighs. Female, male, teen and child figures all read the same there.
- Clothes are more relaxed: they stand about 3 cm off the body, and the body under them is smoothed twice as much, so less of the figure's build shows through.

## 2026-11-18 — Storyboard v0.23.1 (looser clothes, grey extras)
- Clothes sit looser, about 2 cm off the body, and the body under them is smoothed, strongly around the crotch and seat, so nothing anatomical shows through.
- Sleeves end in a straight cuff at the wrist, and trousers in a straight hem above clearly visible shoes.
- Figures without a name (extras) wear grey shirts in a few light shades, so the named characters stand out. Naming a figure gives it its character's colour; clearing the name turns it grey again. Its panel offers greys instead of colours.

## 2026-11-18 — Storyboard v0.23.0 (clothes on the figures)
- Every figure wears plain clothes: a long-sleeved shirt in the character's colour, grey trousers and dark shoes. Head, neck and hands stay a light clay skin.
- The clothes move with every pose and with dragging the limbs. They stand slightly off the body and add nothing to draw, so the 2017 Mac is no slower.
- The selection highlight and Outline shading work as before.

## 2026-11-18 — Storyboard v0.22.0 (one 3D space per scene)
- **Shared blocking:** the figures belong to the scene. Every board of the scene sees the same actors, so move an actor once and every camera sees it.
- **This board only:** tick it in a figure's panel and that board keeps its own position and pose for the figure, for actors who move during the scene. Untick it to follow the shared blocking again.
- **Cameras:** a row at the top of the Shot Generator panel lists the scene's boards (keys 1–9 on the Mac). Tap one to look through that board's camera. Each board keeps its own camera and light, even without saving a picture. A board not framed yet starts from the camera you came from, on its shot-list lens.
- **Update pictures:** a yellow dot marks a board whose 3D picture is out of date (blocking, camera, light, set or colours changed) or that has a camera but no picture yet. One button saves fresh pictures to all of them. Photos on the reference layer are never replaced.
- **One colour per character:** a named figure (e.g. A) has the same colour in every scene and board. Change it in the figure panel and it changes everywhere.
- Leaving the Shot Generator lands on the board you last looked through.
- Board editor panel: the Boards buttons sit in two columns, and every section title sits on its own line above the section.
- Scenes framed before this version: the shared blocking is taken from the last board with figures. Boards whose figures differed keep them as *This board only*, so their pictures can be made again as they were.

## 2026-11-18 — Storyboard v0.21.0 (shot list in the panel)
- The board editor's right-hand panel starts with the slugline and the shot, e.g. "8. INT POLICE STATION - PRESS ROOM - LATER / Shot 1a".
- New **Shot list** section: every shot of the scene with its Kuvakoko and Sisältö. Tap one to jump to its first board. The current shot is highlighted, and a shot with several boards shows the count, e.g. "2 (3)".
- Every panel section (Shot list, Shot details, Boards, Layers, Reference) folds with a tap on its title. The app remembers which are folded on that device.
- Board names: a shot with several boards is now 1a, 1b, 1c (before: 1, 1b, 1c). A shot with one board stays 1. This shows everywhere: strip, panel, PDF, picture names (e.g. 8-1a.png), shot data sheet.

## 2026-11-18 — Storyboard v0.20.0 (change the aspect ratio)
- In the editor, tap the project title in the top bar (it now shows ▾) to open **Project**: rename the project or change its aspect ratio.
- Changing the ratio reshapes every board. Boards stay 2048 px wide and drawings stay centred. A taller frame adds blank space above and below; a shorter frame cuts the same amount off the top and bottom, and the app warns with the amount before it does that. Horizon lines keep their place on the drawing, and thumbnails are made again.
- Saved 3D pictures are reshaped the same way; save again from the Shot Generator for a full new frame.

## 2026-11-18 — Storyboard v0.19.0 (several openings)
- A room can now have any number of doors, windows and **panels**. A panel is a flat piece on a wall, such as a projection screen or a whiteboard. It is not a hole.
- Set… → *Room size and openings…* lists them all. + Door, + Window and + Panel add one, and ✕ removes one. Each has a wall, offset, width, height and sill (a door has no sill).
- In 3D, doors and windows are holes and a panel is a pale board on the wall. In the top view a panel shows as an orange strip inside the wall.
- The Shot Designer plan draws every door and window. It leaves the wall solid behind a panel.
- Older rooms, project files and location files keep their one door and one window: they are read into the new list.

## 2026-11-18 — Storyboard v0.18.4
- Opening a project file in Safari on the Mac: the drawings are now copied out of the file before they are saved. v0.18.3 showed "Couldn't open the file: null" there, meaning the Mac's storage stopped the save without saying why.
- If storage ever stops a save again, the message names what it was saving instead of "null".

## 2026-11-18 — Storyboard v0.18.3
- Opening a project file now always says what is happening: "Opening …" as soon as the file is picked, then either the result or the reason it failed (including an empty file, e.g. one still waiting in iCloud Drive). Before, some failures showed nothing at all.

## 2026-11-18 — Storyboard v0.18.2
- Shot Generator: the arrow keys now pan (← →) and tilt (↑ ↓) the camera, smoothly while held, Shift for faster. W A S D still move the camera, R / F still raise and lower it.

## 2026-11-18 — Storyboard v0.18.1
- Tool samples are narrower (about two thirds of the button).
- Every drawing tool now has the same nine colours: five greys plus the note pen's red, orange, blue and green. The note pen still starts on red; keys 8 / 9 / 0 pick the three darkest greys.

## 2026-11-17 — Storyboard v0.18.0 (tool samples)
- Each drawing tool's button shows a small sample stroke under its name, drawn with the tool itself in its current colour and size: the Pencil tipped over in the middle (tilt widens the soft tools) and a quick flick at the end (speed thins it). The eraser shows a cut through grey. The samples change when you pick another colour or size.

## 2026-11-17 — Storyboard v0.17.1
- Shot Generator: Cmd-B, Cmd-D and Cmd-K now work right after typing in one of the panel's number boxes (e.g. the elevation); before, the keys stayed in the box and nothing happened.

## 2026-11-17 — Storyboard v0.17.0 (Shot Generator keys)
- Shot Generator keys now follow Storyboarder's: **T** top view ↔ camera view, **[** wider lens / **]** longer lens (steps through the lens set), **Cmd-D** duplicate the chosen piece or figure (half a metre to the side), **Cmd-B** drop it to the floor, **Cmd-K** switch Clay ↔ Outline. Already there: W A S D / arrows, R / F, Shift, Z / X roll, Backspace delete, Esc.
- The key list under the Shot Generator panel lists them all.

## 2026-11-17 — Storyboard v0.16.1
- iPad colour pick works with a held finger: the iPad reports a held fingertip as wider than a tap, and v0.16.0 took it for a resting hand. A palm still doesn't pick.
- Pencil log: wide touches now show their size ("up to 64 px wide") instead of "cancelled by the iPad".

## 2026-11-17 — Storyboard v0.16.0 (leftovers)
- Undo now survives switching boards: each board keeps its own undo history while the project is open. Go back to a board and Undo takes back what you last did there. Leaving the project, or a very long session, clears the oldest steps.
- iPad colour pick: touch and hold one fingertip on a mark for about half a second. The current drawing tool takes that colour ("Colour picked"). On blank paper it says there's no colour there. A quick tap or a resting hand doesn't pick.
- Contact sheet PDF: *Only these shots* — print single shots from the ticked scenes, e.g. `3, 4b, 7-9`, or `12/3` for Kohtaus 12, Kuva 3. Empty prints them all, as before.
- Contact sheet PDF: act dividers print in front of the scene heading they come before ("ACT 1 · 1. INT. KEITTIÖ – PÄIVÄ").

## 2026-11-17 — Storyboard v0.15.1
- iPhone: after turning the phone back upright, the top bar (with *‹ Projects*) no longer slides under the clock and Wi-Fi symbols.

## 2026-11-15 — Storyboard v0.15.0 (iPhone viewing)
- On the iPhone a project opens in a viewer instead of the board editor: one board at a time, big, with the scene heading, Kuva #, Kuvakoko · Lens · Movement and the Sisältö, dialogue, action and notes underneath.
- Swipe left or right, or tap the frame's left or right edge, to move between boards; ‹ › buttons do the same. Tap the middle of the frame for the frame alone; tap again to bring the details back.
- Turn the phone on its side: frame on the left, details on the right.
- *Boards* shows every board under its scene heading (with act dividers); tap one to open it. A scene menu jumps to a scene.
- The viewer never changes the project. *New project* is hidden on the phone; *Import project file* and *Delete* stay.

## 2026-11-15 — Storyboard v0.14.1
- Outline lines a little thinner (about 2.8 px on a full-size board, was 3.4).

## 2026-11-15 — Storyboard v0.14.0 (outline shading)
- Shot Generator: *Shading* — **Clay** (as before) or **Outline**, Storyboarder's default look: black edge lines around figures and furniture, in the camera view and on the saved board, so the frame reads more like a drawing. Posed figures keep their lines. The room keeps its own thin edge lines.
- The choice is one setting for the whole project.

## 2026-11-15 — Storyboard v0.13.0 (diffusion, walls block the sun)
- *Diffusion* in the Light section: 0 % = hard sun, 100 % = overcast — shadow edges soften (up to about 15 cm in a room) and fade, and part of the sun's light goes into the fill.
- *Walls block the sun* (tick box under the light sliders): walls and ceiling cast shadows, so the sun gets in only through the window and door — a sun patch on the floor, the rest of the room on fill. Off by default, as before.
- Both are saved with the board and carried through the scene like the other light settings.

## 2026-11-15 — Storyboard v0.12.0 (light)
- The Shot Generator's *Sun* row is now a *Light* section, modelled on Storyboarder's World panel: **Sun** (direction), **Height** (5–90° above the horizon; low sun = long shadows), **Strength** (sun brightness), **Fill** (ambient light: how bright the shadow side is) and **Outside** (brightness of the sky seen through windows or behind an exterior). Each has ↺ to go back.
- *Outside* changes only what the lens sees; the top and orbit views keep their usual background.
- All light settings are saved with the board and carried to new boards in the same scene, like the sun direction.

## 2026-11-15 — Storyboard v0.11.0 (sun direction)
- Shot Generator: a *Sun* dial under *Reset camera* turns the sun all the way round (0° = from north, 90° = from east), always 45° up. Figures and furniture cast shadows, so the direction reads in the frame and in the saved board. A yellow arrow outside the room in the top view shows where the light comes from.
- Each board keeps its own sun; a board that hasn't been in the Shot Generator yet starts from the previous board's sun in the same scene.
- Walls don't block the sun (yet), so the light always reaches the people, inside or out.

## 2026-11-15 — Storyboard v0.10.2
- *Plan for Shot Designer* is now 125 px per metre (was 150): it opens at 1.25 × true size; scale it to 80 % to match Shot Designer's props.
- Fix: the Shot Generator's picture could come out stretched wide (seen on the iPad). The 3D view now re-measures itself whenever its area on screen changes, and checks again before every frame.

## 2026-11-15 — Storyboard v0.10.1
- *Plan for Shot Designer* is now 150 px per metre (was 800). Shot Designer reads small pictures at 100 px/m = true size and shrinks big ones, so the 800 px/m plans opened far too big. 150 px/m opens at 1.5 × true size, with room around the objects; scale it to 67 % to match Shot Designer's props. The density is in the file name, and rooms over about 9 m get fewer px/m so Shot Designer never shrinks them.
- New *Plan for Shot Designer, sharp (800 px/m)* for crisp lines when you scale by hand.

## 2026-10-25 — Storyboard v0.10.0 (phase 5: floor plans)
- Shot Generator → *Set…* is now a menu: room size, door and window; plan picture; plan for Shot Designer; location files.
- **Plan picture:** pick a picture of the plan, tap the inside corners at both ends of the north wall, type that wall's length. The picture is scaled, turned and lined up with the room, and shows under the top and orbit views (never in the saved frame). Zoom 2× / 4× and drag the markers to be exact. *Line up the plan again* and *Remove plan picture* are there too.
- **Plan for Shot Designer (PNG):** blank walls, windows and doors with their swing, cropped wall to wall, 800 px per metre stored in the file. Size and tag are in the file name, nothing is written on the plan.
- **Location files:** save a set (room, furniture, plan picture) as `<Location>.location.json`, and open one into another project's set. You choose whose furniture to keep.
- Project files now carry the plan pictures (`plans/` in the zip).

## 2026-10-25 — Storyboard v0.9.1
- CU is tighter: the face only, crown just trimmed, cut under the chin (it was too close to MCU).

## 2026-10-25 — Storyboard v0.9.0 (phase 4, step 4: shot sizes)
- Shot-size buttons at the top of the Shot Generator panel: ECU, CU, MCU, MS, MLS, LS, WS, EWS. With a figure chosen (or the only figure on the board), the camera moves to the distance that gives that framing with the current lens, keeping its pan and height and tilting to the frame's middle. Works with any pose, since the cuts follow the figure's own head, chest, waist and knees.
- The button matching the board's Kuvakoko from the shot list has a dashed outline.
- If the framing needs the camera outside the room, a note says so (choose a wider lens or turn the camera).
- "Show speed" at the bottom of the panel puts frames per second in the readout while something moves (for the 2017 Mac check; the target is 20 or more).

## 2026-10-25 — Storyboard v0.8.0 (tap-and-drag posing)
- Tap a figure in the camera or orbit view and dots appear on it. Drag a hand or foot and the whole limb follows; drag an elbow or knee to bend it; drag the blue hip dot down to crouch or sit lower with the feet kept on the floor; drag the white head dot to turn the eye-line (Looks at then reads "Where the head was dragged").
- The dots never appear in the saved board.
- Choosing a new pose starts clean. "Undo all hand posing and dragging" removes slider turns and dragged changes alike.
- `docs/project-format.md` now lists the figure pose fields (`pose`, `lookAt`, `lookPoint`, `joints`, `manual`, `hipsShift`).

## 2026-10-25 — Storyboard v0.7.1
- Fix: the Export menu didn't open (since v0.5.3). Adding *Save as new board* had accidentally removed the contact-sheet PDF function, and the menu stopped at that point. Contact sheet PDF and Cmd-P / Cmd-Shift-P work again.

## 2026-10-25 — Storyboard v0.7.0 (phase 4, step 3: poses)
- Figures take poses: stand, stand with weight on one leg, walk, sit on a chair, sit on the floor, lie on the back, lie on the side, kneel on one knee, lean on a table, arms crossed, point, phone to ear, look over the shoulder. Authored here for every body type and height.
- Looks at: a figure's head turns to the lens or to another figure, and follows when they move.
- Pose by hand: choose a joint (back, neck, head, arms, hands, legs, feet) and turn it with Forward / Turn / Side sliders; "Undo all hand posing" goes back to the pose.

## 2026-10-25 — Storyboard v0.6.0 (INTEGRATION.md items 2–4)
- Project file format written down in `docs/project-format.md` (format 1), so the chat side can read and write `.storyboard` files.
- Starter projects: a `.storyboard` file with no drawings (scenes, shots, lenses, characters, sets) opens as a new project; ids, layers and thumbnails may be left out. A file from a newer version is refused with "reload the app".
- Importing a project that's already on the device now offers **Merge**, next to Keep both and Replace: new scenes and shots added, empty fields filled, changed text, camera format, lens set, characters and set sizes listed to accept or keep. Drawings, 3D cameras, figures and furniture on the device are never touched; the aspect ratio is never changed by a merge.
- The Shot Generator's Add menu uses the project's characters (body and height, e.g. A 182 cm); its lens buttons use the project's lens set when there is one.
- Import → **Renumber list (.csv)…**: moves shots to new Kohtaus # / Kuva # numbers with all their drawings and 3D, all at once so swapped numbers don't collide; clashes and unknown numbers are listed and skipped.
- Sample files: `samples/starter.storyboard`, `samples/renumber.csv`.

## 2026-10-25 — Storyboard v0.5.4
- Lens/Focal and the 3D camera now agree (INTEGRATION.md item 1). The Shot Generator opens a board that has no 3D camera yet on the shot list's lens ("50mm", "Z 50mm", "Cooke S4 32mm T2" → 50 / 32 mm; a zoom "24-70mm" starts at 24 mm and shows the range in the readout). Saving with a different focal length updates the board's Lens/Focal to e.g. "85mm" and says so ("Lens/Focal changed 50mm → 85mm"). A zoom's text stays when the focal length is inside its range.

## 2026-10-25 — Storyboard v0.5.3
- Shot Generator: **Save as new board** puts the camera view on a new board right after the current one, as the next shot (next Kuva #), and keeps you in the Shot Generator on that new board — frame the next angle and save again. Like Storyboarder's "insert as new shot".

## 2026-10-25 — Storyboard v0.5.2
- ↺ next to every camera slider (height back to 150 cm, pan/tilt/roll to 0°) and every value of a chosen piece or figure (size back to the model's own, elevation and turn to 0).
- Elevation for furniture and figures, in cm above the floor (0 = on the floor; −100 to +300).
- Dragging a slider no longer scrolls the side panel; panels don't bounce at their ends.
- Focus button in the Shot Generator hides its panel for a bigger view, like Focus in the board editor.
- Buttons are easier to tell apart: grouped with thin dividers, each with a faint edge, a hover and a press effect; Camera/Top/Orbit and other either-or choices read as one joined switch.

## 2026-10-25 — Storyboard v0.5.1
- Camera view: dragging now moves the picture with your finger — drag right and the camera pans left, drag up and it tilts down.
- Typing a size no longer deletes the piece: the panel used to redraw after every digit, so the next Backspace landed on "delete". It now stays put while you type.
- Every number for a chosen piece or figure has its own slider, plus ↑/↓ in the box (Shift = 10 at a time) and scrolling over the row. Camera sliders also take scrolling and, once tapped, the arrow keys.
- The small plan in the corner of the camera view works like the Top view: drag furniture, figures or the camera there. Tapping an empty part still swaps the views.
- Grabbing on a small plan prefers furniture over the camera's aim point, and touches always use the current layout.

## 2026-10-24 — Storyboard v0.5.0 (board keys like Storyboarder; Shot Generator step 2: furniture and figures)
- Board editor keys now match Storyboarder 3.0: 1 light pencil, 2 brush, 4 pencil, 5 pen, 6 note pen, 7 eraser (3 is Storyboarder's tone tool, not built); 8/9/0 tool colours; N new board, Shift-N new board before, D duplicate, / toggle new shot, Alt-←/→ move board, Cmd-←/→ previous/next scene, O onion skin, Tab cycle view, Backspace clear all drawing layers (one undo brings them back), Alt-Backspace clear the active layer, Alt-drag quick erase, Cmd-0 / Cmd-+ / Cmd-- zoom, Cmd-P contact sheet, Cmd-Shift-P blank worksheet, Cmd-Backspace delete board. Cmd-K lists all keys. Colour pick moved to holding I and clicking (Alt now erases, as in Storyboarder).
- Shot Generator: Add menu with the figures named in the scene's Henkilöt, any other figure (body type and height in cm), and 37 pieces of furniture and props.
- Furniture belongs to the set: placed once, it's there for every scene at that location. Width, depth and height can be typed in cm.
- Figures belong to the board; a new board starts with the previous board's figures. Each figure has a name and colour tag, shown on the plan.
- Tap something to choose it; drag it in the top view to move it; Turn slider; Delete (or Backspace on the Mac). The readout shows the camera-to-subject distance for a chosen figure.
- Pinch fix: lifting one finger before the other no longer makes the view jump or the lens snap to its widest.
- The 2017 Mac draws lighter figures (detail level 2), the iPad full detail.

## 2026-10-24 — Storyboard v0.4.2
- Shot Generator zoom: pinch or scroll in the camera view zooms the lens (focal length); in the top and orbit views it zooms the view.
- Camera moves with W/A/S/D or the arrow keys, smoothly while held, R/F up and down, Shift faster — as in Storyboarder's Shot Generator. Keys keep working after touching a slider or lens button.
- Lens buttons are your set: 14, 18, 25, 35, 50, 85, 100, 135, 150, 180 mm. New cameras start on 35 mm.

## 2026-10-24 — Storyboard v0.4.1
- Updates now always download fresh files. Before, the offline copy could be built from files Safari had kept from the previous version (GitHub Pages lets it keep them 10 minutes), so Reload could bring back the old version. Same fix in the pencil test (v0.1.1).

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
