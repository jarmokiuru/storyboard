# Project note for Claude

Read this first in every session, then `SPEC.md`. Update the **Decisions** and **Status** sections at the end of every session that changes something.

## What this is
An offline storyboard app for Jarmo Kiuru, a cinematographer, modelled on Wonder Unit's Storyboarder. Installed from GitHub Pages to his iPad home screen. Full requirements: `SPEC.md`.

## Talking to Jarmo
- Open with the point in plain language, 1–2 sentences, saying what it means for him. Then the reasoning, short.
- Film and cinematography terms are fine. Avoid programming terms, or explain each in everyday words the first time.
- One idea per sentence. No preamble, no flattery.
- Flag wrong premises directly. Mark what is verified, inferred or unverified.
- He tests on the iPad. After each change, tell him exactly what to try and what he should see.
- Chat in English unless he writes in Finnish.

## Standing rules
- **Offline first.** No network requests at runtime except the update check. Every library is vendored in `vendor/` with its licence noted in `vendor/LICENSES.md`.
- **No project data in the repository.** Boards live on his devices only. `samples/` holds generic test material only.
- **Never write his `Shot List.xlsx` or `Breakdown.xlsx`.** The app exports a separate shot data sheet; merging is done elsewhere.
- **Re-imports merge, never wipe.** Drawings and 3D data survive any import.
- **Two test machines:** iPad Air 11-inch (M3) in Safari and the 2017 MacBook Pro (dual-core Intel i5, macOS 13.7). If it is slow on the Mac, it is a bug.
- **Storyboarder's main repository has no licence file** — copy its ideas and layout, not its code or data. The model library (`wonderunit/shot-generator-models`) is MIT and may be used.
- Bump the version number shown in the app with every change Jarmo will test, and add a line to `CHANGELOG.md`.
- Keep files small and named plainly so a later session can find things.

## Decisions (do not change without asking)
- 2026-10-23 — Model the tools, functions and UI on Storyboarder as closely as practical.
- 2026-10-23 — Must work with no signal (planes, locations). Installed web app + offline cache.
- 2026-10-23 — Contact-sheet PDF with adjustable boards per page.
- 2026-10-23 — Pencil drawing on top of any frame, including 3D renders.
- 2026-10-23 — No animatics for now.
- 2026-10-23 — Scene headings come from his Breakdown.xlsx (pasted script as fallback); boards carry `Kuva #` from Shot List.xlsx.
- 2026-10-23 — One floor plan per location, used both for the 3D set and as a Shot Designer background; each plan tagged measured / traced / assumed.
- 2026-10-23 — Test with the generic kitchen in `samples/`, not a real production.
- 2026-10-23 — Moving work between devices is by exported project file, not live sync.
- 2026-10-23 — Line weight comes from tilt and stroke speed (his Apple Pencil (USB-C) has no pressure). If a pen reports varying pressure (e.g. a Pencil Pro), use pressure automatically, no setting needed.

## Status
- 2026-10-23 — Spec written.
- 2026-10-23 — Phase 1 pencil test built (`pencil-test/`, v0.1.0) on branch `phase-1-pencil-test`. Checked in a desktop browser with simulated Pencil input: pressure width, tilt shading and palm rejection work. Not yet checked: real Apple Pencil, offline copy (the test browser blocks it), home-screen mode. Needs GitHub Pages switched on (Settings → Pages → main, root). Home-screen exemption from Safari's 7-day storage deletion: inferred from WebKit statements (2020) and a WebKit bug comment (2021), no formal Apple doc found; the page shows whether storage is promised. Safari 18.2+ gives extra Pencil samples between frames; those samples lack pointer IDs, so the code reads them from the parent event. Now live on GitHub Pages and merged to main.
- 2026-10-23 — iPad results (Safari 27.0.1, reports a Mac user agent): Pencil sends ~250 samples/s; input delay 3–4 ms (to the page only, not to the pixels); tilt reads 6°–68°; palm rejection worked (16 and 27 touches ignored); offline copy saved; prediction feels good. Storage promised as a home-screen app, not promised as a Safari tab — so the app must run from the home screen. **Pressure stuck at 0.30 in both modes**: Jarmo uses an Apple Pencil (USB-C). Verified on apple.com/apple-pencil (2026-10-23): no pressure sensitivity; has tilt sensitivity and hover. Safari reports a fixed 0.30 for it. Line-weight decision recorded above.
- 2026-10-23 — Phase 2 built (v0.2.0), app at the site root, pencil test kept at `pencil-test/`. Checked in a desktop browser with simulated input: drawing on all tools and layers, tilt widening, numbering 1 / 1b / 2, two-finger-tap undo, saving and reload, guides and onion skin, scene add/edit/delete, project file export → re-import as a copy, iPad portrait layout. Not yet checked on the iPad: real Pencil feel, offline copy (the test browser blocks it), share sheet saving, Pencil hover ring (unverified whether Safari passes hover to web pages), performance on the 2017 Mac.
  - Code map: `js/main.js` start-up; `projects-screen.js`; `editor-screen.js` wires everything; `board-view.js` canvas, input, gestures; `brush.js` tools and line weight; `history.js` undo; `guides.js`; `strip.js`; `panel.js`; `db.js` IndexedDB; `board-store.js` layer images; `projectfile.js` + `zip.js` the .storyboard file; `ui.js` dialogs/menus; `offline.js` + root `sw.js` offline copy. Version lives in `js/version.js` AND `sw.js` — bump both, and list new files in `sw.js`.
  - No outside libraries yet: the .storyboard zip is written by our own small `js/zip.js` (stored, uncompressed; PNGs are already compressed) instead of JSZip, so there is no `vendor/` folder yet.
  - Left for later: long-press colour pick on iPad (Option-click works on the Mac); undo history resets when switching boards; act dividers arrive with the imports in phase 3. Keys N = new shot, Shift-N = new board in the same shot (our choice; Storyboarder's exact mapping unverified).
- 2026-10-23 — iPad test of v0.2.0: undo taps, numbering, reorder, onion skin, export to Files and aeroplane mode all work. Tipping didn't widen the line, and a resting palm still caused marks; no hover ring (Jarmo thinks hover may be off in his Pencil settings — unverified). v0.2.1 fixes the likely causes (inferred, not seen on the device): Safari's coalesced samples carry a placeholder upright angle (now borrowed from the parent event), and a palm landing before the nib was panning the board under the line (palm touches are now dropped once the Pencil lands). If the palm still marks, ask exactly what he sees: its own marks, or the board shifting.
- 2026-10-23 — Jarmo asked for the contact-sheet PDF before the imports. Phase 3 built (v0.3.0). Checked in a desktop browser: PDFs at 1, 4, 6, 12 per page, custom 2×5 on Letter, portrait and landscape, DRAFT mark and blank worksheet, rendered with macOS `sips` and looked at — Finnish letters print correctly. Imports pass SPEC §10 checks 2–4 with `samples/`: breakdown + shot list → 3 scenes with the right headings (plus the ACT 1 divider) and 10 boards with the right Kuva #; `script.fountain` alone → the same 3 headings; re-importing a changed shot list lists the changes, keeps drawings and adds no boards. Not yet checked on the iPad: saving the PDF through the share sheet, picking .xlsx/.fountain files from Files, print quality on paper.
  - New files: `js/pdf.js` (our own PDF writer: built-in Helvetica, JPEG pictures; text widths measured with the device's Helvetica), `js/contact-sheet.js`, `js/xlsx.js` (reads the first sheet), `js/importer.js` (column matching, merge plans, review dialog), `js/script.js` (scene headings, synopsis, speaking characters).
  - Merge rules as built: empty incoming values never overwrite; filling an empty field happens without asking; changed non-empty text is listed (ticked by default, untick to keep the app's value); a shot whose scene isn't in the project is listed and skipped; a scene's untouched starter board takes the shot list's first shot.
  - Data additions: `board.sisalto` (Sisältö), `scene.actBefore` (act divider label shown before that scene), `project.importMaps`, `project.pdfOptions`.
  - Left for later: choosing individual boards (rather than whole scenes) for the PDF; act dividers are not printed in the PDF; the shot data sheet export (.xlsx/.csv, SPEC §5) is still to do — it belongs to phase 3.
  - Next: Jarmo's iPad test of v0.3.0, then the shot data sheet, then phase 4 (Shot Generator).
- 2026-10-23 — iPad test of v0.3.0: tilt now widens the line; PDF, blank worksheet, imports from Files and "nothing new" on re-import all work. Palm answer was "still able to draw" — ambiguous, asked whether the palm still leaves marks. Jarmo asked for a bigger frame: v0.3.1 adds Hide panel (P) and Focus (F, hides panel and strip); checked at 1180×820, frame 746 → 1019 pt wide. Next: settle the palm question, then the shot data sheet, then phase 4.
- 2026-10-23 — iPad test of v0.3.1: Hide panel and Focus work; palm rejection now works (he can rest his hand and draw around it). 2–3 strokes produced no line — cause unknown on the device. v0.3.2 covers both likely causes: a lost stroke end blocking the next stroke (now finished on the next pen-down or lostpointercapture), and a settling hand read as a two-finger undo tap (taps now need both fingertips within 120 ms and contacts under 40 px; whether Safari reports contact size is unverified). Next: his test of v0.3.2, then the shot data sheet, then phase 4.
- 2026-10-23 — v0.3.2 on the iPad: some strokes still never appear (not undone). Cause unknown; v0.3.3 adds a Pencil log (`js/pencil-log.js`, Guides → Pencil log…) recording pointer down/move counts/up/cancel/lost capture, palm and undo decisions, pointer-ID mismatches and any error inside the handlers. Next: read Jarmo's log from a missed stroke before changing drawing code again.
